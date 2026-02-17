import { Prisma } from "@prisma/client"
import type { RuntimeRequest, RuntimeProvider, RuntimeAdapterCatalogEntry, RuntimeAdapterBinding } from "@/lib/types/runtime"
import { createRecoverableRuntimeError, RuntimeProviderError } from "@/lib/runtime/errors"
import { prisma } from "@/lib/prisma"
import { createGovernanceGrantEvent } from "@/lib/governance/events"
import type { RuntimeProfileName } from "@/lib/runtime/profiles"
import { codexCliRuntimeProvider } from "@/lib/runtime/providers/codex-cli"
import { localFallbackRuntimeProvider } from "@/lib/runtime/providers/local-fallback"
import { openAiFallbackRuntimeProvider } from "@/lib/runtime/providers/openai-fallback"
import { openClawRuntimeProvider } from "@/lib/runtime/providers/openclaw"
import { spacebotWebhookRuntimeProvider } from "@/lib/runtime/providers/spacebot-webhook"
import type { RuntimeProviderContext, RuntimeProviderDefinition } from "@/lib/runtime/providers/types"

interface RuntimeExecutionPlan {
  providerOrder: RuntimeProvider[]
  providersById: Record<string, RuntimeProviderDefinition>
  catalogByAdapterId: Map<string, RuntimeAdapterCatalogEntry>
}

interface ScopeCandidate {
  scope: "global" | "profile" | "user" | "deployment" | "subagent"
  scopeKey: string
  precedence: number
}

interface RuntimeAdapterCatalogEntryRecord {
  id: string
  adapterId: string
  name: string
  description: string | null
  protocol: "internal" | "webhook" | "openai_compat" | "mcp_sse" | "mcp_stdio" | "cli_exec"
  endpoint: string | null
  authRef: string | null
  capabilities: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  isSystem: boolean
  activationStatus: "pending" | "approved" | "denied"
  activationRationale: string | null
  activatedAt: string | null
  activatedByUserId: string | null
  activatedByBridgeCrewId: string | null
  activationSecurityReportId: string | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

interface RuntimeAdapterBindingRecord {
  id: string
  runtimeAdapterId: string
  adapterId: string
  scope: "global" | "profile" | "user" | "deployment" | "subagent"
  scopeKey: string
  priority: number
  enabled: boolean
  metadata: Record<string, unknown> | null
  createdByUserId: string | null
  createdAt: string
  updatedAt: string
}

interface BuiltinRuntimeAdapterCatalogSeed {
  adapterId: RuntimeProvider
  name: string
  description: string
  protocol: RuntimeAdapterCatalogEntryRecord["protocol"]
  endpoint: string | null
  authRef: string | null
  capabilities: Record<string, unknown>
  metadata: Record<string, unknown>
  activationStatus: RuntimeAdapterCatalogEntryRecord["activationStatus"]
  isSystem: boolean
}

const PROFILE_ENV_KEYS: Record<RuntimeProfileName, string> = {
  default: "RUNTIME_PROFILE_DEFAULT",
  quartermaster: "RUNTIME_PROFILE_QUARTERMASTER",
}

const BUILTIN_DEFAULT_PROFILE_CHAIN: Record<RuntimeProfileName, RuntimeProvider[]> = {
  default: ["openclaw", "openai-fallback", "local-fallback"],
  quartermaster: ["codex-cli", "openclaw", "openai-fallback", "local-fallback"],
}

const BUILTIN_RUNTIME_ADAPTERS: readonly BuiltinRuntimeAdapterCatalogSeed[] = [
  {
    adapterId: "openclaw",
    name: "OpenClaw Gateway",
    description: "Primary OpenClaw runtime connector.",
    protocol: "internal",
    endpoint: null,
    authRef: null,
    capabilities: {
      bridgeDispatch: true,
      controllable: false,
      internalOnly: true,
    },
    metadata: {
      source: "builtin",
      rollout: "stable",
    },
    activationStatus: "approved",
    isSystem: true,
  },
  {
    adapterId: "openai-fallback",
    name: "OpenAI Fallback",
    description: "Fallback runtime routed to OpenAI Responses API.",
    protocol: "openai_compat",
    endpoint: "https://api.openai.com",
    authRef: "env:OPENAI_API_KEY",
    capabilities: {
      bridgeDispatch: false,
      controllable: true,
      internalOnly: false,
    },
    metadata: {
      source: "builtin",
      rollout: "stable",
    },
    activationStatus: "approved",
    isSystem: true,
  },
  {
    adapterId: "local-fallback",
    name: "Local Fallback",
    description: "Local fail-open runtime fallback for resiliency.",
    protocol: "internal",
    endpoint: null,
    authRef: null,
    capabilities: {
      bridgeDispatch: false,
      controllable: true,
      internalOnly: true,
      mandatoryFallback: true,
    },
    metadata: {
      source: "builtin",
      rollout: "stable",
    },
    activationStatus: "approved",
    isSystem: true,
  },
  {
    adapterId: "codex-cli",
    name: "Codex CLI",
    description: "Codex CLI out-of-process runtime adapter.",
    protocol: "cli_exec",
    endpoint: null,
    authRef: null,
    capabilities: {
      bridgeDispatch: false,
      controllable: true,
      internalOnly: true,
    },
    metadata: {
      source: "builtin",
      rollout: "stable",
    },
    activationStatus: "approved",
    isSystem: true,
  },
  {
    adapterId: "spacebot-webhook",
    name: "Spacebot Webhook",
    description: "Reference external runtime adapter powered by Spacebot webhook transport.",
    protocol: "webhook",
    endpoint: "env:SPACEBOT_WEBHOOK_BASE_URL",
    authRef: "env:SPACEBOT_WEBHOOK_AUTH_TOKEN",
    capabilities: {
      bridgeDispatch: false,
      controllable: true,
      internalOnly: true,
      requiresFlag: "SPACEBOT_CONNECTOR_ENABLED",
    },
    metadata: {
      source: "builtin",
      rollout: "phase-1",
    },
    activationStatus: "approved",
    isSystem: true,
  },
]

const BUILTIN_PROVIDER_DEFINITIONS: Record<string, RuntimeProviderDefinition> = {
  openclaw: openClawRuntimeProvider,
  "openai-fallback": openAiFallbackRuntimeProvider,
  "local-fallback": localFallbackRuntimeProvider,
  "codex-cli": codexCliRuntimeProvider,
  "spacebot-webhook": spacebotWebhookRuntimeProvider,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asObjectJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }

