import { publishRealtimeEvent } from "@/lib/realtime/events"

interface ShipUpdatedInput {
  shipId: string
  status: string
  nodeId?: string | null
  userId?: string | null
}

interface ShipApplicationUpdatedInput {
  applicationId: string
  status: string
  nodeId?: string | null
  shipDeploymentId?: string | null
  userId?: string | null
}

export function publishShipUpdated(input: ShipUpdatedInput) {
  publishRealtimeEvent({
    type: "ship.updated",
    ...(input.userId
      ? {
          userId: input.userId,
        }
      : {}),
    payload: {
      shipId: input.shipId,
      status: input.status,
      nodeId: input.nodeId || null,
    },
  })

  publishRealtimeEvent({
    type: "deployment.updated",
    ...(input.userId
      ? {
          userId: input.userId,
        }
      : {}),
    payload: {
      deploymentId: input.shipId,
      status: input.status,
      nodeId: input.nodeId || null,
    },
  })
}

export function publishShipApplicationUpdated(input: ShipApplicationUpdatedInput) {
  publishRealtimeEvent({
    type: "ship.application.updated",
    ...(input.userId
      ? {
          userId: input.userId,
        }
      : {}),
    payload: {
      applicationId: input.applicationId,
      status: input.status,
      nodeId: input.nodeId || null,
      shipDeploymentId: input.shipDeploymentId || null,
    },
  })

  publishRealtimeEvent({
    type: "application.updated",
    ...(input.userId
      ? {
          userId: input.userId,
        }
      : {}),
    payload: {
      applicationId: input.applicationId,
      status: input.status,
      nodeId: input.nodeId || null,
    },
  })
}
