import type { RealtimeEventType } from "@/lib/types/realtime"
import type { NotificationChannel } from "@/lib/types/notifications"

export const PERMISSIONS_TAB_NOTIFICATION_CHANNEL = {
  allow: "permissions.allow",
  ask: "permissions.ask",
  deny: "permissions.deny",
  workspace: "permissions.workspace",
} as const

export const VAULT_TAB_NOTIFICATION_CHANNEL = {
  topology: "vault.topology",
  explorer: "vault.explorer",
  graph: "vault.graph",
} as const

export const PERSONAL_TAB_NOTIFICATION_CHANNEL = {
  personal: "personal.personal",
  shared: "personal.shared",
} as const

export const PERSONAL_DETAIL_NOTIFICATION_CHANNEL = {
  personal: {
    context: "personal.personal.context",
    orchestration: "personal.personal.orchestration",
    permissions: "personal.personal.permissions",
    agentsync: "personal.personal.agentsync",
    workspace: "personal.personal.workspace",
    memory: "personal.personal.memory",
    guidelines: "personal.personal.guidelines",
    capabilities: "personal.personal.capabilities",
  },
  shared: {
    context: "personal.shared.context",
    orchestration: "personal.shared.orchestration",
    permissions: "personal.shared.permissions",
    agentsync: "personal.shared.agentsync",
    workspace: "personal.shared.workspace",
    memory: "personal.shared.memory",
    guidelines: "personal.shared.guidelines",
    capabilities: "personal.shared.capabilities",
  },
} as const

export const QUARTERMASTER_TAB_NOTIFICATION_CHANNEL = {
  chat: "quartermaster.chat",
  knowledge: "quartermaster.knowledge",
} as const

const allPersonalDetailChannels: NotificationChannel[] = [
  ...Object.values(PERSONAL_DETAIL_NOTIFICATION_CHANNEL.personal),
  ...Object.values(PERSONAL_DETAIL_NOTIFICATION_CHANNEL.shared),
]

export const SIDEBAR_NOTIFICATION_CHANNELS_BY_HREF: Record<string, NotificationChannel[]> = {
  "/sessions": ["sessions"],
  "/tasks": ["tasks"],
  "/actions": ["actions"],
  "/ship-yard": ["ship-yard"],
  "/ships": ["ships"],
  "/applications": ["applications"],
  "/personal": [
    PERSONAL_TAB_NOTIFICATION_CHANNEL.personal,
    PERSONAL_TAB_NOTIFICATION_CHANNEL.shared,
    ...allPersonalDetailChannels,
  ],
  "/skills": ["skills"],
  "/bridge": ["bridge"],
  "/bridge-call": ["bridge-call"],
  "/bridge-chat": ["bridge-chat"],
  "/bridge-connections": ["bridge-connections"],
  "/uss-k8s": ["uss-k8s"],
  "/vault": Object.values(VAULT_TAB_NOTIFICATION_CHANNEL),
  "/commands": ["commands"],
  "/permissions": Object.values(PERMISSIONS_TAB_NOTIFICATION_CHANNEL),
  "/hooks": ["hooks"],
  "/performance": [],
  "/verification": ["verification"],
  "/security": ["security"],
  "/github/prs": ["github-prs"],
  "/docs/claude": ["docs"],
  "/projects": ["projects"],
}

export const LEGACY_EVENT_NOTIFICATION_CHANNEL_MAP: Partial<Record<RealtimeEventType, NotificationChannel>> = {
  "session.prompted": "sessions",
  "task.updated": "tasks",
  "forwarding.received": "actions",
  "ship.updated": "ship-yard",
  "deployment.updated": "ships",
  "ship.application.updated": "applications",
  "application.updated": "applications",
  "command.executed": "commands",
  "verification.updated": "verification",
  "bridge.updated": "bridge-chat",
  "bridge.agent-chat.updated": "bridge-chat",
  "bridge.comms.updated": "bridge-connections",
  "bridge-call.round.updated": "bridge-call",
  "agentsync.updated": "personal.personal.agentsync",
  "docs.updated": "docs",
  "webhook.received": "github-prs",
}

export function channelFromLegacyRealtimeEventType(type: string): NotificationChannel | null {
  return LEGACY_EVENT_NOTIFICATION_CHANNEL_MAP[type as RealtimeEventType] || null
}

export function notificationChannelsForSidebarHref(href: string): NotificationChannel[] {
  return SIDEBAR_NOTIFICATION_CHANNELS_BY_HREF[href] || []
}