  return fallback
}

function isPrismaSchemaUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const code = (error as { code?: unknown }).code
  return code === "P2021" || code === "P2022"
}

function uniqueProviders(input: RuntimeProvider[]): RuntimeProvider[] {
  const seen = new Set<RuntimeProvider>()
  const output: RuntimeProvider[] = []

  for (const provider of input) {
    if (seen.has(provider)) {
      continue
    }

    seen.add(provider)
    output.push(provider)
  }

  return output
}

function ensureLocalFallback(providerOrder: RuntimeProvider[]): RuntimeProvider[] {
  const deduped = uniqueProviders(providerOrder)

  if (!deduped.includes("local-fallback")) {
    deduped.push("local-fallback")
  }

  return deduped
}

function catalogDelegate() {
  const candidate = (prisma as unknown as Record<string, unknown>).runtimeAdapterCatalogEntry as {
    findMany?: (...args: unknown[]) => Promise<unknown[]>
    findFirst?: (...args: unknown[]) => Promise<unknown | null>
    upsert?: (...args: unknown[]) => Promise<unknown>
    create?: (...args: unknown[]) => Promise<unknown>
    update?: (...args: unknown[]) => Promise<unknown>
  } | undefined

  if (
    !candidate
    || typeof candidate.findMany !== "function"
    || typeof candidate.upsert !== "function"
    || typeof candidate.findFirst !== "function"
    || typeof candidate.create !== "function"
    || typeof candidate.update !== "function"
  ) {
    return null
  }

  return candidate
}

function bindingDelegate() {
  const candidate = (prisma as unknown as Record<string, unknown>).runtimeAdapterBinding as {
    findMany?: (...args: unknown[]) => Promise<unknown[]>
    upsert?: (...args: unknown[]) => Promise<unknown>
    create?: (...args: unknown[]) => Promise<unknown>
    update?: (...args: unknown[]) => Promise<unknown>
  } | undefined

  if (
    !candidate
    || typeof candidate.findMany !== "function"
    || typeof candidate.upsert !== "function"
    || typeof candidate.create !== "function"
    || typeof candidate.update !== "function"
  ) {
    return null
  }

  return candidate
}

function asCatalogEntryRecord(row: unknown): RuntimeAdapterCatalogEntryRecord | null {
  if (!row || typeof row !== "object") {
    return null
  }

  const record = row as Record<string, unknown>
  const id = asString(record.id)
  const adapterId = asString(record.adapterId)
  const name = asString(record.name)
  const protocol = asString(record.protocol)
  if (!id || !adapterId || !name || !protocol) {
    return null
  }

  if (
    protocol !== "internal"
    && protocol !== "webhook"
    && protocol !== "openai_compat"
    && protocol !== "mcp_sse"
    && protocol !== "mcp_stdio"
    && protocol !== "cli_exec"
  ) {
    return null
  }

  const activationStatus = asString(record.activationStatus)
  if (activationStatus !== "approved" && activationStatus !== "pending" && activationStatus !== "denied") {
    return null
  }

  const createdAt = record.createdAt instanceof Date ? record.createdAt.toISOString() : asString(record.createdAt)
  const updatedAt = record.updatedAt instanceof Date ? record.updatedAt.toISOString() : asString(record.updatedAt)
  if (!createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    adapterId,
    name,
    description: asString(record.description),
    protocol,
    endpoint: asString(record.endpoint),
    authRef: asString(record.authRef),
    capabilities: asObjectJson(record.capabilities),
    metadata: asObjectJson(record.metadata),
    isSystem: record.isSystem === true,
    activationStatus,
    activationRationale: asString(record.activationRationale),
    activatedAt:
      record.activatedAt instanceof Date
        ? record.activatedAt.toISOString()
        : asString(record.activatedAt),
    activatedByUserId: asString(record.activatedByUserId),
    activatedByBridgeCrewId: asString(record.activatedByBridgeCrewId),
    activationSecurityReportId: asString(record.activationSecurityReportId),
    createdByUserId: asString(record.createdByUserId),
    createdAt,
    updatedAt,
  }
}

