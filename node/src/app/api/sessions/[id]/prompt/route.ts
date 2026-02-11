import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
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
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 })
    }

    const metadata = asRecord(body.metadata)
    const runtimeMetadata = asRecord(metadata.runtime)
    const metadataWithExecutionKind = {
      ...metadata,
      runtime: {
        ...runtimeMetadata,
        executionKind: "human_chat",
      },
    }

    const result = await executeSessionPrompt({
      userId: session.user.id,
      sessionId: id,
      prompt,
      metadata: metadataWithExecutionKind,
    })

    return NextResponse.json({
      interaction: result.interaction,
      responseInteraction: result.responseInteraction,
      provider: result.provider,
      fallbackUsed: result.fallbackUsed,
      signature: result.signature,
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

    console.error("Error submitting prompt:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
