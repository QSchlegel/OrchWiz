export const SUBAGENT_TYPES = ["general", "bridge_crew", "exocomp"] as const

export type SubagentTypeValue = (typeof SUBAGENT_TYPES)[number]

export function isSubagentType(value: unknown): value is SubagentTypeValue {
  return typeof value === "string" && (SUBAGENT_TYPES as readonly string[]).includes(value)
}

export function normalizeSubagentType(value: unknown): SubagentTypeValue {
  return isSubagentType(value) ? value : "general"
}

export function parseSubagentType(value: unknown): SubagentTypeValue | null {
  return isSubagentType(value) ? value : null
}
