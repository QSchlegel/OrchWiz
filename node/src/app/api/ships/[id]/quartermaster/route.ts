import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  getShipQuartermasterState,
} from "@/lib/quartermaster/service"
import {
  QUARTERMASTER_CALLSIGN,
  QUARTERMASTER_CHANNEL,
  QUARTERMASTER_RUNTIME_PROFILE,
} from "@/lib/quartermaster/constants"
import {
  executeSessionPrompt,
  SessionPromptError,
} from "@/lib/runtime/session-prompt"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildShipContext(state: NonNullable<Awaited<ReturnType<typeof getShipQuartermasterState>>>, crewCount: number) {
  return {
    shipDeploymentId: state.ship.id,
    shipName: state.ship.name,
    status: state.ship.status,
    nodeId: state.ship.nodeId,
    nodeType: state.ship.nodeType,
    deploymentProfile: state.ship.deploymentProfile,
    healthStatus: state.ship.healthStatus,
    lastHealthCheck: state.ship.lastHealthCheck,
    crewCount,
  }
}

async function listSessionInteractions(sessionId: string) {
  return prisma.sessionInteraction.findMany({
    where: {
      sessionId,
    },
    orderBy: {
      timestamp: "asc",
    },
    take: 250,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const state = await getShipQuartermasterState({
      userId: session.user.id,
      shipDeploymentId: id,
    })

    if (!state) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    const interactions = state.session
      ? await listSessionInteractions(state.session.id)
      : []

    return NextResponse.json({
      ...state,
      interactions,
    })
  } catch (error) {
    console.error("Failed to load ship quartermaster state:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = asRecord(await request.json().catch(() => ({})))
    const prompt = asString(body.prompt)

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 })
    }

    const state = await getShipQuartermasterState({
      userId: session.user.id,
      shipDeploymentId: id,
    })

    if (!state) {
      return NextResponse.json({ error: "Ship not found" }, { status: 404 })
    }

    if (!state.session || !state.subagent) {
      return NextResponse.json(
        { error: "Quartermaster is not enabled for this ship." },
        { status: 409 },
      )
    }

    const crewCount = await prisma.bridgeCrew.count({
      where: {
        deploymentId: id,
      },
    })

    const result = await executeSessionPrompt({
      userId: session.user.id,
      sessionId: state.session.id,
      prompt,
      metadata: {
        runtime: {
          profile: QUARTERMASTER_RUNTIME_PROFILE,
        },
        quartermaster: {
          channel: QUARTERMASTER_CHANNEL,
          callsign: QUARTERMASTER_CALLSIGN,
          subagentId: state.subagent.id,
          shipDeploymentId: id,
        },
        shipContext: buildShipContext(state, crewCount),
      },
    })

    const interactions = await listSessionInteractions(state.session.id)

    return NextResponse.json({
      interaction: result.interaction,
      responseInteraction: result.responseInteraction,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      sessionId: state.session.id,
      interactions,
    })
  } catch (error) {
    if (error instanceof SessionPromptError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status },
      )
    }

    console.error("Quartermaster prompt request failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
