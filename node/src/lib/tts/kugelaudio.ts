export type BridgeTtsStationKey = "xo" | "ops" | "eng" | "sec" | "med" | "cou"
export type BridgeTtsSurface = "bridge-call" | "bridge-chat"

export interface KugelAudioTtsConfig {
  enabled: boolean
  baseUrl: string | null
  timeoutMs: number
  bearerToken: string | null
  cfgScale: number
  maxTokens: number
  defaultVoice: string | null
  stationVoices: Partial<Record<BridgeTtsStationKey, string>>
}

export interface KugelAudioSynthesisInput {
  text: string
  stationKey?: BridgeTtsStationKey | null
  surface?: BridgeTtsSurface
}

export interface KugelAudioSynthesisResult {
  audio: ArrayBuffer
  contentType: string
  voice: string | null
}

export class KugelAudioTtsError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      details?: Record<string, unknown>
    } = {},
  ) {
    super(message)
    this.name = "KugelAudioTtsError"
    this.status = options.status ?? 500
    this.code = options.code ?? "KUGELAUDIO_TTS_ERROR"
    this.details = options.details
  }
}

function asNonEmptyString(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseEnabled(value: string | undefined, fallback = true): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return fallback
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true
  }

  return fallback
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function parsePositiveFloat(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value || "")
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "")
}

export function getKugelAudioTtsConfig(): KugelAudioTtsConfig {
  return {
    enabled: parseEnabled(process.env.BRIDGE_TTS_ENABLED, true),
    baseUrl: asNonEmptyString(process.env.KUGELAUDIO_TTS_BASE_URL),
    timeoutMs: parsePositiveInt(process.env.KUGELAUDIO_TTS_TIMEOUT_MS, 30_000),
    bearerToken: asNonEmptyString(process.env.KUGELAUDIO_TTS_BEARER_TOKEN),
    cfgScale: parsePositiveFloat(process.env.KUGELAUDIO_TTS_CFG_SCALE, 3.0),
    maxTokens: parsePositiveInt(process.env.KUGELAUDIO_TTS_MAX_TOKENS, 2048),
    defaultVoice: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_DEFAULT),
    stationVoices: {
      xo: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_XO) || undefined,
      ops: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_OPS) || undefined,
      eng: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_ENG) || undefined,
      sec: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_SEC) || undefined,
      med: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_MED) || undefined,
      cou: asNonEmptyString(process.env.KUGELAUDIO_TTS_VOICE_COU) || undefined,
    },
  }
}

export function resolveKugelAudioVoice(
  stationKey?: BridgeTtsStationKey | null,
  config: KugelAudioTtsConfig = getKugelAudioTtsConfig(),
): string | null {
  if (stationKey && config.stationVoices[stationKey]) {
    return config.stationVoices[stationKey] || null
  }

  return config.defaultVoice
}

function ensureConfigured(config: KugelAudioTtsConfig): string {
  if (!config.enabled) {
    throw new KugelAudioTtsError("Bridge TTS is disabled.", {
      status: 503,
      code: "BRIDGE_TTS_DISABLED",
    })
  }

  if (!config.baseUrl) {
    throw new KugelAudioTtsError("Kugelaudio TTS base URL is not configured.", {
      status: 503,
      code: "BRIDGE_TTS_NOT_CONFIGURED",
    })
  }

  return trimTrailingSlash(config.baseUrl)
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string })?.name === "AbortError"
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export async function synthesizeKugelAudioSpeech(
  input: KugelAudioSynthesisInput,
  config: KugelAudioTtsConfig = getKugelAudioTtsConfig(),
): Promise<KugelAudioSynthesisResult> {
  const baseUrl = ensureConfigured(config)
  const voice = resolveKugelAudioVoice(input.stationKey, config)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.bearerToken
          ? {
              Authorization: `Bearer ${config.bearerToken}`,
            }
          : {}),
      },
      body: JSON.stringify({
        text: input.text,
        ...(voice ? { voice } : {}),
        ...(input.surface ? { surface: input.surface } : {}),
        cfgScale: config.cfgScale,
        maxTokens: config.maxTokens,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const contentType = response.headers.get("content-type") || ""
      let upstreamMessage = `Upstream returned ${response.status}`

      if (contentType.toLowerCase().includes("application/json")) {
        const payload = asRecord(await response.json().catch(() => ({})))
        const detail = payload.detail
        if (typeof detail === "string" && detail.trim()) {
          upstreamMessage = detail.trim()
        } else if (typeof payload.error === "string" && payload.error.trim()) {
          upstreamMessage = payload.error.trim()
        }
      } else {
        const body = await response.text().catch(() => "")
        if (body.trim()) {
          upstreamMessage = body.trim().slice(0, 300)
        }
      }

      throw new KugelAudioTtsError("Kugelaudio upstream request failed.", {
        status: 502,
        code: "KUGELAUDIO_UPSTREAM_ERROR",
        details: {
          upstreamStatus: response.status,
          upstreamMessage,
        },
      })
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream"
    if (!contentType.toLowerCase().includes("audio/")) {
      throw new KugelAudioTtsError("Kugelaudio upstream did not return audio.", {
        status: 502,
        code: "KUGELAUDIO_INVALID_CONTENT_TYPE",
        details: {
          contentType,
        },
      })
    }

    const audio = await response.arrayBuffer()
    if (audio.byteLength === 0) {
      throw new KugelAudioTtsError("Kugelaudio upstream returned an empty audio payload.", {
        status: 502,
        code: "KUGELAUDIO_EMPTY_AUDIO",
      })
    }

    return {
      audio,
      contentType,
      voice,
    }
  } catch (error) {
    if (error instanceof KugelAudioTtsError) {
      throw error
    }

    if (isAbortError(error)) {
      throw new KugelAudioTtsError("Kugelaudio request timed out.", {
        status: 504,
        code: "KUGELAUDIO_TIMEOUT",
      })
    }

    throw new KugelAudioTtsError(
      `Kugelaudio request failed: ${(error as Error)?.message || "Unknown error"}`,
      {
        status: 502,
        code: "KUGELAUDIO_REQUEST_FAILED",
      },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