function asBindingRecord(row: unknown): RuntimeAdapterBindingRecord | null {
  if (!row || typeof row !== "object") {
    return null
  }

  const record = row as Record<string, unknown>
  const id = asString(record.id)
  const runtimeAdapterId = asString(record.runtimeAdapterId)
  const adapterId = asString(record.adapterId)
  const scope = asString(record.scope)
  const scopeKey = asString(record.scopeKey)
  const createdAt = record.createdAt instanceof Date ? record.createdAt.toISOString() : asString(record.createdAt)
  const updatedAt = record.updatedAt instanceof Date ? record.updatedAt.toISOString() : asString(record.updatedAt)

  if (!id || !runtimeAdapterId || !adapterId || !scope || !scopeKey || !createdAt || !updatedAt) {
    return null
  }

  if (scope !== "global" && scope !== "profile" && scope !== "user" && scope !== "deployment" && scope !== "subagent") {
    return null
  }

  const priorityRaw = record.priority
  const priority = typeof priorityRaw === "number"
    ? priorityRaw
    : Number.parseInt(String(priorityRaw || "100"), 10)

  return {
    id,
    runtimeAdapterId,
    adapterId,
    scope,
    scopeKey,
    priority: Number.isFinite(priority) ? priority : 100,
    enabled: record.enabled !== false,
    metadata: asObjectJson(record.metadata),
    createdByUserId: asString(record.createdByUserId),
    createdAt,
    updatedAt,
  }
}

function builtinCatalogEntry(seed: BuiltinRuntimeAdapterCatalogSeed): RuntimeAdapterCatalogEntryRecord {
  return {
    id: `builtin:${seed.adapterId}`,
    adapterId: seed.adapterId,
    name: seed.name,
    description: seed.description,
    protocol: seed.protocol,
    endpoint: seed.endpoint,
    authRef: seed.authRef,
    capabilities: seed.capabilities,
    metadata: seed.metadata,
    isSystem: seed.isSystem,
    activationStatus: seed.activationStatus,
    activationRationale: seed.activationStatus === "approved" ? "Built-in runtime adapter" : null,
    activatedAt: null,
    activatedByUserId: null,
    activatedByBridgeCrewId: null,
    activationSecurityReportId: null,
    createdByUserId: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

function normalizeCatalogForApi(entry: RuntimeAdapterCatalogEntryRecord): RuntimeAdapterCatalogEntry {
  return {
    ...entry,
  }
}

function normalizeBindingForApi(binding: RuntimeAdapterBindingRecord): RuntimeAdapterBinding {
  return {
    ...binding,
  }
}

async function listPersistedCatalogEntries(): Promise<RuntimeAdapterCatalogEntryRecord[]> {
  const delegate = catalogDelegate()
  if (!delegate) {
    return []
  }

  try {
    const rows = await delegate.findMany!({
      orderBy: [
        { isSystem: "desc" },
        { activationStatus: "desc" },
        { name: "asc" },
      ],
    })

    const parsed = rows
      .map(asCatalogEntryRecord)
      .filter((entry): entry is RuntimeAdapterCatalogEntryRecord => Boolean(entry))

    return parsed
  } catch (error) {
    if (!isPrismaSchemaUnavailableError(error)) {
      console.warn("Failed to list runtime adapter catalog entries (fail-open):", error)
    }
    return []
  }
}

async function listPersistedBindings(args?: {
  scopes?: ScopeCandidate[]
}): Promise<RuntimeAdapterBindingRecord[]> {
  const delegate = bindingDelegate()
  if (!delegate) {
    return []
  }

  const scopeWhere = args?.scopes && args.scopes.length > 0
    ? {
      OR: args.scopes.map((scope) => ({
        scope: scope.scope,
        scopeKey: scope.scopeKey,
      })),
    }
    : undefined

  try {
    const rows = await delegate.findMany!({
      where: {
        ...(scopeWhere || {}),
      },
      include: {
        runtimeAdapter: true,
      },
      orderBy: [
        { priority: "asc" },
        { createdAt: "asc" },
      ],
    })

    const parsed = rows
      .map((row) => {
        const record = asRecord(row)
        const runtimeAdapter = asCatalogEntryRecord(record.runtimeAdapter)
        if (!runtimeAdapter) {
          return null
        }

        return asBindingRecord({
          ...record,
          adapterId: runtimeAdapter.adapterId,
        })
      })
      .filter((entry): entry is RuntimeAdapterBindingRecord => Boolean(entry))

    return parsed
  } catch (error) {
    if (!isPrismaSchemaUnavailableError(error)) {
      console.warn("Failed to list runtime adapter bindings (fail-open):", error)
    }
    return []
  }
}

function mergeCatalogEntries(
  persisted: RuntimeAdapterCatalogEntryRecord[],
): Map<string, RuntimeAdapterCatalogEntryRecord> {
  const map = new Map<string, RuntimeAdapterCatalogEntryRecord>()

  for (const builtin of BUILTIN_RUNTIME_ADAPTERS) {
    map.set(builtin.adapterId, builtinCatalogEntry(builtin))
  }

  for (const entry of persisted) {
    map.set(entry.adapterId, entry)
  }

  return map
}

function parseProfileOverride(args: {
  profile: RuntimeProfileName
  knownProviderIds: Set<string>
}): RuntimeProvider[] | null {
  const envKey = PROFILE_ENV_KEYS[args.profile]
  const raw = process.env[envKey]
  if (!raw || !raw.trim()) {
    return null
  }

  const providers: RuntimeProvider[] = []
  const unknownProviders: string[] = []

  for (const part of raw.split(",")) {
    const normalized = asString(part)?.toLowerCase()
    if (!normalized) {
      continue
    }

    if (!args.knownProviderIds.has(normalized)) {
      unknownProviders.push(normalized)
      continue
    }

    providers.push(normalized as RuntimeProvider)
  }

  if (unknownProviders.length > 0) {
    console.warn("Ignoring unknown runtime adapters in profile override", {
      profile: args.profile,
      unknownProviders,
    })
  }

  if (providers.length === 0) {
    return null
  }

  return ensureLocalFallback(providers)
}

function resolveRequestUserId(request: RuntimeRequest): string | null {
  if (request.userId) {
    return request.userId
  }

  const metadata = asRecord(request.metadata)
  return asString(metadata.userId)
}

function resolveRequestSubagentId(request: RuntimeRequest): string | null {
  const metadata = asRecord(request.metadata)
  const direct = asString(metadata.subagentId)
  if (direct) {
    return direct
  }

  const quartermaster = asRecord(metadata.quartermaster)
  const quartermasterSubagent = asString(quartermaster.subagentId)
  if (quartermasterSubagent) {
    return quartermasterSubagent
  }

  const bridge = asRecord(metadata.bridge)
  return asString(bridge.subagentId)
}

function resolveRequestDeploymentId(request: RuntimeRequest): string | null {
  const metadata = asRecord(request.metadata)

  const bridge = asRecord(metadata.bridge)
  const bridgeDeploymentId = asString(bridge.shipDeploymentId)
  if (bridgeDeploymentId) {
    return bridgeDeploymentId
  }

  const quartermaster = asRecord(metadata.quartermaster)
  const quartermasterDeploymentId = asString(quartermaster.shipDeploymentId)
  if (quartermasterDeploymentId) {
    return quartermasterDeploymentId
  }

  const shipContext = asRecord(metadata.shipContext)
  return asString(shipContext.shipDeploymentId) || asString(shipContext.deploymentId)
}

function resolveScopeCandidates(args: {
  request: RuntimeRequest
  profile: RuntimeProfileName
}): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = []

  const subagentId = resolveRequestSubagentId(args.request)
  if (subagentId) {
    candidates.push({
      scope: "subagent",
      scopeKey: subagentId,
      precedence: 0,
    })
  }

  const deploymentId = resolveRequestDeploymentId(args.request)
  if (deploymentId) {
    candidates.push({
      scope: "deployment",
      scopeKey: deploymentId,
      precedence: 1,
    })
  }

  const userId = resolveRequestUserId(args.request)
  if (userId) {
    candidates.push({
      scope: "user",
      scopeKey: userId,
      precedence: 2,
    })
  }

  candidates.push({
    scope: "profile",
    scopeKey: args.profile,
    precedence: 3,
  })

  candidates.push({
    scope: "global",
    scopeKey: "global",
    precedence: 4,
  })

  return candidates
}

function bindingScopeOrderKey(binding: RuntimeAdapterBindingRecord): string {
  return `${binding.scope}:${binding.scopeKey}`
}

function resolveBuiltinProviderDefinition(providerId: RuntimeProvider): RuntimeProviderDefinition | null {
  if (providerId === "spacebot-webhook" && !isSpacebotConnectorEnabled()) {
    return null
  }

  return BUILTIN_PROVIDER_DEFINITIONS[providerId] || null
}

function resolveWebhookTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.RUNTIME_ADAPTER_WEBHOOK_TIMEOUT_MS || "45000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 45000
  }
  return parsed
}

