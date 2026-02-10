import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import type { BridgeCrewRole } from "@prisma/client"
import { isBridgeCrewRole } from "@/lib/shipyard/bridge-crew"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import {
  createTextTo3DTask,
  getPromptForRole,
  meshyEnabled,
  waitForTaskResult,
} from "@/lib/meshy/client"

export const dynamic = "force-dynamic"
export const maxDuration = 300

function parseRole(body: unknown): BridgeCrewRole | null {
  if (body === null || typeof body !== "object") return null
  const role = (body as { role?: unknown }).role
  return typeof role === "string" && isBridgeCrewRole(role) ? role : null
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!meshyEnabled()) {
      return NextResponse.json(
        { error: "Meshy API is not configured (MESHY_API_KEY)" },
        { status: 503 },
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      )
    }

    const role = parseRole(body)
    if (!role) {
      return NextResponse.json(
        { error: "Missing or invalid body.role (required: xo | ops | eng | sec | med | cou)" },
        { status: 400 },
      )
    }

    const prompt = getPromptForRole(role)
    const taskId = await createTextTo3DTask(prompt)
    const { status, modelUrl, taskError } = await waitForTaskResult(taskId)

    if (status !== "SUCCEEDED" || !modelUrl) {
      return NextResponse.json(
        {
          error: "Meshy generation failed",
          status,
          taskError: taskError ?? undefined,
        },
        { status: 502 },
      )
    }

    await prisma.bridgeCharacterAsset.upsert({
      where: { role },
      create: {
        role,
        modelUrl,
        meshyTaskId: taskId,
      },
      update: {
        modelUrl,
        meshyTaskId: taskId,
      },
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "bridge",
      entityId: role,
    })

    return NextResponse.json({ role, modelUrl })
  } catch (error) {
    console.error("Error generating bridge character model:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    )
  }
}
