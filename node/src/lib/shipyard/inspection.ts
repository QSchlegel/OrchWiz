export interface ShipyardInspectionFailure {
  isTerminalFailure: boolean
  code: string | null
  message: string | null
  details: Record<string, unknown> | null
  suggestedCommands: string[]
}

export interface ShipyardInspectionLogTail {
  key: string
  value: string
}

export interface ShipyardInspectionBridgeSummaryConnection {
  provider: string
  enabled: boolean
  autoRelay: boolean
}

export interface ShipyardInspectionBridgeSummaryDelivery {
  createdAt: Date | string
  status: string
}

export interface ShipyardInspectionBridgeSummary {
  total: number
  enabled: number
  autoRelay: number
  providers: {
    telegram: { total: number; enabled: number }
    discord: { total: number; enabled: number }
    whatsapp: { total: number; enabled: number }
  }
  lastDeliveryAt: string | null
  lastDeliveryStatus: string | null
}

const MAX_LOG_TAIL_CHARS = 1500
const MAX_MESSAGE_PREVIEW_CHARS = 220

export const INSPECTION_LOG_TAIL_METADATA_KEYS = [
  "provisionOutputTail",
  "installOutputTail",
  "contextCheckOutputTail",
  "appImageBuildOutputTail",
  "appImageLoadOutputTail",
  "openClawInjectionOutputTail",
  "openClawRolloutOutputTail",
  "sudoCheckOutputTail",
] as const

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

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function truncateTail(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }
  return value.slice(value.length - maxChars)
}

function toIsoString(value: Date | string): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value !== "string") {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function extractInspectionFailureFromMetadata(args: {
  metadata: unknown
  deploymentStatus?: string
}): ShipyardInspectionFailure {
  const metadata = asRecord(args.metadata)
  const code = asNonEmptyString(metadata.deploymentErrorCode)
  const message = asNonEmptyString(metadata.deploymentError)
  const details = asRecordOrNull(metadata.deploymentErrorDetails)

  const suggestedCommandsRaw = details?.suggestedCommands
  const suggestedCommands = Array.isArray(suggestedCommandsRaw)
    ? [...new Set(
        suggestedCommandsRaw
          .map((entry) => asNonEmptyString(entry))
          .filter((entry): entry is string => entry !== null),
      )]
    : []

  return {
    isTerminalFailure: args.deploymentStatus === "failed" || code !== null || message !== null,
    code,
    message,
    details,
    suggestedCommands,
  }
}

export function extractInspectionLogTailsFromMetadata(
  metadataInput: unknown,
): ShipyardInspectionLogTail[] {
  const metadata = asRecord(metadataInput)
  const tails: ShipyardInspectionLogTail[] = []

  for (const key of INSPECTION_LOG_TAIL_METADATA_KEYS) {
    const raw = asNonEmptyString(metadata[key])
    if (!raw) {
      continue
    }

    tails.push({
      key,
      value: truncateTail(raw, MAX_LOG_TAIL_CHARS),
    })
  }

  return tails
}

export function buildBridgeInspectionSummary(args: {
  connections: ShipyardInspectionBridgeSummaryConnection[]
  deliveries: ShipyardInspectionBridgeSummaryDelivery[]
}): ShipyardInspectionBridgeSummary {
  const providers: ShipyardInspectionBridgeSummary["providers"] = {
    telegram: { total: 0, enabled: 0 },
    discord: { total: 0, enabled: 0 },
    whatsapp: { total: 0, enabled: 0 },
  }

  for (const connection of args.connections) {
    if (
      connection.provider !== "telegram"
      && connection.provider !== "discord"
      && connection.provider !== "whatsapp"
    ) {
      continue
    }
    providers[connection.provider].total += 1
    if (connection.enabled) {
      providers[connection.provider].enabled += 1
    }
  }

  const sortedDeliveries = [...args.deliveries].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()
    return rightTime - leftTime
  })

  const lastDelivery = sortedDeliveries[0]

  return {
    total: args.connections.length,
    enabled: args.connections.filter((connection) => connection.enabled).length,
    autoRelay: args.connections.filter((connection) => connection.enabled && connection.autoRelay).length,
    providers,
    lastDeliveryAt: lastDelivery ? toIsoString(lastDelivery.createdAt) : null,
    lastDeliveryStatus: lastDelivery?.status || null,
  }
}

export function buildDeliveryMessagePreview(message: string): string {
  const compact = message.replace(/\s+/gu, " ").trim()
  if (compact.length <= MAX_MESSAGE_PREVIEW_CHARS) {
    return compact
  }
  return `${compact.slice(0, MAX_MESSAGE_PREVIEW_CHARS - 3)}...`
}
