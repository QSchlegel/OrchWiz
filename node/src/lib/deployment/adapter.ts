import type { DeploymentStatus } from "@prisma/client"

export interface DeploymentAdapterResult {
  status: DeploymentStatus
  deployedAt?: Date
  lastHealthCheck?: Date
  healthStatus?: string
  metadata?: Record<string, unknown>
  error?: string
}

interface ConnectorPayload {
  kind: "agent" | "application"
  recordId: string
  name: string
  nodeId: string
  nodeType: string
  deploymentProfile?: string
  provisioningMode?: string
  nodeUrl?: string | null
  config?: Record<string, unknown>
  infrastructure?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

function connectorConfigured(): boolean {
  return Boolean(process.env.DEPLOYMENT_CONNECTOR_URL)
}

async function callConnector(payload: ConnectorPayload): Promise<DeploymentAdapterResult> {
  const connectorUrl = process.env.DEPLOYMENT_CONNECTOR_URL
  if (!connectorUrl) {
    throw new Error("Deployment connector URL is not configured")
  }

  const endpoint =
    payload.kind === "agent"
      ? process.env.DEPLOYMENT_AGENT_PATH || "/v1/deployments/agents"
      : process.env.DEPLOYMENT_APPLICATION_PATH || "/v1/deployments/applications"

  const infrastructureFromConfig =
    payload.config && typeof payload.config.infrastructure === "object"
      ? (payload.config.infrastructure as Record<string, unknown>)
      : undefined

  const connectorPayload = {
    ...payload,
    infrastructure: payload.infrastructure || infrastructureFromConfig,
  }

  const response = await fetch(`${connectorUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.DEPLOYMENT_CONNECTOR_API_KEY
        ? { Authorization: `Bearer ${process.env.DEPLOYMENT_CONNECTOR_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(connectorPayload),
  })

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      status: "failed",
      error: body?.error || `Connector request failed with status ${response.status}`,
      metadata: {
        connectorUrl,
        endpoint,
      },
    }
  }

  return {
    status: (body?.status as DeploymentStatus) || "active",
    deployedAt: body?.deployedAt ? new Date(body.deployedAt) : new Date(),
    lastHealthCheck: new Date(),
    healthStatus: body?.healthStatus || "healthy",
    metadata: {
      connectorUrl,
      endpoint,
      connectorResponse: body,
    },
  }
}

function fallbackResult(payload: ConnectorPayload): DeploymentAdapterResult {
  return {
    status: "active",
    deployedAt: new Date(),
    lastHealthCheck: new Date(),
    healthStatus: "healthy",
    metadata: {
      mode: "fallback",
      connectorConfigured: false,
      kind: payload.kind,
    },
  }
}

export async function runDeploymentAdapter(payload: ConnectorPayload): Promise<DeploymentAdapterResult> {
  if (!connectorConfigured()) {
    return fallbackResult(payload)
  }

  try {
    return await callConnector(payload)
  } catch (error) {
    return {
      status: "failed",
      error: (error as Error).message,
      metadata: {
        mode: "connector",
      },
    }
  }
}