function extractWebhookOutput(payload: unknown): string | null {
  const root = asRecord(payload)
  const data = asRecord(root.data)
  const candidates = [
    root.output,
    root.response,
    root.text,
    root.message,
    root.output_text,
    data.output,
    data.text,
    data.response,
    data.message,
  ]

  for (const candidate of candidates) {
    const value = asString(candidate)
    if (value) {
      return value
    }
  }

  return null
}

function createWebhookCatalogRuntimeProvider(entry: RuntimeAdapterCatalogEntryRecord): RuntimeProviderDefinition | null {
  const endpoint = asString(entry.endpoint)
  if (!endpoint) {
    return null
  }

  return {
    id: entry.adapterId,
    async run(request: RuntimeRequest, context: RuntimeProviderContext) {
      const timeoutMs = resolveWebhookTimeoutMs()
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId: request.sessionId,
            prompt: request.prompt,
            metadata: request.metadata || {},
            context: {
              profile: context.profile,
              previousErrors: context.previousErrors,
              previousErrorDetails: context.previousErrorDetails,
            },
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw createRecoverableRuntimeError({
            provider: entry.adapterId,
            code: "RUNTIME_ADAPTER_WEBHOOK_HTTP_ERROR",
            message: `${entry.adapterId} webhook adapter returned HTTP ${response.status}.`,
            details: {
              endpoint,
              status: response.status,
            },
          })
        }

        const payload = await response.json().catch(() => ({}))
        const output = extractWebhookOutput(payload)
        if (!output) {
          throw createRecoverableRuntimeError({
            provider: entry.adapterId,
            code: "RUNTIME_ADAPTER_WEBHOOK_MISSING_OUTPUT",
            message: `${entry.adapterId} webhook adapter did not return output text.`,
            details: {
              endpoint,
              payload,
            },
          })
        }

        return {
          provider: entry.adapterId,
          output,
          fallbackUsed: false,
          metadata: {
            endpoint,
            protocol: entry.protocol,
          },
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          throw createRecoverableRuntimeError({
            provider: entry.adapterId,
            code: "RUNTIME_ADAPTER_WEBHOOK_TIMEOUT",
            message: `${entry.adapterId} webhook adapter timed out after ${timeoutMs}ms.`,
            details: {
              endpoint,
            },
          })
        }

        if (error instanceof RuntimeProviderError) {
          throw error
        }

        throw createRecoverableRuntimeError({
          provider: entry.adapterId,
          code: "RUNTIME_ADAPTER_WEBHOOK_FAILED",
          message: `${entry.adapterId} webhook adapter failed: ${(error as Error)?.message || "Unknown error"}`,
          details: {
            endpoint,
          },
        })
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

function resolveCatalogRuntimeProviderDefinition(
  entry: RuntimeAdapterCatalogEntryRecord,
): RuntimeProviderDefinition | null {
  if (entry.adapterId in BUILTIN_PROVIDER_DEFINITIONS) {
    return resolveBuiltinProviderDefinition(entry.adapterId)
  }

  if (entry.protocol === "webhook") {
    return createWebhookCatalogRuntimeProvider(entry)
  }

  return null
}

function buildKnownProviderIds(catalogByAdapterId: Map<string, RuntimeAdapterCatalogEntryRecord>): Set<string> {
  const ids = new Set<string>()

  for (const id of Object.keys(BUILTIN_PROVIDER_DEFINITIONS)) {
    ids.add(id)
  }

  for (const [adapterId] of catalogByAdapterId) {
    ids.add(adapterId)
  }

  return ids
}

function resolveLegacyFallbackOrder(profile: RuntimeProfileName): RuntimeProvider[] {
  return ensureLocalFallback(BUILTIN_DEFAULT_PROFILE_CHAIN[profile] || BUILTIN_DEFAULT_PROFILE_CHAIN.default)
}

function isControllableRuntimeProviderFromCatalog(
  entry: RuntimeAdapterCatalogEntryRecord | null,
  providerIdFallback?: string,
): boolean {
  if (!entry) {
    return providerIdFallback !== "openclaw"
  }

  const capabilities = entry.capabilities || {}
  if (typeof capabilities.controllable === "boolean") {
    return capabilities.controllable
  }

  return (providerIdFallback || entry.adapterId) !== "openclaw"
}

function isBridgeDispatchRuntimeFromCatalog(
  entry: RuntimeAdapterCatalogEntryRecord | null,
  runtimeIdFallback?: string,
): boolean {
  if (!entry) {
    return runtimeIdFallback === "openclaw"
  }

  const capabilities = entry.capabilities || {}
  if (typeof capabilities.bridgeDispatch === "boolean") {
    return capabilities.bridgeDispatch
  }

  return entry.adapterId === "openclaw"
}

export function isRuntimeAdapterRegistryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return asBoolean(env.RUNTIME_ADAPTER_REGISTRY_ENABLED, false)
}

export function isBridgeDispatchRegistryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return asBoolean(env.BRIDGE_DISPATCH_REGISTRY_ENABLED, false)
}

export function isToolchainProtocolRegistryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return asBoolean(env.TOOLCHAIN_PROTOCOL_REGISTRY_ENABLED, false)
}

export function isSpacebotConnectorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return asBoolean(env.SPACEBOT_CONNECTOR_ENABLED, false)
}

function isRuntimeAdapterId(value: string): boolean {
  return /^[a-z0-9._-]+$/u.test(value)
}

function parseProtocol(value: unknown): RuntimeAdapterCatalogEntryRecord["protocol"] | null {
  if (value === "internal" || value === "webhook" || value === "openai_compat" || value === "mcp_sse" || value === "mcp_stdio" || value === "cli_exec") {
    return value
  }
  return null
}

export class RuntimeAdapterRegistryError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "RuntimeAdapterRegistryError"
    this.status = status
  }
}

export async function createRuntimeAdapterCatalogEntry(args: {
  adapterId: string
  name: string
  description?: string | null
  protocol: RuntimeAdapterCatalogEntryRecord["protocol"]
  endpoint?: string | null
  authRef?: string | null
  capabilities?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  createdByUserId?: string | null
}): Promise<RuntimeAdapterCatalogEntry> {
  const delegate = catalogDelegate()
  if (!delegate) {
    throw new RuntimeAdapterRegistryError("Runtime adapter registry is unavailable. Run database migrations first.", 503)
  }

  const adapterId = asString(args.adapterId)?.toLowerCase()
  const name = asString(args.name)
  const protocol = parseProtocol(args.protocol)

  if (!adapterId || !isRuntimeAdapterId(adapterId)) {
    throw new RuntimeAdapterRegistryError("adapterId is required and must match [a-z0-9._-]+.")
  }

  if (!name) {
    throw new RuntimeAdapterRegistryError("name is required.")
  }

  if (!protocol) {
    throw new RuntimeAdapterRegistryError("protocol must be one of: internal, webhook, openai_compat, mcp_sse, mcp_stdio, cli_exec.")
  }

  const existing = asCatalogEntryRecord(
    await delegate.findFirst!({
      where: {
        adapterId,
      },
    }),
  )

  if (existing) {
    throw new RuntimeAdapterRegistryError(`Runtime adapter ${adapterId} already exists.`, 409)
  }

  const created = asCatalogEntryRecord(
    await delegate.create!({
      data: {
        adapterId,
        name,
        description: asString(args.description) || null,
        protocol,
        endpoint: asString(args.endpoint) || null,
        authRef: asString(args.authRef) || null,
        capabilities: args.capabilities ?? Prisma.JsonNull,
        metadata: args.metadata ?? Prisma.JsonNull,
        activationStatus: "pending",
        isSystem: false,
        ...(args.createdByUserId
          ? {
            createdByUserId: args.createdByUserId,
          }
          : {}),
      },
    }),
  )

  if (!created) {
    throw new RuntimeAdapterRegistryError("Failed to create runtime adapter.", 500)
  }

  return normalizeCatalogForApi(created)
}

