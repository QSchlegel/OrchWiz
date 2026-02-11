import { PERSONAL_DETAIL_NOTIFICATION_CHANNEL } from "@/lib/notifications/channels"
import type { NotificationChannel } from "@/lib/types/notifications"
import type { SubagentTypeValue } from "@/lib/subagents/types"

export type PersonalMode = "personal" | "shared"

export type CoreDetailView = "context" | "permissions" | "agentsync" | "orchestration" | "harness" | "tools"

export type AdvancedSection = "workspace" | "memory" | "guidelines" | "capabilities"

export type AgentTypeFilter = "all" | "general" | "bridge_crew" | "exocomp"

export const CORE_DETAIL_TABS: Array<{ id: CoreDetailView; label: string }> = [
  { id: "context", label: "Context" },
  { id: "permissions", label: "Permissions" },
  { id: "agentsync", label: "AgentSync" },
  { id: "orchestration", label: "Orchestration" },
  { id: "harness", label: "Harness" },
  { id: "tools", label: "Tools" },
]

export const ADVANCED_SECTION_ORDER: Array<{ id: AdvancedSection; label: string }> = [
  { id: "workspace", label: "Workspace" },
  { id: "memory", label: "Memory" },
  { id: "guidelines", label: "Guidelines" },
  { id: "capabilities", label: "Capabilities" },
]

export function coreTabsForMode(mode: PersonalMode): CoreDetailView[] {
  if (mode === "shared") {
    return ["context"]
  }

  return CORE_DETAIL_TABS.map((tab) => tab.id)
}

export function enforceCoreTabForMode(mode: PersonalMode, requested: CoreDetailView): CoreDetailView {
  if (mode === "shared") {
    return "context"
  }

  return requested
}

export function formatAgentCardStatusLine(input: {
  estimatedTokens: number
  path: string | null
}): string {
  const pathStatus = input.path?.trim() ? "Path set" : "No path"
  return `~${Math.max(0, Math.round(input.estimatedTokens))} tokens · ${pathStatus}`
}

export function aggregateAdvancedUnreadCount(
  mode: PersonalMode,
  getUnread: (channels: NotificationChannel[]) => number,
): number {
  const channels = ADVANCED_SECTION_ORDER.map((section) => PERSONAL_DETAIL_NOTIFICATION_CHANNEL[mode][section.id])
  return getUnread(channels)
}

export function isAdvancedSectionVisible(section: AdvancedSection, subagentType: SubagentTypeValue): boolean {
  if (section === "capabilities") {
    return subagentType === "exocomp"
  }

  return true
}

export function nextVisibleAdvancedSection(
  requested: AdvancedSection,
  subagentType: SubagentTypeValue,
): AdvancedSection {
  if (isAdvancedSectionVisible(requested, subagentType)) {
    return requested
  }

  return "workspace"
}
