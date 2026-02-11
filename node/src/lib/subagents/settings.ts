import { z } from "zod"
import { DEFAULT_EXOCOMP_CAPABILITIES } from "./capabilities"

export const HARNESS_RUNTIME_PROFILES = ["default", "quartermaster"] as const
export type HarnessRuntimeProfile = (typeof HARNESS_RUNTIME_PROFILES)[number]

const OrchestrationSettingsSchema = z.object({
  handoffEnabled: z.boolean().default(true),
  handoffMode: z.enum(["manual", "assisted", "auto"]).default("assisted"),
  riskChecksEnabled: z.boolean().default(true),
  outputContractStrict: z.boolean().default(true),
})

const WorkspaceSettingsSchema = z.object({
  workingDirectory: z.string().default(""),
  includePaths: z.array(z.string()).default([]),
  excludePaths: z.array(z.string()).default([]),
})

const MemorySettingsSchema = z.object({
  mode: z.enum(["session", "rolling", "ephemeral"]).default("session"),
  maxEntries: z.number().int().min(1).max(1000).default(50),
  summaryStyle: z.enum(["concise", "detailed"]).default("concise"),
})

const GuidelinesSettingsSchema = z.object({
  references: z.array(z.string()).default([]),
  notes: z.string().default(""),
})

const CapabilitiesSettingsSchema = z.object({
  preset: z.enum(["core_maintenance"]).default(DEFAULT_EXOCOMP_CAPABILITIES.preset),
  diagnostics: z.boolean().default(DEFAULT_EXOCOMP_CAPABILITIES.diagnostics),
  microRepairPlanning: z.boolean().default(DEFAULT_EXOCOMP_CAPABILITIES.microRepairPlanning),
  hazardChecks: z.boolean().default(DEFAULT_EXOCOMP_CAPABILITIES.hazardChecks),
  safeShutdownGuidance: z.boolean().default(DEFAULT_EXOCOMP_CAPABILITIES.safeShutdownGuidance),
  statusRelay: z.boolean().default(DEFAULT_EXOCOMP_CAPABILITIES.statusRelay),
})

const HarnessAutoloadSchema = z.object({
  context: z.boolean().default(true),
  tools: z.boolean().default(true),
  skills: z.boolean().default(true),
})

const HarnessSettingsSchema = z.object({
  runtimeProfile: z.enum(HARNESS_RUNTIME_PROFILES).default("default"),
  autoload: HarnessAutoloadSchema.default({
    context: true,
    tools: true,
    skills: true,
  }),
  applyWhenSubagentPresent: z.boolean().default(true),
  failureMode: z.literal("fail-open").default("fail-open"),
})

export const SubagentSettingsSchema = z.object({
  orchestration: OrchestrationSettingsSchema.default({
    handoffEnabled: true,
    handoffMode: "assisted",
    riskChecksEnabled: true,
    outputContractStrict: true,
  }),
  workspace: WorkspaceSettingsSchema.default({
    workingDirectory: "",
    includePaths: [],
    excludePaths: [],
  }),
  memory: MemorySettingsSchema.default({
    mode: "session",
    maxEntries: 50,
    summaryStyle: "concise",
  }),
  guidelines: GuidelinesSettingsSchema.default({
    references: [],
    notes: "",
  }),
  capabilities: CapabilitiesSettingsSchema.default(DEFAULT_EXOCOMP_CAPABILITIES),
  harness: HarnessSettingsSchema.default({
    runtimeProfile: "default",
    autoload: {
      context: true,
      tools: true,
      skills: true,
    },
    applyWhenSubagentPresent: true,
    failureMode: "fail-open",
  }),
})

export const PartialSubagentSettingsSchema = z.object({
  orchestration: OrchestrationSettingsSchema.partial().optional(),
  workspace: WorkspaceSettingsSchema.partial().optional(),
  memory: MemorySettingsSchema.partial().optional(),
  guidelines: GuidelinesSettingsSchema.partial().optional(),
  capabilities: CapabilitiesSettingsSchema.partial().optional(),
  harness: z.object({
    runtimeProfile: z.enum(HARNESS_RUNTIME_PROFILES).optional(),
    autoload: HarnessAutoloadSchema.partial().optional(),
    applyWhenSubagentPresent: z.boolean().optional(),
    failureMode: z.literal("fail-open").optional(),
  }).optional(),
})

export type SubagentSettings = z.infer<typeof SubagentSettingsSchema>
export type PartialSubagentSettings = z.infer<typeof PartialSubagentSettingsSchema>
export type SubagentHarnessSettings = z.infer<typeof HarnessSettingsSchema>

export const DEFAULT_SUBAGENT_SETTINGS: SubagentSettings = SubagentSettingsSchema.parse({})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(patch)) {
    return [...patch]
  }

  if (isRecord(base) && isRecord(patch)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      const current = merged[key]
      merged[key] = deepMerge(current, value)
    }
    return merged
  }

  return patch === undefined ? base : patch
}

export function normalizeSubagentSettings(input: unknown): SubagentSettings {
  const parsed = SubagentSettingsSchema.safeParse(input)
  if (parsed.success) {
    return parsed.data
  }
  return DEFAULT_SUBAGENT_SETTINGS
}

export function mergeSubagentSettings(
  base: unknown,
  patch: unknown,
): SubagentSettings {
  const normalizedBase = normalizeSubagentSettings(base)
  const parsedPatch = PartialSubagentSettingsSchema.safeParse(patch)
  if (!parsedPatch.success) {
    return normalizedBase
  }

  return normalizeSubagentSettings(deepMerge(normalizedBase, parsedPatch.data))
}
