function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export const EXOCOMP_CAPABILITY_PRESETS = ["core_maintenance"] as const

export type ExocompCapabilityPreset = (typeof EXOCOMP_CAPABILITY_PRESETS)[number]

export const EXOCOMP_CAPABILITY_KEYS = [
  "diagnostics",
  "microRepairPlanning",
  "hazardChecks",
  "safeShutdownGuidance",
  "statusRelay",
] as const

export type ExocompCapabilityKey = (typeof EXOCOMP_CAPABILITY_KEYS)[number]

export interface ExocompCapabilities {
  preset: ExocompCapabilityPreset
  diagnostics: boolean
  microRepairPlanning: boolean
  hazardChecks: boolean
  safeShutdownGuidance: boolean
  statusRelay: boolean
}

export const DEFAULT_EXOCOMP_CAPABILITIES: ExocompCapabilities = {
  preset: "core_maintenance",
  diagnostics: true,
  microRepairPlanning: true,
  hazardChecks: true,
  safeShutdownGuidance: true,
  statusRelay: true,
}

function normalizeBoolean(input: unknown, fallback: boolean): boolean {
  return typeof input === "boolean" ? input : fallback
}

export function normalizeExocompCapabilities(input: unknown): ExocompCapabilities {
  const raw = asRecord(input)

  return {
    preset: raw.preset === "core_maintenance" ? "core_maintenance" : DEFAULT_EXOCOMP_CAPABILITIES.preset,
    diagnostics: normalizeBoolean(raw.diagnostics, DEFAULT_EXOCOMP_CAPABILITIES.diagnostics),
    microRepairPlanning: normalizeBoolean(raw.microRepairPlanning, DEFAULT_EXOCOMP_CAPABILITIES.microRepairPlanning),
    hazardChecks: normalizeBoolean(raw.hazardChecks, DEFAULT_EXOCOMP_CAPABILITIES.hazardChecks),
    safeShutdownGuidance: normalizeBoolean(raw.safeShutdownGuidance, DEFAULT_EXOCOMP_CAPABILITIES.safeShutdownGuidance),
    statusRelay: normalizeBoolean(raw.statusRelay, DEFAULT_EXOCOMP_CAPABILITIES.statusRelay),
  }
}

const CAPABILITY_INSTRUCTION_LINES: Record<ExocompCapabilityKey, string> = {
  diagnostics: "Run concise system diagnostics first and report concrete health signals.",
  microRepairPlanning: "Propose micro-repair plans as ordered, low-risk steps with rollback guidance.",
  hazardChecks: "Perform hazard checks before action; call out thermal, power, and stability risks.",
  safeShutdownGuidance: "When risk is elevated, prioritize safe shutdown/stabilization guidance over throughput.",
  statusRelay: "Relay status in short operator-ready updates with owner, next action, and risk state.",
}

export function buildExocompCapabilityInstructionBlock(input: unknown): string {
  const capabilities = normalizeExocompCapabilities(input)
  const enabledKeys = EXOCOMP_CAPABILITY_KEYS.filter((key) => capabilities[key])

  const lines = [
    "Exocomp abilities (system constraints):",
    `- Preset: ${capabilities.preset}.`,
  ]

  if (enabledKeys.length === 0) {
    lines.push("- No active exocomp abilities. Stay observational and request explicit operator direction.")
  } else {
    for (const key of enabledKeys) {
      lines.push(`- ${CAPABILITY_INSTRUCTION_LINES[key]}`)
    }
  }

  return lines.join("\n")
}
