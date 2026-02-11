export type BridgeTtsStationKey = "xo" | "ops" | "eng" | "sec" | "med" | "cou"
export type BridgeTtsSurface = "bridge-call" | "bridge-chat"

export interface PlayBridgeTtsArgs {
  text: string
  stationKey?: BridgeTtsStationKey | null
  surface: BridgeTtsSurface
}

export interface BridgeTtsPlaybackHandle {
  audio: HTMLAudioElement
  done: Promise<void>
  stop: () => void
}

export class BridgeTtsClientError extends Error {
  status?: number
  code?: string

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message)
    this.name = "BridgeTtsClientError"
    this.status = options.status
    this.code = options.code
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

async function fetchBridgeTtsBlob(args: PlayBridgeTtsArgs): Promise<Blob> {
  const response = await fetch("/api/bridge/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: args.text,
      stationKey: args.stationKey || null,
      surface: args.surface,
    }),
  })

  if (!response.ok) {
    let message = `Bridge TTS request failed (${response.status})`
    let code: string | undefined
    const contentType = response.headers.get("content-type") || ""

    if (contentType.toLowerCase().includes("application/json")) {
      const payload = asRecord(await response.json().catch(() => ({})))
      if (typeof payload.error === "string" && payload.error.trim()) {
        message = payload.error.trim()
      }
      if (typeof payload.code === "string" && payload.code.trim()) {
        code = payload.code.trim()
      }
    }

    throw new BridgeTtsClientError(message, {
      status: response.status,
      code,
    })
  }

  const blob = await response.blob()
  if (blob.size === 0) {
    throw new BridgeTtsClientError("Bridge TTS returned empty audio.")
  }

  const contentType = blob.type || response.headers.get("content-type") || ""
  if (contentType && !contentType.toLowerCase().includes("audio/")) {
    throw new BridgeTtsClientError(`Bridge TTS returned unsupported content type: ${contentType}`)
  }

  return blob
}

function createPlaybackHandle(blob: Blob): BridgeTtsPlaybackHandle {
  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio(objectUrl)
  audio.preload = "auto"

  let settled = false
  let resolveDone: () => void = () => {}
  let rejectDone: (error: Error) => void = () => {}

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })

  const cleanup = () => {
    if (settled) {
      return
    }
    settled = true
    URL.revokeObjectURL(objectUrl)
  }

  const onEnded = () => {
    cleanup()
    resolveDone()
  }

  const onError = () => {
    cleanup()
    rejectDone(new BridgeTtsClientError("Bridge TTS audio playback failed."))
  }

  audio.addEventListener("ended", onEnded, { once: true })
  audio.addEventListener("error", onError, { once: true })

  return {
    audio,
    done,
    stop: () => {
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {
        // Ignore stop errors and fail open.
      }
      cleanup()
      resolveDone()
    },
  }
}

export async function playBridgeTts(args: PlayBridgeTtsArgs): Promise<BridgeTtsPlaybackHandle> {
  const blob = await fetchBridgeTtsBlob(args)
  const playback = createPlaybackHandle(blob)

  try {
    await playback.audio.play()
    return playback
  } catch (error) {
    playback.stop()
    throw new BridgeTtsClientError(
      `Bridge TTS audio could not start playback: ${(error as Error)?.message || "Unknown error"}`,
    )
  }
}
