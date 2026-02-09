import type { BridgeChatRole, BridgeCrewRole, InteractionType } from "@prisma/client"

export const BRIDGE_STATION_KEYS: BridgeCrewRole[] = ["xo", "ops", "eng", "sec", "med", "cou"]

const STATION_KEY_SET = new Set<BridgeCrewRole>(BRIDGE_STATION_KEYS)

export function isBridgeStationKey(value: unknown): value is BridgeCrewRole {
  return typeof value === "string" && STATION_KEY_SET.has(value as BridgeCrewRole)
}

export function normalizeBridgeChatRole(value: unknown, fallback: BridgeChatRole = "user"): BridgeChatRole {
  if (value === "user" || value === "assistant" || value === "system") {
    return value
  }

  return fallback
}

export function interactionTypeToBridgeChatRole(type: InteractionType | string): BridgeChatRole {
  switch (type) {
    case "user_input":
      return "user"
    case "ai_response":
      return "assistant"
    case "tool_use":
    case "error":
      return "system"
    default:
      return "system"
  }
}

export function bridgeChatRoleToInteractionType(role: BridgeChatRole | string): InteractionType {
  switch (role) {
    case "user":
      return "user_input"
    case "assistant":
      return "ai_response"
    case "system":
      return "error"
    default:
      return "error"
  }
}