export async function updateRuntimeAdapterActivation(args: {
  idOrAdapterId: string
  decision: "approve" | "deny"
  rationale: string
  reviewedByUserId: string
  actingBridgeCrewId?: string | null
}): Promise<RuntimeAdapterCatalogEntry> {
  const delegate = catalogDelegate()
  if (!delegate) {
    throw new RuntimeAdapterRegistryError("Runtime adapter registry is unavailable. Run database migrations first.", 503)
  }

  const idOrAdapterId = asString(args.idOrAdapterId)
  const rationale = asString(args.rationale)
  if (!idOrAdapterId) {
    throw new RuntimeAdapterRegistryError("Runtime adapter id is required.")
  }
  if (!rationale) {
    throw new RuntimeAdapterRegistryError("rationale is required.")
  }

  const existing = asCatalogEntryRecord(
    await delegate.findFirst!({
      where: {
        OR: [
          {
            id: idOrAdapterId,
          },
          {
            adapterId: idOrAdapterId,
          },
        ],
      },
    }),
  )

  if (!existing) {
    throw new RuntimeAdapterRegistryError("Runtime adapter not found.", 404)
  }

  const updated = asCatalogEntryRecord(
    await delegate.update!({
      where: {
        id: existing.id,
      },
      data: {
        activationStatus: args.decision === "approve" ? "approved" : "denied",
        activationRationale: rationale,
        activatedAt: new Date(),
        activatedByUserId: args.reviewedByUserId,
        activatedByBridgeCrewId: asString(args.actingBridgeCrewId) || null,
      },
    }),
  )

  if (!updated) {
    throw new RuntimeAdapterRegistryError("Failed to update runtime adapter activation status.", 500)
  }

  try {
    await createGovernanceGrantEvent({
      ownerUserId: args.reviewedByUserId,
      createdByUserId: args.reviewedByUserId,
      eventType: args.decision === "approve" ? "runtime_activation_approved" : "runtime_activation_denied",
      runtimeAdapterCatalogEntryId: updated.id,
      actorBridgeCrewId: asString(args.actingBridgeCrewId) || null,
      rationale,
      metadata: {
        adapterId: updated.adapterId,
        decision: args.decision,
      },
    })
  } catch (error) {
    console.warn("Failed to record runtime activation governance event (fail-open):", error)
  }

  return normalizeCatalogForApi(updated)
}

export async function upsertRuntimeAdapterBindings(args: {
  bindings: Array<{
    adapterId: string
    scope: RuntimeAdapterBindingRecord["scope"]
    scopeKey: string
    priority?: number
    enabled?: boolean
    metadata?: Record<string, unknown> | null
  }>
  createdByUserId?: string | null
}): Promise<RuntimeAdapterBinding[]> {
  const delegate = bindingDelegate()
  if (!delegate) {
    throw new RuntimeAdapterRegistryError("Runtime adapter bindings are unavailable. Run database migrations first.", 503)
  }

  await upsertBuiltinRuntimeAdapters()
  const catalog = await listPersistedCatalogEntries()
  const catalogByAdapterId = new Map(catalog.map((entry) => [entry.adapterId, entry]))
  const output: RuntimeAdapterBinding[] = []

  for (const binding of args.bindings) {
    const adapterId = asString(binding.adapterId)?.toLowerCase()
    const scopeKey = asString(binding.scopeKey)
    const scope = binding.scope
    if (!adapterId || !scopeKey) {
      throw new RuntimeAdapterRegistryError("Each binding requires adapterId and scopeKey.")
    }

    const catalogEntry = catalogByAdapterId.get(adapterId)
    if (!catalogEntry) {
      throw new RuntimeAdapterRegistryError(`Unknown runtime adapter for binding: ${adapterId}.`, 404)
    }

    const priority = Number.isFinite(binding.priority) ? Math.trunc(binding.priority as number) : 100

    const upserted = asBindingRecord(
      await delegate.upsert!({
        where: {
          runtimeAdapterId_scope_scopeKey: {
            runtimeAdapterId: catalogEntry.id,
            scope,
            scopeKey,
          },
        },
        create: {
          runtimeAdapterId: catalogEntry.id,
          scope,
          scopeKey,
          priority,
          enabled: binding.enabled !== false,
          metadata: binding.metadata ?? Prisma.JsonNull,
          ...(args.createdByUserId
            ? {
              createdByUserId: args.createdByUserId,
            }
            : {}),
        },
        update: {
          priority,
          enabled: binding.enabled !== false,
          metadata: binding.metadata ?? Prisma.JsonNull,
        },
      }),
    )

    if (!upserted) {
      continue
    }

    output.push(
      normalizeBindingForApi({
        ...upserted,
        adapterId: catalogEntry.adapterId,
      }),
    )
  }

  return output
}

