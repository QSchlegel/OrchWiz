import {
  PERSONAL_DETAIL_NOTIFICATION_CHANNEL,
  PERSONAL_TAB_NOTIFICATION_CHANNEL,
  PERMISSIONS_TAB_NOTIFICATION_CHANNEL,
  QUARTERMASTER_TAB_NOTIFICATION_CHANNEL,
  VAULT_TAB_NOTIFICATION_CHANNEL,
} from "@/lib/notifications/channels"
import type { NotificationChannel } from "@/lib/types/notifications"

type PersonalTabKey = keyof typeof PERSONAL_TAB_NOTIFICATION_CHANNEL

type PersonalDetailKey = keyof typeof PERSONAL_DETAIL_NOTIFICATION_CHANNEL.personal

export function personalTabForSubagent(isShared: boolean): PersonalTabKey {
  return isShared ? "shared" : "personal"
}

export function personalTopChannelForSubagent(isShared: boolean): NotificationChannel {
  return PERSONAL_TAB_NOTIFICATION_CHANNEL[personalTabForSubagent(isShared)]
}

export function personalDetailChannelForSubagent(
  isShared: boolean,
  detail: PersonalDetailKey,
): NotificationChannel {
  return PERSONAL_DETAIL_NOTIFICATION_CHANNEL[personalTabForSubagent(isShared)][detail]
}

export function permissionStatusChannel(status: "allow" | "ask" | "deny"): NotificationChannel {
  return PERMISSIONS_TAB_NOTIFICATION_CHANNEL[status]
}

export function permissionChannelFromScope(args: {
  scope: string
  status: "allow" | "ask" | "deny"
  subagentIsShared?: boolean | null
}): NotificationChannel {
  if (args.scope === "subagent") {
    return personalDetailChannelForSubagent(Boolean(args.subagentIsShared), "permissions")
  }

  if (args.scope === "workspace") {
    return PERMISSIONS_TAB_NOTIFICATION_CHANNEL.workspace
  }

  return permissionStatusChannel(args.status)
}

export function settingsSectionDetailKey(
  section: "orchestration" | "workspace" | "memory" | "guidelines" | "capabilities" | "harness",
): PersonalDetailKey {
  return section
}

export function vaultTabChannel(tab: keyof typeof VAULT_TAB_NOTIFICATION_CHANNEL): NotificationChannel {
  return VAULT_TAB_NOTIFICATION_CHANNEL[tab]
}

export function quartermasterTabChannel(tab: keyof typeof QUARTERMASTER_TAB_NOTIFICATION_CHANNEL): NotificationChannel {
  return QUARTERMASTER_TAB_NOTIFICATION_CHANNEL[tab]
}
