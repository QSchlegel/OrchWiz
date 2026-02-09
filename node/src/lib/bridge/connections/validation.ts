import type { BridgeConnectionProvider } from "@prisma/client"

export interface TelegramConnectionCredentials {
  botToken: string
}

export interface DiscordConnectionCredentials {
  webhookUrl: string
}

export interface WhatsAppConnectionCredentials {
  accessToken: string
  phoneNumberId: string
}

export type BridgeConnectionCredentials =
  | TelegramConnectionCredentials
  | DiscordConnectionCredentials
  | WhatsAppConnectionCredentials

export interface ParsedBridgeConnectionInput {
  provider: BridgeConnectionProvider
  name: string
  destination: string
  enabled: boolean
  autoRelay: boolean
  config: Record<string, unknown>
  credentials: BridgeConnectionCredentials
}

export class BridgeConnectionValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "BridgeConnectionValidationError"
    this.status = status
  }
}

const BRIDGE_CONNECTION_PROVIDERS = new Set<BridgeConnectionProvider>([
  "telegram",
  "discord",
  "whatsapp",
])

const WHATSAPP_E164_PATTERN = /^\+[1-9]\d{7,14}$/u

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === false) {
    return value
  }

  return fallback
}

function ensureHttpsUrl(value: string): string {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    throw new BridgeConnectionValidationError("Discord webhookUrl must be a valid URL.")
  }

  if (parsed.protocol !== "https:") {
    throw new BridgeConnectionValidationError("Discord webhookUrl must use https.")
  }

  return parsed.toString()
}

export function parseBridgeConnectionProvider(value: unknown): BridgeConnectionProvider {
  if (typeof value !== "string") {
    throw new BridgeConnectionValidationError("provider is required.")
  }

  const normalized = value.trim().toLowerCase() as BridgeConnectionProvider
  if (!BRIDGE_CONNECTION_PROVIDERS.has(normalized)) {
    throw new BridgeConnectionValidationError("provider must be telegram, discord, or whatsapp.")
  }

  return normalized
}

export function validateBridgeConnectionDestination(
  provider: BridgeConnectionProvider,
  value: unknown,
): string {
  const destination = asNonEmptyString(value)
  if (!destination) {
    throw new BridgeConnectionValidationError("destination is required.")
  }

  if (provider === "whatsapp" && !WHATSAPP_E164_PATTERN.test(destination)) {
    throw new BridgeConnectionValidationError(
      "WhatsApp destination must be an E.164 phone number (for example: +15551234567).",
    )
  }

  return destination
}

export function validateBridgeConnectionConfig(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {}
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BridgeConnectionValidationError("config must be a JSON object when provided.")
  }

  return value as Record<string, unknown>
}

export function validateBridgeConnectionCredentials(
  provider: BridgeConnectionProvider,
  value: unknown,
): BridgeConnectionCredentials {
  const record = asRecord(value)

  if (provider === "telegram") {
    const botToken = asNonEmptyString(record.botToken)
    if (!botToken) {
      throw new BridgeConnectionValidationError("Telegram credentials require botToken.")
    }
    return { botToken }
  }

  if (provider === "discord") {
    const webhookUrl = asNonEmptyString(record.webhookUrl)
    if (!webhookUrl) {
      throw new BridgeConnectionValidationError("Discord credentials require webhookUrl.")
    }

    return {
      webhookUrl: ensureHttpsUrl(webhookUrl),
    }
  }

  const accessToken = asNonEmptyString(record.accessToken)
  const phoneNumberId = asNonEmptyString(record.phoneNumberId)
  if (!accessToken || !phoneNumberId) {
    throw new BridgeConnectionValidationError(
      "WhatsApp credentials require accessToken and phoneNumberId.",
    )
  }

  return {
    accessToken,
    phoneNumberId,
  }
}

export function parseBridgeConnectionCreateInput(input: unknown): ParsedBridgeConnectionInput {
  const body = asRecord(input)
  const provider = parseBridgeConnectionProvider(body.provider)
  const name = asNonEmptyString(body.name)
  if (!name) {
    throw new BridgeConnectionValidationError("name is required.")
  }

  const destination = validateBridgeConnectionDestination(provider, body.destination)
  const config = validateBridgeConnectionConfig(body.config)
  const credentials = validateBridgeConnectionCredentials(provider, body.credentials)

  return {
    provider,
    name,
    destination,
    enabled: asBoolean(body.enabled, true),
    autoRelay: asBoolean(body.autoRelay, true),
    config,
    credentials,
  }
}

export function isBridgeConnectionIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
}
