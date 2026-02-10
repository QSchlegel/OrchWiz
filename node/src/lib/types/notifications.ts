export const NOTIFICATION_CHANNELS = [
  "sessions",
  "tasks",
  "actions",
  "ship-yard",
  "ships",
  "applications",
  "skills",
  "bridge",
  "bridge-call",
  "bridge-chat",
  "bridge-connections",
  "uss-k8s",
  "commands",
  "hooks",
  "verification",
  "security",
  "github-prs",
  "docs",
  "projects",
  "permissions.allow",
  "permissions.ask",
  "permissions.deny",
  "permissions.workspace",
  "vault.topology",
  "vault.explorer",
  "vault.graph",
  "personal.personal",
  "personal.shared",
  "personal.personal.context",
  "personal.personal.orchestration",
  "personal.personal.permissions",
  "personal.personal.agentsync",
  "personal.personal.workspace",
  "personal.personal.memory",
  "personal.personal.guidelines",
  "personal.shared.context",
  "personal.shared.orchestration",
  "personal.shared.permissions",
  "personal.shared.agentsync",
  "personal.shared.workspace",
  "personal.shared.memory",
  "personal.shared.guidelines",
  "quartermaster.chat",
  "quartermaster.knowledge",
] as const

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export type NotificationUpdateAction = "increment" | "clear"

export interface NotificationUpdatedPayload {
  channel: NotificationChannel
  action: NotificationUpdateAction
  entityId?: string
  userId?: string
}

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === "string" && (NOTIFICATION_CHANNELS as readonly string[]).includes(value)
}

export function isNotificationUpdateAction(value: unknown): value is NotificationUpdateAction {
  return value === "increment" || value === "clear"
}

export function asNotificationUpdatedPayload(value: unknown): NotificationUpdatedPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const channel = (value as { channel?: unknown }).channel
  const action = (value as { action?: unknown }).action
  const entityId = (value as { entityId?: unknown }).entityId
  const userId = (value as { userId?: unknown }).userId

  if (!isNotificationChannel(channel)) {
    return null
  }

  if (!isNotificationUpdateAction(action)) {
    return null
  }

  if (entityId !== undefined && typeof entityId !== "string") {
    return null
  }

  if (userId !== undefined && typeof userId !== "string") {
    return null
  }

  return {
    channel,
    action,
    ...(typeof entityId === "string" ? { entityId } : {}),
    ...(typeof userId === "string" ? { userId } : {}),
  }
}
