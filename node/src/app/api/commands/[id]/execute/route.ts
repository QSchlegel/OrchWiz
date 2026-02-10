import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { executeCommandWithPolicy } from "@/lib/execution/command-executor"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { recordCommandExecutionSignal } from "@/lib/agentsync/signals"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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

    let effectiveSubagentId: string | null = null
    if (requestedSubagentId) {
      const subagent = await prisma.subagent.findUnique({
        where: { id: requestedSubagentId },
        select: { id: true },
      })
      if (!subagent) {
        return NextResponse.json({ error: "subagentId does not exist" }, { status: 400 })
      }
      effectiveSubagentId = subagent.id
    }

    const startedAt = new Date()
    const execution = await prisma.commandExecution.create({
      data: {
        commandId: id,
        sessionId,
        subagentId: effectiveSubagentId,
        userId: session.user.id,
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
        userId: session.user.id,
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
    console.error("Error executing command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
