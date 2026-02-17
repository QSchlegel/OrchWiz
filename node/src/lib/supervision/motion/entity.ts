import type { MotionEntityType } from "@prisma/client"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveShipDeploymentIdFromMetadata(metadata: Record<string, unknown>): string | null {
  const bridge = asRecord(metadata.bridge)
  const quartermaster = asRecord(metadata.quartermaster)
  const shipContext = asRecord(metadata.shipContext)
  const agentChat = asRecord(metadata.agentChat)

  return (
    nonEmptyString(bridge.shipDeploymentId) ||
    nonEmptyString(quartermaster.shipDeploymentId) ||
    nonEmptyString(shipContext.shipDeploymentId) ||
    nonEmptyString(agentChat.shipDeploymentId) ||
    nonEmptyString(shipContext.deploymentId)
  )
}

function resolveSubagentIdFromMetadata(metadata: Record<string, unknown>): string | null {
  return (
    nonEmptyString(metadata.subagentId) ||
    nonEmptyString(asRecord(metadata.quartermaster).subagentId) ||
    nonEmptyString(asRecord(metadata.bridge).subagentId)
  )
}

export interface MotionEntityResolution {
  entityType: MotionEntityType
  entityKey: string
  shipDeploymentId: string | null
  subagentId: string | null
  stationKey: string | null
  bridgeCrewId: string | null
}

export function resolveMotionEntity(args: {
  ownerUserId: string
  metadata?: Record<string, unknown> | null
  subagentIdOverride?: string | null
  shipDeploymentIdOverride?: string | null
}): MotionEntityResolution {
  const metadata = args.metadata ? asRecord(args.metadata) : {}
  const bridge = asRecord(metadata.bridge)

  const shipDeploymentId =
    args.shipDeploymentIdOverride?.trim() ||
    resolveShipDeploymentIdFromMetadata(metadata)
  const subagentId =
    args.subagentIdOverride?.trim() ||
    resolveSubagentIdFromMetadata(metadata)

  const bridgeChannel = nonEmptyString(bridge.channel)
  const stationKey = nonEmptyString(bridge.stationKey)
  const bridgeCrewId = nonEmptyString(bridge.bridgeCrewId)

  if (bridgeChannel === "bridge-agent" && shipDeploymentId && stationKey) {
    return {
      entityType: "ship_station",
      entityKey: `ship:${shipDeploymentId}:station:${stationKey}`,
      shipDeploymentId,
      subagentId,
      stationKey,
      bridgeCrewId,
    }
  }

  if (shipDeploymentId && subagentId) {
    return {
      entityType: "ship_subagent",
      entityKey: `ship:${shipDeploymentId}:subagent:${subagentId}`,
      shipDeploymentId,
      subagentId,
      stationKey,
      bridgeCrewId,
    }
  }

  if (subagentId) {
    return {
      entityType: "subagent",
      entityKey: `subagent:${subagentId}`,
      shipDeploymentId,
      subagentId,
      stationKey,
      bridgeCrewId,
    }
  }

  return {
    entityType: "user",
    entityKey: `user:${args.ownerUserId}`,
    shipDeploymentId,
    subagentId,
    stationKey,
    bridgeCrewId,
  }
}

