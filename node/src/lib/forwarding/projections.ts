import type { ForwardingEvent, NodeSource } from "@prisma/client"
import {
  parseDeploymentType,
  normalizeInfrastructureInConfig,
  parseDeploymentProfile,
  parseProvisioningMode,
} from "@/lib/deployment/profile"

type ForwardingEventWithSource = ForwardingEvent & {
  sourceNode: NodeSource
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function forwardedMeta(event: ForwardingEventWithSource) {
  return {
    isForwarded: true,
    sourceNodeId: event.sourceNode.nodeId,
    sourceNodeName: event.sourceNode.name,
    forwardingEventId: event.id,
    forwardingOccurredAt: event.occurredAt,
  }
}

export function mapForwardedSession(event: ForwardingEventWithSource) {
  const payload = asRecord(event.payload)
  const interactionsCount = asNumber(payload.interactionsCount, 0)

  return {
    id: `forwarded-${event.id}`,
    title: asNullableString(payload.title),
    description: asNullableString(payload.description),
    prompt: asNullableString(payload.prompt),
    status: asString(payload.status, "planning"),
    mode: asString(payload.mode, "plan"),
    source: asString(payload.source, "web"),
    projectName: asNullableString(payload.projectName),
    branch: asNullableString(payload.branch),
    environment: asNullableString(payload.environment),
    userId: asString(payload.userId, "forwarded"),
    parentSessionId: asNullableString(payload.parentSessionId),
    metadata: asRecord(payload.metadata),
    createdAt: asString(payload.createdAt, event.occurredAt.toISOString()),
    updatedAt: asString(payload.updatedAt, event.occurredAt.toISOString()),
    completedAt: asNullableString(payload.completedAt),
    _count: {
      interactions: interactionsCount,
    },
    ...forwardedMeta(event),
  }
}

export function mapForwardedTask(event: ForwardingEventWithSource) {
  const payload = asRecord(event.payload)

  return {
    id: `forwarded-${event.id}`,
    sessionId: asString(payload.sessionId, "forwarded-session"),
    name: asString(payload.name, "Forwarded task"),
    status: asString(payload.status, "running"),
    duration: asNumber(payload.duration, 0),
    tokenCount: asNumber(payload.tokenCount, 0),
    strategy: asNullableString(payload.strategy),
    permissionMode: asNullableString(payload.permissionMode),
    metadata: asRecord(payload.metadata),
    startedAt: asString(payload.startedAt, event.occurredAt.toISOString()),
    completedAt: asNullableString(payload.completedAt),
    session: {
      id: asString(payload.sessionId, "forwarded-session"),
      title: asNullableString(payload.sessionTitle),
    },
    ...forwardedMeta(event),
  }
}

export function mapForwardedVerification(event: ForwardingEventWithSource) {
  const payload = asRecord(event.payload)

  return {
    id: `forwarded-${event.id}`,
    sessionId: asString(payload.sessionId, "forwarded-session"),
    type: asString(payload.type, "browser"),
    status: asNullableString(payload.status),
    result: asRecord(payload.result),
    iterations: asNumber(payload.iterations, 0),
    feedback: asNullableString(payload.feedback),
    startedAt: asString(payload.startedAt, event.occurredAt.toISOString()),
    completedAt: asNullableString(payload.completedAt),
    session: {
      id: asString(payload.sessionId, "forwarded-session"),
      title: asNullableString(payload.sessionTitle),
    },
    ...forwardedMeta(event),
  }
}

export function mapForwardedAction(event: ForwardingEventWithSource) {
  const payload = asRecord(event.payload)

  return {
    id: `forwarded-${event.id}`,
    sessionId: asString(payload.sessionId, "forwarded-session"),
    type: asString(payload.type, "other"),
    action: asString(payload.action, "forwarded"),
    details: asRecord(payload.details),
    status: asNullableString(payload.status),
    result: asRecord(payload.result),
    timestamp: asString(payload.timestamp, event.occurredAt.toISOString()),
    session: {
      id: asString(payload.sessionId, "forwarded-session"),
      title: asNullableString(payload.sessionTitle),
    },
    ...forwardedMeta(event),
  }
}

export function mapForwardedDeployment(event: ForwardingEventWithSource) {
  const payload = asRecord(event.payload)
  const deploymentType = parseDeploymentType(payload.deploymentType)
  const deploymentProfile = parseDeploymentProfile(payload.deploymentProfile)
  const normalizedInfrastructure = normalizeInfrastructureInConfig(deploymentProfile, payload.config)

  return {
    id: `forwarded-${event.id}`,
    name: asString(payload.name, "Forwarded deployment"),
    description: asNullableString(payload.description),
    subagentId: asNullableString(payload.subagentId),
    nodeId: asString(payload.nodeId, event.sourceNode.nodeId),
    nodeType: asString(payload.nodeType, event.sourceNode.nodeType || "local"),
    deploymentType,
    deploymentProfile,
    provisioningMode: parseProvisioningMode(payload.provisioningMode),
    nodeUrl: asNullableString(payload.nodeUrl),
    status: asString(payload.status, "active"),
    config: normalizedInfrastructure.config,
    metadata: {
      ...asRecord(payload.metadata),
      forwarded: asBoolean(true),
    },
    deployedAt: asNullableString(payload.deployedAt),
    lastHealthCheck: asNullableString(payload.lastHealthCheck),
    healthStatus: asNullableString(payload.healthStatus),
    createdAt: asString(payload.createdAt, event.occurredAt.toISOString()),
    subagent: payload.subagent && typeof payload.subagent === "object" ? payload.subagent : undefined,
    ...forwardedMeta(event),
  }
}
