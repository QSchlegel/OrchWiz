import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value))
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed)
    }
  }
  return fallback
}

function parseMode(value: unknown): "observation" | "production" | "off" | null {
  if (value === "observation" || value === "production" || value === "off") {
    return value
  }
  return null
}

function parseStrictness(value: unknown): "lenient" | "standard" | "strict" | null {
  if (value === "lenient" || value === "standard" || value === "strict") {
    return value
  }
  return null
}

function parseFailMode(value: unknown): "fail_open_alert" | "fail_closed" | "fail_open_silent" | null {
  if (value === "fail_open_alert" || value === "fail_closed" || value === "fail_open_silent") {
    return value
  }
  return null
}

export async function GET() {
  try {
    const actor = await requireAccessActor()

    const config = await prisma.motionSupervisionConfig.upsert({
      where: { ownerUserId: actor.userId },
      create: { ownerUserId: actor.userId },
      update: {},
    })

    const [baselineTotal, baselineReady] = await Promise.all([
      prisma.motionBaseline.count({
        where: { ownerUserId: actor.userId },
      }),
      prisma.motionBaseline.count({
        where: {
          ownerUserId: actor.userId,
          sampleCount: {
            gte: config.baselineMinSamples,
          },
        },
      }),
    ])

    return NextResponse.json({
      config: {
        mode: config.mode,
        strictness: config.strictness,
        failMode: config.failMode,
        baselineMinSamples: config.baselineMinSamples,
        embeddingModel: config.embeddingModel,
        updatedAt: config.updatedAt.toISOString(),
      },
      stats: {
        baselineTotal,
        baselineReady,
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading motion supervision config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const requestedMode = parseMode(body?.mode)
    if (body?.mode !== undefined && !requestedMode) {
      return NextResponse.json({ error: "mode must be observation|production" }, { status: 400 })
    }

    const requestedStrictness = parseStrictness(body?.strictness)
    if (body?.strictness !== undefined && !requestedStrictness) {
      return NextResponse.json({ error: "strictness must be lenient|standard|strict" }, { status: 400 })
    }

    const requestedFailMode = parseFailMode(body?.failMode)
    if (body?.failMode !== undefined && !requestedFailMode) {
      return NextResponse.json({ error: "failMode must be fail_open_alert|fail_closed|fail_open_silent" }, { status: 400 })
    }

    const baselineMinSamples = body?.baselineMinSamples !== undefined
      ? asPositiveInt(body.baselineMinSamples, 10)
      : undefined

    const embeddingModel = body?.embeddingModel !== undefined
      ? asNonEmptyString(body.embeddingModel)
      : null

    if (requestedMode === "production") {
      const confirm = asNonEmptyString(body?.confirm)
      if (confirm !== "ENABLE_PRODUCTION") {
        return NextResponse.json(
          { error: "confirm must be ENABLE_PRODUCTION to enable production mode" },
          { status: 400 },
        )
      }
    }

    if (requestedMode === "off" && !actor.isAdmin) {
      return NextResponse.json({ error: "Only admins can disable motion supervision." }, { status: 403 })
    }

    const updated = await prisma.motionSupervisionConfig.upsert({
      where: { ownerUserId: actor.userId },
      create: {
        ownerUserId: actor.userId,
        ...(requestedMode ? { mode: requestedMode } : {}),
        ...(requestedStrictness ? { strictness: requestedStrictness } : {}),
        ...(requestedFailMode ? { failMode: requestedFailMode } : {}),
        ...(baselineMinSamples !== undefined ? { baselineMinSamples } : {}),
        ...(embeddingModel ? { embeddingModel } : {}),
      },
      update: {
        ...(requestedMode ? { mode: requestedMode } : {}),
        ...(requestedStrictness ? { strictness: requestedStrictness } : {}),
        ...(requestedFailMode ? { failMode: requestedFailMode } : {}),
        ...(baselineMinSamples !== undefined ? { baselineMinSamples } : {}),
        ...(embeddingModel ? { embeddingModel } : {}),
      },
    })

    return NextResponse.json({
      ok: true,
      config: {
        mode: updated.mode,
        strictness: updated.strictness,
        failMode: updated.failMode,
        baselineMinSamples: updated.baselineMinSamples,
        embeddingModel: updated.embeddingModel,
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error updating motion supervision config:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

