import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { executeCommandWithPolicy } from "@/lib/execution/command-executor"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { recordCommandExecutionSignal } from "@/lib/agentsync/signals"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const body = await request.json()
    const sessionId = typeof body?.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : null
    const requestedSubagentId =
      typeof body?.subagentId === "string" && body.subagentId.trim() ? body.subagentId.trim() : null

    const command = await prisma.command.findUnique({
      where: { id },
    })

    if (!command) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 })
    }

    assertCanReadOwnedResource({
      actor,
      ownerUserId: command.ownerUserId,
      isShared: command.isShared,
      allowSharedRead: true,
      notFoundMessage: "Command not found",
    })

    let effectiveSubagentId: string | null = null
    if (requestedSubagentId) {
      const subagent = await prisma.subagent.findUnique({
        where: { id: requestedSubagentId },
        select: {
          id: true,
          ownerUserId: true,
          isShared: true,
        },
      })
      if (!subagent) {
        return NextResponse.json({ error: "subagentId does not exist" }, { status: 400 })
      }

      assertCanReadOwnedResource({
        actor,
        ownerUserId: subagent.ownerUserId,
        isShared: subagent.isShared,
        allowSharedRead: true,
        notFoundMessage: "subagentId does not exist",
      })

      effectiveSubagentId = subagent.id
    }

    const startedAt = new Date()
    const execution = await prisma.commandExecution.create({
      data: {
        commandId: id,
        sessionId,
        subagentId: effectiveSubagentId,
        userId: actor.userId,
        status: "running",
        startedAt,
      },
    })

    const result = await executeCommandWithPolicy(command, { subagentId: effectiveSubagentId })
    const completedAt = new Date()
    const duration = Math.max(result.durationMs, completedAt.getTime() - startedAt.getTime())

    const updatedExecution = await prisma.commandExecution.update({
      where: { id: execution.id },
      data: {
        status: result.status === "completed" ? "completed" : "failed",
        output: result.output || null,
        error:
          result.error ||
          (result.status === "blocked"
            ? "Execution blocked by policy"
            : null),
        completedAt,
        duration,
      },
    })

    publishRealtimeEvent({
      type: "command.executed",
      userId: actor.userId,
      payload: {
        executionId: updatedExecution.id,
        commandId: id,
        sessionId,
        subagentId: effectiveSubagentId,
        status: updatedExecution.status,
      },
    })

    if (effectiveSubagentId) {
      void recordCommandExecutionSignal({
        userId: actor.userId,
        subagentId: effectiveSubagentId,
        sourceId: updatedExecution.id,
        status: result.status,
        durationMs: result.durationMs,
        metadata: {
          commandId: id,
          permission: result.permission,
        },
      }).catch((signalError) => {
        console.error("AgentSync command signal record failed:", signalError)
      })
    }

    return NextResponse.json({
      ...updatedExecution,
      policy: result.permission,
      effectiveSubagentId,
      blocked: result.status === "blocked",
      metadata: result.metadata,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error executing command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
