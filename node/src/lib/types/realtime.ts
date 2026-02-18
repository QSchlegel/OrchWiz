export const REALTIME_EVENT_TYPES = [
  "session.prompted",
  "command.executed",
  "ship.launch.progress",
  "ship.launch.log",
  "ship.updated",
  "ship.application.updated",
  "deployment.updated",
  "application.updated",
  "task.updated",
  "verification.updated",
  "forwarding.received",
  "webhook.received",
  "docs.updated",
  "bridge.updated",
  "bridge.agent-chat.updated",
  "bridge.comms.updated",
  "bridge-call.round.updated",
  "runtime.node.metrics.updated",
  "agentsync.updated",
  "notification.updated",
] as const

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number]

export interface RealtimeEvent<T = unknown> {
  id: string
  type: RealtimeEventType | string
  userId?: string
  timestamp: string
  payload: T
}
