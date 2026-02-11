import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  type BridgeTtsStationKey,
  type BridgeTtsSurface,
  KugelAudioTtsError,
  synthesizeKugelAudioSpeech,
} from "@/lib/tts/kugelaudio"

export const dynamic = "force-dynamic"

const TEXT_MAX_CHARS = 4000

type SessionShape = {
  user?: {
    id?: string
  }
} | null

interface BridgeTtsRouteDeps {
  getSession: () => Promise<SessionShape>
  synthesize: typeof synthesizeKugelAudioSpeech
}

const defaultDeps: BridgeTtsRouteDeps = {
  getSession: async () => auth.api.getSession({ headers: await headers() }) as Promise<SessionShape>,
  synthesize: synthesizeKugelAudioSpeech,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function parseText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.length > TEXT_MAX_CHARS) {
    throw new KugelAudioTtsError(`text exceeds max length (${TEXT_MAX_CHARS})`, {
      status: 400,
      code: "INVALID_TEXT",
    })
  }

  return trimmed
}

function parseStationKey(value: unknown): BridgeTtsStationKey | null {
  if (value === undefined || value === null || value === "") {
    return null
  }

  if (
    value === "xo" ||
    value === "ops" ||
    value === "eng" ||
    value === "sec" ||
    value === "med" ||
    value === "cou"
  ) {
    return value
  }

  throw new KugelAudioTtsError("stationKey must be one of xo, ops, eng, sec, med, cou.", {
    status: 400,
    code: "INVALID_STATION_KEY",
  })
}

function parseSurface(value: unknown): BridgeTtsSurface | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined
  }

  if (value === "bridge-call" || value === "bridge-chat") {
    return value
  }

  throw new KugelAudioTtsError("surface must be one of bridge-call or bridge-chat.", {
    status: 400,
    code: "INVALID_SURFACE",
  })
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof KugelAudioTtsError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    )
  }

  console.error("Bridge TTS route failed:", error)
  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

export async function handlePostBridgeTts(
  request: NextRequest,
  deps: BridgeTtsRouteDeps = defaultDeps,
): Promise<NextResponse> {
  try {
    const session = await deps.getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const text = parseText(body.text)
    if (!text) {
      throw new KugelAudioTtsError("text is required.", {
        status: 400,
        code: "INVALID_TEXT",
      })
    }

    const stationKey = parseStationKey(body.stationKey)
    const surface = parseSurface(body.surface)

    const result = await deps.synthesize({
      text,
      stationKey,
      surface,
    })

    return new NextResponse(result.audio, {
      status: 200,
      headers: {
        "Content-Type": result.contentType || "audio/wav",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  return handlePostBridgeTts(request)
}
