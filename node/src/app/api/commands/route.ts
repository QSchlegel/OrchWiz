import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const teamId = searchParams.get("teamId")
    const isShared = searchParams.get("isShared")
    const includeForwarded = searchParams.get("includeForwarded") === "true"
    const sourceNodeId = searchParams.get("sourceNodeId")

    const where: any = {
      OR: [
        { isShared: true },
        { teamId: teamId || null },
      ],
    }

    if (isShared === "true") {
      where.isShared = true
    }

    const commands = await prisma.command.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            executions: true,
          },
        },
      },
    })

    if (!includeForwarded) {
      return NextResponse.json(commands)
    }

    const forwardedEvents = await prisma.forwardingEvent.findMany({
      where: {
        eventType: "command_execution",
        ...(sourceNodeId
          ? {
              sourceNode: {
                nodeId: sourceNodeId,
              },
            }
          : {}),
      },
      include: {
        sourceNode: true,
      },
      orderBy: {
        occurredAt: "desc",
      },
      take: 100,
    })

    const groupedForwarded = new Map<
      string,
      {
        id: string
        name: string
        description: string | null
        scriptContent: string
        path: string | null
        isShared: boolean
        createdAt: Date
        _count: { executions: number }
        isForwarded: boolean
        sourceNodeId: string
        sourceNodeName: string | null
      }
    >()

    for (const event of forwardedEvents) {
      const payload = (event.payload || {}) as Record<string, unknown>
      const name =
        (typeof payload.commandName === "string" && payload.commandName.trim()) ||
        (typeof payload.name === "string" && payload.name.trim()) ||
        "forwarded-command"
      const key = `${event.sourceNode.nodeId}:${name}`
      const existing = groupedForwarded.get(key)
      if (existing) {
        existing._count.executions += 1
        continue
      }

      groupedForwarded.set(key, {
        id: `forwarded-${event.id}`,
        name,
        description:
          (typeof payload.description === "string" && payload.description) ||
          `Forwarded from ${event.sourceNode.name || event.sourceNode.nodeId}`,
        scriptContent:
          (typeof payload.scriptContent === "string" && payload.scriptContent) ||
          "",
        path: (typeof payload.path === "string" && payload.path) || null,
        isShared: true,
        createdAt: event.occurredAt,
        _count: { executions: 1 },
        isForwarded: true,
        sourceNodeId: event.sourceNode.nodeId,
        sourceNodeName: event.sourceNode.name,
      })
    }

    const combined = [...commands, ...groupedForwarded.values()].sort((a: any, b: any) => {
      const aDate = new Date(a.createdAt || 0).getTime()
      const bDate = new Date(b.createdAt || 0).getTime()
      return bDate - aDate
    })

    return NextResponse.json(combined)
  } catch (error) {
    console.error("Error fetching commands:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, scriptContent, path, isShared, teamId } = body

    if (!name || !scriptContent) {
      return NextResponse.json(
        { error: "Name and scriptContent are required" },
        { status: 400 }
      )
    }

    const command = await prisma.command.create({
      data: {
        name,
        description,
        scriptContent,
        path,
        isShared: isShared || false,
        teamId: teamId || null,
      },
    })

    return NextResponse.json(command, { status: 201 })
  } catch (error) {
    console.error("Error creating command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
