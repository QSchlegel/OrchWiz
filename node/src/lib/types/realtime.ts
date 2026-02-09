export type RealtimeEventType =
  | "session.prompted"
  | "command.executed"
  | "ship.updated"
  | "ship.application.updated"
  | "deployment.updated"
  | "application.updated"
  | "task.updated"
  | "verification.updated"
  | "forwarding.received"
  | "webhook.received"
  | "docs.updated"
  | "bridge.updated"

export interface RealtimeEvent<T = unknown> {
  id: string
  type: RealtimeEventType | string
  timestamp: string
  payload: T
}