export async function listRuntimeAdapterCatalogEntries(): Promise<RuntimeAdapterCatalogEntry[]> {
  const persisted = await listPersistedCatalogEntries()
  const merged = mergeCatalogEntries(persisted)

  return [...merged.values()]
    .sort((left, right) => {
      if (left.isSystem !== right.isSystem) {
        return left.isSystem ? -1 : 1
      }

      return left.name.localeCompare(right.name)
    })
    .map(normalizeCatalogForApi)
}

export async function listRuntimeAdapterBindings(): Promise<RuntimeAdapterBinding[]> {
  const bindings = await listPersistedBindings()
  return bindings.map(normalizeBindingForApi)
}

export async function upsertBuiltinRuntimeAdapters(): Promise<void> {
  const delegate = catalogDelegate()
  if (!delegate) {
    return
  }

  for (const builtin of BUILTIN_RUNTIME_ADAPTERS) {
    try {
      await delegate.upsert!({
        where: {
          adapterId: builtin.adapterId,
        },
        create: {
          adapterId: builtin.adapterId,
          name: builtin.name,
          description: builtin.description,
          protocol: builtin.protocol,
          endpoint: builtin.endpoint,
          authRef: builtin.authRef,
          capabilities: builtin.capabilities,
          metadata: builtin.metadata,
          isSystem: builtin.isSystem,
          activationStatus: builtin.activationStatus,
          activationRationale: "Built-in runtime adapter",
        },
        update: {
          name: builtin.name,
          description: builtin.description,
          protocol: builtin.protocol,
          endpoint: builtin.endpoint,
          authRef: builtin.authRef,
          capabilities: builtin.capabilities,
          metadata: builtin.metadata,
          isSystem: builtin.isSystem,
        },
      })
    } catch (error) {
      if (!isPrismaSchemaUnavailableError(error)) {
        console.warn("Unable to seed built-in runtime adapter entry (fail-open):", {
          adapterId: builtin.adapterId,
          error,
        })
      }
    }
  }
}

export async function upsertDefaultRuntimeAdapterBindings(args: {
  userId?: string | null
} = {}): Promise<void> {
  const delegate = bindingDelegate()
  const catalogRows = await listPersistedCatalogEntries()
  const catalogByAdapterId = mergeCatalogEntries(catalogRows)

  if (!delegate || catalogByAdapterId.size === 0) {
    return
  }

  const defaultBindings: Array<{
    adapterId: RuntimeProvider
    scope: RuntimeAdapterBindingRecord["scope"]
    scopeKey: string
    priority: number
    enabled: boolean
  }> = [
    {
      adapterId: "openclaw",
      scope: "profile",
      scopeKey: "default",
      priority: 10,
      enabled: true,
    },
    {
      adapterId: "openai-fallback",
      scope: "profile",
      scopeKey: "default",
      priority: 20,
      enabled: true,
    },
    {
      adapterId: "local-fallback",
      scope: "profile",
      scopeKey: "default",
      priority: 30,
      enabled: true,
    },
    {
      adapterId: "codex-cli",
      scope: "profile",
      scopeKey: "quartermaster",
      priority: 10,
      enabled: true,
    },
    {
      adapterId: "openclaw",
      scope: "profile",
      scopeKey: "quartermaster",
      priority: 20,
      enabled: true,
    },
    {
      adapterId: "openai-fallback",
      scope: "profile",
      scopeKey: "quartermaster",
      priority: 30,
      enabled: true,
    },
    {
      adapterId: "local-fallback",
      scope: "profile",
      scopeKey: "quartermaster",
      priority: 40,
      enabled: true,
    },
    {
      adapterId: "spacebot-webhook",
      scope: "profile",
      scopeKey: "default",
      priority: 15,
      enabled: false,
    },
  ]

  for (const binding of defaultBindings) {
    const catalog = catalogByAdapterId.get(binding.adapterId)
    if (!catalog) {
      continue
    }

    try {
      await delegate.upsert!({
        where: {
          runtimeAdapterId_scope_scopeKey: {
            runtimeAdapterId: catalog.id,
            scope: binding.scope,
            scopeKey: binding.scopeKey,
          },
        },
        create: {
          runtimeAdapterId: catalog.id,
          scope: binding.scope,
          scopeKey: binding.scopeKey,
          priority: binding.priority,
          enabled: binding.enabled,
          metadata: {
            source: "seed",
          },
          ...(args.userId
            ? {
                createdByUserId: args.userId,
              }
            : {}),
        },
        update: {
          priority: binding.priority,
          enabled: binding.enabled,
        },
      })
    } catch (error) {
      if (!isPrismaSchemaUnavailableError(error)) {
        console.warn("Unable to seed default runtime binding (fail-open):", {
          adapterId: binding.adapterId,
          scope: binding.scope,
          scopeKey: binding.scopeKey,
          error,
        })
      }
    }
  }
}

export function isRuntimeProviderControllable(args: {
  providerId: RuntimeProvider
  catalogByAdapterId?: Map<string, RuntimeAdapterCatalogEntry>
}): boolean {
  const catalog = args.catalogByAdapterId?.get(args.providerId)
  return isControllableRuntimeProviderFromCatalog(
    (catalog as RuntimeAdapterCatalogEntryRecord | undefined) || null,
    args.providerId,
  )
}

