function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "")
}

export class MispError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(message: string, options: { status?: number; code?: string; details?: unknown } = {}) {
    super(message)
    this.name = "MispError"
    this.status = options.status ?? 500
    this.code = options.code ?? "MISP_ERROR"
    this.details = options.details
  }
}

export function buildMispCreateEventPayload(args: {
  info: string
  threat_level_id?: number
  analysis?: number
  distribution?: number
  published?: boolean
  date?: string
}): { Event: Record<string, unknown> } {
  const nowDate = new Date().toISOString().slice(0, 10)
  return {
    Event: {
      info: args.info,
      threat_level_id: args.threat_level_id ?? 2,
      analysis: args.analysis ?? 0,
      distribution: args.distribution ?? 0,
      published: args.published ?? false,
      date: args.date ?? nowDate,
    },
  }
}

export function buildMispAddAttributePayload(args: {
  eventId: string
  value: string
  category: string
  type: string
  comment?: string
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_id: args.eventId,
    value: args.value,
    category: args.category,
    type: args.type,
  }

  const comment = asNonEmptyString(args.comment)
  if (comment) {
    payload.comment = comment.slice(0, 500)
  }

  return payload
}

async function mispFetch(args: {
  baseUrl: string
  apiKey: string
  path: string
  method?: "GET" | "POST"
  payload?: unknown
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const baseUrl = asNonEmptyString(args.baseUrl)
  if (!baseUrl) {
    throw new MispError("MISP base URL is missing.", { status: 400, code: "MISP_BASE_URL_MISSING" })
  }

  const apiKey = asNonEmptyString(args.apiKey)
  if (!apiKey) {
    throw new MispError("MISP API key is missing.", { status: 400, code: "MISP_API_KEY_MISSING" })
  }

  const url = `${normalizeBaseUrl(baseUrl)}${args.path}`
  const response = await fetch(url, {
    method: args.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
      Accept: "application/json",
    },
    body: args.payload === undefined ? null : JSON.stringify(args.payload),
  })

  const payload = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, payload }
}

export function extractMispEventId(payload: unknown): string | null {
  const eventId = (payload as any)?.Event?.id ?? (payload as any)?.event?.id
  if (typeof eventId === "string" && eventId.trim()) return eventId.trim()
  if (typeof eventId === "number" && Number.isFinite(eventId)) return String(eventId)
  return null
}

export async function createMispEvent(args: {
  baseUrl: string
  apiKey: string
  info: string
  threat_level_id?: number
  analysis?: number
  distribution?: number
  published?: boolean
  date?: string
}): Promise<{ ok: boolean; status: number; payload: unknown; eventId: string | null }> {
  const payload = buildMispCreateEventPayload({
    info: args.info,
    threat_level_id: args.threat_level_id,
    analysis: args.analysis,
    distribution: args.distribution,
    published: args.published,
    date: args.date,
  })

  const result = await mispFetch({
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    path: "/events",
    method: "POST",
    payload,
  })

  return {
    ...result,
    eventId: extractMispEventId(result.payload),
  }
}

export async function addMispAttribute(args: {
  baseUrl: string
  apiKey: string
  eventId: string
  value: string
  category: string
  type: string
  comment?: string
}): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const eventId = asNonEmptyString(args.eventId)
  if (!eventId) {
    throw new MispError("eventId is required.", { status: 400, code: "MISP_EVENT_ID_MISSING" })
  }

  const value = asNonEmptyString(args.value)
  if (!value) {
    throw new MispError("value is required.", { status: 400, code: "MISP_ATTRIBUTE_VALUE_MISSING" })
  }

  const payload = buildMispAddAttributePayload({
    eventId,
    value,
    category: args.category,
    type: args.type,
    comment: args.comment,
  })

  return mispFetch({
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    path: `/attributes/add/${encodeURIComponent(eventId)}`,
    method: "POST",
    payload,
  })
}
