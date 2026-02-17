import type { AgentDeployment, Prisma, Session, Subagent } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  ensureSystemPermissionPolicies,
  replaceSubagentPermissionPolicyAssignments,
} from "@/lib/execution/permission-policies"
import {
  QUARTERMASTER_CALLSIGN,
  QUARTERMASTER_CHANNEL,
  QUARTERMASTER_CONTEXT_PATH,
  QUARTERMASTER_CONTEXT_TEMPLATE_VERSION,
  QUARTERMASTER_FLEET_SCOPE,
  QUARTERMASTER_LOOP_DEFAULTS,
  QUARTERMASTER_ROLE_KEY,
  QUARTERMASTER_RUNTIME_PROFILE,
  parseQuartermasterExecutionLevel,
  quartermasterAuthorityForExecutionLevel,
  quartermasterDiagnosticsScopeForExecutionLevel,
  quartermasterFleetSessionTitle,
  quartermasterFleetSubagentName,
  quartermasterPolicySlugForExecutionLevel,
  type QuartermasterExecutionLevel,
  type QuartermasterLoopDefaults,
} from "@/lib/quartermaster/constants"
import { buildQuartermasterSubagentContent } from "@/lib/quartermaster/context-template"

interface ShipSummary {
  id: string
  name: string
  status: AgentDeployment["status"]
  nodeId: string
  nodeType: AgentDeployment["nodeType"]
  deploymentProfile: AgentDeployment["deploymentProfile"]
  healthStatus: string | null
  lastHealthCheck: Date | null
  updatedAt: Date
  metadata: Prisma.JsonValue | null
}

interface QuartermasterControlState {
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
}

interface QuartermasterMetadata {
  enabled: boolean
  roleKey: string
  callsign: string
  authority: string
  runtimeProfile: string
  diagnosticsScope: QuartermasterExecutionLevel
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
  channel: string
  policySlug: string
  subagentId: string | null
  sessionId: string | null
  provisionedAt: string | null
}

export interface ShipQuartermasterState {
  ship: {
    id: string
    name: string
    status: AgentDeployment["status"]
    nodeId: string
    nodeType: AgentDeployment["nodeType"]
    deploymentProfile: AgentDeployment["deploymentProfile"]
    healthStatus: string | null
    lastHealthCheck: string | null
    updatedAt: string
  }
  quartermaster: QuartermasterMetadata
  subagent: {
    id: string
    name: string
    description: string | null
  } | null
  session: {
    id: string
    title: string | null
    status: Session["status"]
    updatedAt: string
    createdAt: string
  } | null
}

interface EnsureShipQuartermasterArgs {
  userId: string
  shipDeploymentId: string
  shipName?: string
}