export function isBridgeDispatchRuntimeId(args: {
  runtimeId: string
  catalogByAdapterId?: Map<string, RuntimeAdapterCatalogEntry>
}): boolean {
  const catalog = args.catalogByAdapterId?.get(args.runtimeId)
  return isBridgeDispatchRuntimeFromCatalog(
    (catalog as RuntimeAdapterCatalogEntryRecord | undefined) || null,
    args.runtimeId,
  )
}

export async function resolveRuntimeExecutionPlan(args: {
  request: RuntimeRequest
  profile: RuntimeProfileName
  legacyProviderOrder: RuntimeProvider[]
}): Promise<RuntimeExecutionPlan> {
  const persistedCatalog = isRuntimeAdapterRegistryEnabled()
    ? await listPersistedCatalogEntries()
    : []

  const catalogByAdapterId = mergeCatalogEntries(persistedCatalog)
  const knownProviderIds = buildKnownProviderIds(catalogByAdapterId)

  const profileOverride = parseProfileOverride({
    profile: args.profile,
    knownProviderIds,
  })

  let providerOrder: RuntimeProvider[]
  if (!isRuntimeAdapterRegistryEnabled()) {
    providerOrder = ensureLocalFallback(args.legacyProviderOrder)
  } else if (profileOverride) {
    providerOrder = profileOverride
  } else {
    const scopeCandidates = resolveScopeCandidates({
      request: args.request,
      profile: args.profile,
    })

    const bindingPrecedence = new Map<string, number>()
    for (const scope of scopeCandidates) {
      bindingPrecedence.set(`${scope.scope}:${scope.scopeKey}`, scope.precedence)
    }

    const bindings = await listPersistedBindings({
      scopes: scopeCandidates,
    })

    const approvedBindings = bindings
      .filter((binding) => binding.enabled)
      .filter((binding) => {
        const catalog = catalogByAdapterId.get(binding.adapterId)
        if (!catalog) {
          return false
        }

        return catalog.activationStatus === "approved"
      })
      .sort((left, right) => {
        const leftPrecedence = bindingPrecedence.get(bindingScopeOrderKey(left)) ?? 999
        const rightPrecedence = bindingPrecedence.get(bindingScopeOrderKey(right)) ?? 999
        if (leftPrecedence !== rightPrecedence) {
          return leftPrecedence - rightPrecedence
        }

        if (left.priority !== right.priority) {
          return left.priority - right.priority
        }

        return left.createdAt.localeCompare(right.createdAt)
      })

    if (approvedBindings.length === 0) {
      providerOrder = ensureLocalFallback(args.legacyProviderOrder)
    } else {
      providerOrder = ensureLocalFallback(
        approvedBindings.map((binding) => binding.adapterId as RuntimeProvider),
      )
    }
  }

  const providersById: Record<string, RuntimeProviderDefinition> = {}

  for (const providerId of providerOrder) {
    const catalog = catalogByAdapterId.get(providerId)
    const provider = catalog
      ? resolveCatalogRuntimeProviderDefinition(catalog)
      : resolveBuiltinProviderDefinition(providerId)

    if (!provider) {
      continue
    }

    providersById[provider.id] = provider
  }

  const orderWithAvailableProviders = providerOrder.filter((providerId) => providerId in providersById)
  if (orderWithAvailableProviders.length === 0) {
    const legacy = resolveLegacyFallbackOrder(args.profile)
    for (const providerId of legacy) {
      const provider = resolveBuiltinProviderDefinition(providerId)
      if (provider) {
        providersById[provider.id] = provider
      }
    }

    return {
      providerOrder: legacy.filter((providerId) => providerId in providersById),
      providersById,
      catalogByAdapterId: new Map(
        [...catalogByAdapterId.values()].map((entry) => [entry.adapterId, normalizeCatalogForApi(entry)]),
      ),
    }
  }

  return {
    providerOrder: orderWithAvailableProviders,
    providersById,
    catalogByAdapterId: new Map(
      [...catalogByAdapterId.values()].map((entry) => [entry.adapterId, normalizeCatalogForApi(entry)]),
    ),
  }
}

export async function listBridgeDispatchRuntimeCatalogEntries(): Promise<RuntimeAdapterCatalogEntry[]> {
  const catalog = await listRuntimeAdapterCatalogEntries()

  const filtered = catalog
    .filter((entry) => entry.activationStatus === "approved")
    .filter((entry) => isBridgeDispatchRuntimeFromCatalog(entry as RuntimeAdapterCatalogEntryRecord))

  if (filtered.length === 0) {
    const openclaw = catalog.find((entry) => entry.adapterId === "openclaw")
    return openclaw ? [openclaw] : []
  }

  return filtered
}

export async function resolveRuntimeAdapterByProviderId(providerId: string): Promise<RuntimeAdapterCatalogEntry | null> {
  const catalog = await listRuntimeAdapterCatalogEntries()
  return catalog.find((entry) => entry.adapterId === providerId) || null
}

export async function resolveRuntimeCatalogMap(): Promise<Map<string, RuntimeAdapterCatalogEntry>> {
  const entries = await listRuntimeAdapterCatalogEntries()
  return new Map(entries.map((entry) => [entry.adapterId, entry]))
}
