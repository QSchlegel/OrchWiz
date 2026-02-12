import type { BridgeStationKey } from "@/lib/bridge/stations"
import { isBridgeConnectionIdList } from "@/lib/bridge/connections/validation"
import {
  parseBridgeDispatchRuntimeStrict,
  type BridgeDispatchRuntimeId,
} from "@/lib/bridge/connections/dispatch-runtime"

const BRIDGE_STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])

export interface ParsedBridgeDispatchContext {
  stationKey?: BridgeStationKey
  callsign?: string
  bridgeCrewId?: string
}

export interface ParsedBridgeDispatchRequest {
  deploymentId: string
  message: string
  runtime: BridgeDispatchRuntimeId
  connectionIds?: string[]
  bridgeContext?: ParsedBridgeDispatchContext
}

export class BridgeDispatchRequestValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "BridgeDispatchRequestValidationError"
    this.status = status
  }
}

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

function parseStationKey(value: unknown): BridgeStationKey | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase() as BridgeStationKey
  return BRIDGE_STATION_KEYS.has(normalized) ? normalized : null
}

function parseBridgeContext(value: unknown): ParsedBridgeDispatchContext | undefined {
  if (value === undefined || value === null) {
    return undefined
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BridgeDispatchRequestValidationError("bridgeContext must be a JSON object when provided.")
  }

  const record = asRecord(value)
  const stationKey = parseStationKey(record.stationKey)
  if (record.stationKey !== undefined && !stationKey) {
    throw new BridgeDispatchRequestValidationError(
      "bridgeContext.stationKey must be one of: xo, ops, eng, sec, med, cou.",
    )
  }

  const callsign = asNonEmptyString(record.callsign)
  const bridgeCrewId = asNonEmptyString(record.bridgeCrewId)

  if (!stationKey && !callsign && !bridgeCrewId) {
    return undefined
  }

  return {
    ...(stationKey ? { stationKey } : {}),
    ...(callsign ? { callsign } : {}),
    ...(bridgeCrewId ? { bridgeCrewId } : {}),
  }
}

export function parseBridgeDispatchRequestBody(body: unknown): ParsedBridgeDispatchRequest {
  const payload = asRecord(body)
  const deploymentId = asNonEmptyString(payload.deploymentId)
  const message = asNonEmptyString(payload.message)

  if (!deploymentId || !message) {
    throw new BridgeDispatchRequestValidationError("deploymentId and message are required.")
  }

  const runtime = parseBridgeDispatchRuntimeStrict(payload.runtime)
  const bridgeContext = parseBridgeContext(payload.bridgeContext)
  const connectionIds = isBridgeConnectionIdList(payload.connectionIds)
    ? payload.connectionIds
    : undefined

  return {
    deploymentId,
    message,
    runtime,
    ...(connectionIds ? { connectionIds } : {}),
    ...(bridgeContext ? { bridgeContext } : {}),
  }
}