export interface UpdateShipQuartermasterConfigArgs {
  userId: string
  shipDeploymentId: string
  executionLevel: QuartermasterExecutionLevel
  loopDefaults?: Partial<QuartermasterLoopDefaults>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function quartermasterPromptTemplate(): string {
  return buildQuartermasterSubagentContent()
}

function inferExecutionLevelFromLegacy(args: {
  policySlug?: string | null
  diagnosticsScope?: string | null
  authority?: string | null
  fallback?: QuartermasterExecutionLevel
}): QuartermasterExecutionLevel {
  const policySlug = args.policySlug?.trim().toLowerCase() || ""
  if (policySlug.includes("executive-full")) {
    return "danger_full_access"
  }
  if (policySlug.includes("executive-workspace")) {
    return "workspace_write"
  }
  if (policySlug.includes("readonly")) {
    return "read_only"
  }

  const diagnosticsScope = args.diagnosticsScope?.trim().toLowerCase() || ""
  if (diagnosticsScope === "danger_full_access") {
    return "danger_full_access"
  }
  if (diagnosticsScope === "workspace_write") {
    return "workspace_write"
  }
  if (diagnosticsScope === "read_only") {
    return "read_only"
  }

  const authority = args.authority?.trim().toLowerCase() || ""
  if (authority === "executive_operator") {
    return "danger_full_access"
  }

  return args.fallback || "read_only"
}

function normalizeLoopDefaults(
  input: unknown,
  fallback: QuartermasterLoopDefaults = QUARTERMASTER_LOOP_DEFAULTS,
): QuartermasterLoopDefaults {
  const record = asRecord(input)
  const intervalSeconds = clamp(
    asInteger(record.intervalSeconds) ?? fallback.intervalSeconds,
    10,
    3600,
  )
  const maxDurationSeconds = clamp(
    asInteger(record.maxDurationSeconds) ?? fallback.maxDurationSeconds,
    60,
    24 * 60 * 60,
  )
  const maxIterations = clamp(
    asInteger(record.maxIterations) ?? fallback.maxIterations,
    1,
    1000,
  )
  const autoStopOnHealthyActive =
    asBoolean(record.autoStopOnHealthyActive) ?? fallback.autoStopOnHealthyActive

  return {
    intervalSeconds,
    maxDurationSeconds,
    maxIterations,
    autoStopOnHealthyActive,
  }
}

function mergeLoopDefaults(
  base: QuartermasterLoopDefaults,
  patch: Partial<QuartermasterLoopDefaults> | undefined,
): QuartermasterLoopDefaults {
  if (!patch) {
    return base
  }

  return normalizeLoopDefaults(
    {
      ...base,
      ...patch,
    },
    base,
  )
}

function controlStateFromExecution(args: {
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
}): QuartermasterControlState {
  return {
    executionLevel: args.executionLevel,
    loopDefaults: args.loopDefaults,
  }
}

function metadataFromControl(args: {
  control: QuartermasterControlState
  enabled: boolean
  subagentId?: string | null
  sessionId?: string | null
  provisionedAt?: string | null
}): QuartermasterMetadata {
  return {
    enabled: args.enabled,
    roleKey: QUARTERMASTER_ROLE_KEY,
    callsign: QUARTERMASTER_CALLSIGN,
    authority: quartermasterAuthorityForExecutionLevel(args.control.executionLevel),
    runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
    diagnosticsScope: quartermasterDiagnosticsScopeForExecutionLevel(args.control.executionLevel),
    executionLevel: args.control.executionLevel,
    loopDefaults: args.control.loopDefaults,
    channel: QUARTERMASTER_CHANNEL,
    policySlug: quartermasterPolicySlugForExecutionLevel(args.control.executionLevel),
    subagentId: args.subagentId || null,
    sessionId: args.sessionId || null,
    provisionedAt: args.provisionedAt || null,
  }
}

async function loadShipForUser(args: {
  userId: string
  shipDeploymentId: string
}): Promise<ShipSummary | null> {
  return prisma.agentDeployment.findFirst({
    where: {
      id: args.shipDeploymentId,
      userId: args.userId,
      deploymentType: "ship",
    },
    select: {
      id: true,
      name: true,
      status: true,
      nodeId: true,
      nodeType: true,
      deploymentProfile: true,
      healthStatus: true,
      lastHealthCheck: true,
      updatedAt: true,
      metadata: true,
    },
  })
}

function extractControlOverride(input: unknown): Partial<QuartermasterControlState> {
  const root = asRecord(input)
  const quartermaster = asRecord(root.quartermaster)
  const controls = asRecord(quartermaster.controls)
  const levelSource = controls.executionLevel ?? quartermaster.executionLevel
  const policySource = asString(controls.policySlug ?? quartermaster.policySlug)
  const diagnosticsScopeSource = asString(controls.diagnosticsScope ?? quartermaster.diagnosticsScope)
  const authoritySource = asString(controls.authority ?? quartermaster.authority)
  const loopDefaultsSource = controls.loopDefaults ?? quartermaster.loopDefaults

  const hasLevelSignal = (
    levelSource !== undefined
    || policySource !== null
    || diagnosticsScopeSource !== null
    || authoritySource !== null
  )

  return {
    ...(hasLevelSignal
      ? {
          executionLevel: parseQuartermasterExecutionLevel(
            levelSource,
            inferExecutionLevelFromLegacy({
              policySlug: policySource,
              diagnosticsScope: diagnosticsScopeSource,
              authority: authoritySource,
            }),
          ),
        }
      : {}),
    ...(loopDefaultsSource !== undefined
      ? { loopDefaults: normalizeLoopDefaults(loopDefaultsSource, QUARTERMASTER_LOOP_DEFAULTS) }
      : {}),
  }
}

function applyControlOverride(
  base: QuartermasterControlState,
  override: Partial<QuartermasterControlState>,
): QuartermasterControlState {
  const executionLevel = override.executionLevel ?? base.executionLevel
  const loopDefaults = override.loopDefaults ?? base.loopDefaults
  return controlStateFromExecution({
    executionLevel,
    loopDefaults,
  })
}

function extractQuartermasterMetadata(input: Prisma.JsonValue | null): QuartermasterMetadata {
  const metadata = asRecord(input)
  const quartermaster = asRecord(metadata.quartermaster)

  const fallbackLevel = inferExecutionLevelFromLegacy({
    policySlug: asString(quartermaster.policySlug),
    diagnosticsScope: asString(quartermaster.diagnosticsScope),
    authority: asString(quartermaster.authority),
    fallback: "read_only",
  })
  const control = controlStateFromExecution({
    executionLevel: parseQuartermasterExecutionLevel(quartermaster.executionLevel, fallbackLevel),
    loopDefaults: normalizeLoopDefaults(quartermaster.loopDefaults, QUARTERMASTER_LOOP_DEFAULTS),
  })

  return metadataFromControl({
    control,
    enabled: quartermaster.enabled === true,
    subagentId: asString(quartermaster.subagentId),
    sessionId: asString(quartermaster.sessionId),
    provisionedAt: asString(quartermaster.provisionedAt),
  })
}

function resolveControlState(args: {
  baseMetadata: QuartermasterMetadata
  subagentSettings: Prisma.JsonValue | null | undefined
  sessionMetadata: Prisma.JsonValue | null | undefined
}): QuartermasterControlState {
  let control = controlStateFromExecution({
    executionLevel: args.baseMetadata.executionLevel,
    loopDefaults: args.baseMetadata.loopDefaults,
  })

  control = applyControlOverride(control, extractControlOverride(args.subagentSettings))
  control = applyControlOverride(control, extractControlOverride(args.sessionMetadata))
  return control
}

async function findQuartermasterSubagent(args: {
  userId: string
  metadataSubagentId: string | null
}): Promise<Subagent | null> {
  const fleetNamed = await prisma.subagent.findFirst({
    where: {
      teamId: args.userId,
      name: quartermasterFleetSubagentName(),
    },
  })

  if (fleetNamed) {
    return fleetNamed
  }

  const legacyNamed = await prisma.subagent.findFirst({
    where: {
      teamId: args.userId,
      name: {
        startsWith: `${QUARTERMASTER_CALLSIGN}:`,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  if (legacyNamed) {
    return legacyNamed
  }

  if (args.metadataSubagentId) {
    const byId = await prisma.subagent.findFirst({
      where: {
        id: args.metadataSubagentId,
        teamId: args.userId,
      },
    })

    if (byId) {
      return byId
    }
  }

  return null
}

async function findQuartermasterSession(args: {
  userId: string
  metadataSessionId: string | null
}): Promise<Session | null> {
  const sharedSession = await prisma.session.findFirst({
    where: {
      userId: args.userId,
      metadata: {
        path: ["quartermaster", "channel"],
        equals: QUARTERMASTER_CHANNEL,
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  if (sharedSession) {
    return sharedSession
  }

  if (args.metadataSessionId) {
    const byId = await prisma.session.findFirst({
      where: {
        id: args.metadataSessionId,
        userId: args.userId,
      },
    })

    if (byId) {
      return byId
    }
  }

  return null
}

function buildQuartermasterSubagentSettings(args: {
  existingSettings: Prisma.JsonValue | null
  control: QuartermasterControlState
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingSettings)
  const quartermaster = asRecord(root.quartermaster)

  return {
    ...root,
    quartermaster: {
      ...quartermaster,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: quartermasterAuthorityForExecutionLevel(args.control.executionLevel),
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: quartermasterDiagnosticsScopeForExecutionLevel(args.control.executionLevel),
      executionLevel: args.control.executionLevel,
      loopDefaults: args.control.loopDefaults,
      policySlug: quartermasterPolicySlugForExecutionLevel(args.control.executionLevel),
      scope: QUARTERMASTER_FLEET_SCOPE,
      contextTemplateVersion: QUARTERMASTER_CONTEXT_TEMPLATE_VERSION,
    },
  } as unknown as Prisma.InputJsonValue
}

function buildQuartermasterSessionMetadata(args: {
  existingMetadata: Prisma.JsonValue | null
  shipDeploymentId: string
  subagentId: string
  control: QuartermasterControlState
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingMetadata)
  const runtime = asRecord(root.runtime)
  const quartermaster = asRecord(root.quartermaster)

  return {
    ...root,
    runtime: {
      ...runtime,
      profile: QUARTERMASTER_RUNTIME_PROFILE,
    },
    quartermaster: {
      ...quartermaster,
      channel: QUARTERMASTER_CHANNEL,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: quartermasterAuthorityForExecutionLevel(args.control.executionLevel),
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: quartermasterDiagnosticsScopeForExecutionLevel(args.control.executionLevel),
      executionLevel: args.control.executionLevel,
      loopDefaults: args.control.loopDefaults,
      policySlug: quartermasterPolicySlugForExecutionLevel(args.control.executionLevel),
      shipDeploymentId: args.shipDeploymentId,
      subagentId: args.subagentId,
      controls: {
        executionLevel: args.control.executionLevel,
        loopDefaults: args.control.loopDefaults,
        authority: quartermasterAuthorityForExecutionLevel(args.control.executionLevel),
        diagnosticsScope: quartermasterDiagnosticsScopeForExecutionLevel(args.control.executionLevel),
        policySlug: quartermasterPolicySlugForExecutionLevel(args.control.executionLevel),
      },
    },
  } as unknown as Prisma.InputJsonValue
}

function buildFleetQuartermasterSessionMetadata(args: {
  existingMetadata: Prisma.JsonValue | null
  subagentId: string
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingMetadata)
  const runtime = asRecord(root.runtime)
  const existingQuartermaster = asRecord(root.quartermaster)

  return {
    ...root,
    runtime: {
      ...runtime,
      profile: QUARTERMASTER_RUNTIME_PROFILE,
    },
    quartermaster: {
      ...existingQuartermaster,
      channel: QUARTERMASTER_CHANNEL,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: QUARTERMASTER_AUTHORITY,
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: QUARTERMASTER_DIAGNOSTICS_SCOPE,
      subagentId: args.subagentId,
    },
  } as Prisma.InputJsonValue
}

async function assignQuartermasterPolicy(
  subagentId: string,
  executionLevel: QuartermasterExecutionLevel,
): Promise<void> {
  await ensureSystemPermissionPolicies()

  const policySlug = quartermasterPolicySlugForExecutionLevel(executionLevel)
  const policy = await prisma.permissionPolicy.findUnique({
    where: {
      slug: policySlug,
    },
    select: {
      id: true,
    },
  })

  if (!policy) {
    throw new Error(`Missing system policy preset: ${policySlug}`)
  }

  await replaceSubagentPermissionPolicyAssignments({
    subagentId,
    assignments: [
      {
        policyId: policy.id,
        priority: 10,
        enabled: true,
      },
    ],
  })
}

function serializeState(args: {
  ship: ShipSummary
  quartermaster: QuartermasterMetadata
  subagent: Subagent | null
  session: Session | null
}): ShipQuartermasterState {
  return {
    ship: {
      id: args.ship.id,
      name: args.ship.name,
      status: args.ship.status,
      nodeId: args.ship.nodeId,
      nodeType: args.ship.nodeType,
      deploymentProfile: args.ship.deploymentProfile,
      healthStatus: args.ship.healthStatus,
      lastHealthCheck: args.ship.lastHealthCheck ? args.ship.lastHealthCheck.toISOString() : null,
      updatedAt: args.ship.updatedAt.toISOString(),
    },
    quartermaster: {
      ...args.quartermaster,
      subagentId: args.subagent?.id || null,
      sessionId: args.session?.id || null,
      enabled: Boolean(args.subagent && args.session),
    },
    subagent: args.subagent
      ? {
          id: args.subagent.id,
          name: args.subagent.name,
          description: args.subagent.description,
        }
      : null,
    session: args.session
      ? {
          id: args.session.id,
          title: args.session.title,
          status: args.session.status,
          updatedAt: args.session.updatedAt.toISOString(),
          createdAt: args.session.createdAt.toISOString(),
        }
      : null,
  }
}

function buildDeploymentQuartermasterMetadata(args: {
  existingMetadata: Prisma.JsonValue | null
  subagentId: string
  sessionId: string
  provisionedAt: string
  control: QuartermasterControlState
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingMetadata)

  return {
    ...root,
    quartermaster: {
      enabled: true,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: quartermasterAuthorityForExecutionLevel(args.control.executionLevel),
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: quartermasterDiagnosticsScopeForExecutionLevel(args.control.executionLevel),
      executionLevel: args.control.executionLevel,
      loopDefaults: args.control.loopDefaults,
      channel: QUARTERMASTER_CHANNEL,
      policySlug: quartermasterPolicySlugForExecutionLevel(args.control.executionLevel),
      subagentId: args.subagentId,
      sessionId: args.sessionId,
      provisionedAt: args.provisionedAt,
    },
  } as unknown as Prisma.InputJsonValue
}

export async function getShipQuartermasterState(args: {
  userId: string
  shipDeploymentId: string
}): Promise<ShipQuartermasterState | null> {
  const ship = await loadShipForUser(args)
  if (!ship) {
    return null
  }

  const metadataState = extractQuartermasterMetadata(ship.metadata)
  const subagent = await findQuartermasterSubagent({
    userId: args.userId,
    metadataSubagentId: metadataState.subagentId,
  })

  const session = await findQuartermasterSession({
    userId: args.userId,
    metadataSessionId: metadataState.sessionId,
  })

  const control = resolveControlState({
    baseMetadata: metadataState,
    subagentSettings: subagent?.settings,
    sessionMetadata: session?.metadata,
  })

  return serializeState({
    ship,
    quartermaster: metadataFromControl({
      control,
      enabled: metadataState.enabled,
      subagentId: subagent?.id || metadataState.subagentId,
      sessionId: session?.id || metadataState.sessionId,
      provisionedAt: metadataState.provisionedAt,
    }),
    subagent,
    session,
  })
}

async function ensureSubagentControlSettings(args: {
  subagent: Subagent
  control: QuartermasterControlState
}): Promise<Subagent> {
  const settings = buildQuartermasterSubagentSettings({
    existingSettings: args.subagent.settings,
    control: args.control,
  })

  return prisma.subagent.update({
    where: {
      id: args.subagent.id,
    },
    data: {
      settings,
    },
  })
}

export async function ensureShipQuartermaster(args: EnsureShipQuartermasterArgs): Promise<ShipQuartermasterState> {
  const ship = await loadShipForUser({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })

  if (!ship) {
    throw new Error("Ship deployment not found for Quartermaster provisioning")
  }

  const metadataState = extractQuartermasterMetadata(ship.metadata)

  let subagent = await findQuartermasterSubagent({
    userId: args.userId,
    metadataSubagentId: metadataState.subagentId,
  })

  if (!subagent) {
    subagent = await prisma.subagent.create({
      data: {
        name: quartermasterFleetSubagentName(),
        description: `${QUARTERMASTER_CALLSIGN} Quartermaster for fleet operations.`,
        content: quartermasterPromptTemplate(),
        path: QUARTERMASTER_CONTEXT_PATH,
        isShared: false,
        teamId: args.userId,
        ownerUserId: args.userId,
        settings: buildQuartermasterSubagentSettings({
          existingSettings: null,
          control: controlStateFromExecution({
            executionLevel: metadataState.executionLevel,
            loopDefaults: metadataState.loopDefaults,
          }),
        }),
      },
    })
  }

  let session = await findQuartermasterSession({
    userId: args.userId,
    metadataSessionId: metadataState.sessionId,
  })

  const control = resolveControlState({
    baseMetadata: metadataState,
    subagentSettings: subagent.settings,
    sessionMetadata: session?.metadata || null,
  })

  subagent = await ensureSubagentControlSettings({
    subagent,
    control,
  })

  await assignQuartermasterPolicy(subagent.id, control.executionLevel)

  const desiredTitle = quartermasterFleetSessionTitle()
  const desiredDescription = "Quartermaster channel for fleet operations."
  const sessionMetadata = buildQuartermasterSessionMetadata({
    existingMetadata: session?.metadata || null,
    shipDeploymentId: args.shipDeploymentId,
    subagentId: subagent.id,
    control,
  })

  if (!session) {
    session = await prisma.session.create({
      data: {
        userId: args.userId,
        title: desiredTitle,
        description: desiredDescription,
        mode: "plan",
        source: "web",
        status: "planning",
        metadata: sessionMetadata,
      },
    })
  } else {
    session = await prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        title: desiredTitle,
        description: desiredDescription,
        metadata: sessionMetadata,
      },
    })
  }

  const provisionedAt = metadataState.provisionedAt || new Date().toISOString()
  await prisma.agentDeployment.update({
    where: {
      id: args.shipDeploymentId,
    },
    data: {
      metadata: buildDeploymentQuartermasterMetadata({
        existingMetadata: ship.metadata,
        subagentId: subagent.id,
        sessionId: session.id,
        provisionedAt,
        control,
      }),
    },
  })

  return serializeState({
    ship,
    quartermaster: metadataFromControl({
      control,
      enabled: true,
      subagentId: subagent.id,
      sessionId: session.id,
      provisionedAt,
    }),
    subagent,
    session,
  })
}

export async function updateShipQuartermasterConfig(
  args: UpdateShipQuartermasterConfigArgs,
): Promise<ShipQuartermasterState> {
  const ensured = await ensureShipQuartermaster({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })

  if (!ensured.subagent || !ensured.session) {
    throw new Error("Quartermaster provisioning did not yield a usable subagent/session.")
  }

  const ship = await loadShipForUser({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })
  if (!ship) {
    throw new Error("Ship deployment not found for quartermaster config update")
  }

  const nextControl = controlStateFromExecution({
    executionLevel: args.executionLevel,
    loopDefaults: mergeLoopDefaults(ensured.quartermaster.loopDefaults, args.loopDefaults),
  })

  const [subagent, session] = await Promise.all([
    prisma.subagent.findUnique({
      where: {
        id: ensured.subagent.id,
      },
    }),
    prisma.session.findUnique({
      where: {
        id: ensured.session.id,
      },
    }),
  ])

  if (!subagent || !session) {
    throw new Error("Quartermaster subagent/session missing during config update")
  }

  await assignQuartermasterPolicy(subagent.id, nextControl.executionLevel)

  await prisma.$transaction(async (tx) => {
    await tx.subagent.update({
      where: {
        id: subagent.id,
      },
      data: {
        settings: buildQuartermasterSubagentSettings({
          existingSettings: subagent.settings,
          control: nextControl,
        }),
      },
    })

    await tx.session.update({
      where: {
        id: session.id,
      },
      data: {
        metadata: buildQuartermasterSessionMetadata({
          existingMetadata: session.metadata,
          shipDeploymentId: args.shipDeploymentId,
          subagentId: subagent.id,
          control: nextControl,
        }),
      },
    })

    await tx.agentDeployment.update({
      where: {
        id: args.shipDeploymentId,
      },
      data: {
        metadata: buildDeploymentQuartermasterMetadata({
          existingMetadata: ship.metadata,
          subagentId: subagent.id,
          sessionId: session.id,
          provisionedAt: ensured.quartermaster.provisionedAt || new Date().toISOString(),
          control: nextControl,
        }),
      },
    })
  })

  const refreshed = await getShipQuartermasterState({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })
  if (!refreshed) {
    throw new Error("Quartermaster state unavailable after config update")
  }

  return refreshed
}

export async function ensureFleetQuartermasterSession(args: {
  userId: string
}): Promise<{ subagentId: string; sessionId: string }> {
  let subagent = await findQuartermasterSubagent({
    userId: args.userId,
    metadataSubagentId: null,
  })

  if (!subagent) {
    subagent = await prisma.subagent.create({
      data: {
        name: quartermasterFleetSubagentName(),
        description: `${QUARTERMASTER_CALLSIGN} Quartermaster for fleet operations.`,
        content: quartermasterPromptTemplate(),
        path: QUARTERMASTER_CONTEXT_PATH,
        isShared: false,
        teamId: args.userId,
        ownerUserId: args.userId,
        settings: {
          quartermaster: {
            roleKey: QUARTERMASTER_ROLE_KEY,
            callsign: QUARTERMASTER_CALLSIGN,
            authority: QUARTERMASTER_AUTHORITY,
            runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
            diagnosticsScope: QUARTERMASTER_DIAGNOSTICS_SCOPE,
            scope: QUARTERMASTER_FLEET_SCOPE,
            contextTemplateVersion: QUARTERMASTER_CONTEXT_TEMPLATE_VERSION,
          },
        },
      },
    })
  }

  await assignQuartermasterPolicy(subagent.id, "read_only")

  let session = await findQuartermasterSession({
    userId: args.userId,
    metadataSessionId: null,
  })

  const desiredTitle = quartermasterFleetSessionTitle()
  const desiredDescription = "Quartermaster channel for fleet operations."
  const sessionMetadata = buildFleetQuartermasterSessionMetadata({
    existingMetadata: session?.metadata || null,
    subagentId: subagent.id,
  })

  if (!session) {
    session = await prisma.session.create({
      data: {
        userId: args.userId,
        title: desiredTitle,
        description: desiredDescription,
        mode: "plan",
        source: "web",
        status: "planning",
        metadata: sessionMetadata,
      },
    })
  } else {
    session = await prisma.session.update({
      where: {
        id: session.id,
      },
      data: {
        title: desiredTitle,
        description: desiredDescription,
        metadata: sessionMetadata,
      },
    })
  }

  return {
    subagentId: subagent.id,
    sessionId: session.id,
  }
}
