import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { runSessionRuntime } from "@/lib/runtime"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { resolveSessionRuntimePrompt } from "@/lib/runtime/bridge-prompt"

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
    const { prompt, metadata } = body
    const metadataRecord = metadata && typeof metadata === "object" ? metadata : {}
    const promptResolution = resolveSessionRuntimePrompt({
      userPrompt: prompt,
      metadata: metadataRecord as Record<string, unknown>,
    })

    // Verify session belongs to user
    const dbSession = await prisma.session.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!dbSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Create user input interaction
    const interaction = await prisma.sessionInteraction.create({
      data: {
        sessionId: id,
        type: "user_input",
        content: promptResolution.interactionContent,
        metadata: metadataRecord,
      },
    })

    // Update session status if needed
    if (dbSession.status === "planning") {
      await prisma.session.update({
        where: { id },
        data: { status: "executing" },
      })
    }

    const runtimeResult = await runSessionRuntime({
      sessionId: id,
      prompt: promptResolution.runtimePrompt,
      metadata: metadataRecord,
    })

    const responseInteraction = await prisma.sessionInteraction.create({
      data: {
        sessionId: id,
        type: "ai_response",
        content: runtimeResult.output,
        metadata: {
          provider: runtimeResult.provider,
          fallbackUsed: runtimeResult.fallbackUsed,
          ...(runtimeResult.metadata || {}),
          ...(promptResolution.bridgeResponseMetadata || {}),
        },
      },
    })

    publishRealtimeEvent({
      type: "session.prompted",
      payload: {
        sessionId: id,
        userInteractionId: interaction.id,
        aiInteractionId: responseInteraction.id,
        provider: runtimeResult.provider,
      },
    })

    return NextResponse.json({
      interaction,
      responseInteraction,
      provider: runtimeResult.provider,
      fallbackUsed: runtimeResult.fallbackUsed,
    })
  } catch (error) {
    console.error("Error submitting prompt:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
