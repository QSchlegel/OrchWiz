import type { AgentDeployment, Prisma, Session, Subagent } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  ensureSystemPermissionPolicies,
  replaceSubagentPermissionPolicyAssignments,
} from "@/lib/execution/permission-policies"
import {
  QUARTERMASTER_AUTHORITY,
  QUARTERMASTER_CALLSIGN,
  QUARTERMASTER_CHANNEL,
  QUARTERMASTER_DIAGNOSTICS_SCOPE,
  QUARTERMASTER_POLICY_SLUG,
  QUARTERMASTER_ROLE_KEY,
  QUARTERMASTER_RUNTIME_PROFILE,
  quartermasterSessionTitle,
  quartermasterSubagentName,
} from "@/lib/quartermaster/constants"

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

interface QuartermasterMetadata {
  enabled: boolean
  roleKey: string
  callsign: string
  authority: string
  runtimeProfile: string
  diagnosticsScope: string
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

function quartermasterPromptTemplate(shipName: string): string {
  return [
    `You are ${QUARTERMASTER_CALLSIGN}, the Quartermaster for ${shipName}.`,
    "Operate inside OrchWiz ship control surfaces only.",
    "Primary duties: setup guidance, maintenance planning, diagnostics triage, and operational readiness checks.",
    "Execution posture: read-only diagnostics first; propose command sequences but do not assume destructive execution.",
    "Always provide: situation summary, setup/maintenance checklist, risk notes, and next operator action.",
  ].join("\n")
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

function extractQuartermasterMetadata(input: Prisma.JsonValue | null): QuartermasterMetadata {
  const metadata = asRecord(input)
  const quartermaster = asRecord(metadata.quartermaster)

  return {
    enabled: quartermaster.enabled === true,
    roleKey: asString(quartermaster.roleKey) || QUARTERMASTER_ROLE_KEY,
    callsign: asString(quartermaster.callsign) || QUARTERMASTER_CALLSIGN,
    authority: asString(quartermaster.authority) || QUARTERMASTER_AUTHORITY,
    runtimeProfile: asString(quartermaster.runtimeProfile) || QUARTERMASTER_RUNTIME_PROFILE,
    diagnosticsScope: asString(quartermaster.diagnosticsScope) || QUARTERMASTER_DIAGNOSTICS_SCOPE,
    channel: asString(quartermaster.channel) || QUARTERMASTER_CHANNEL,
    policySlug: asString(quartermaster.policySlug) || QUARTERMASTER_POLICY_SLUG,
    subagentId: asString(quartermaster.subagentId),
    sessionId: asString(quartermaster.sessionId),
    provisionedAt: asString(quartermaster.provisionedAt),
  }
}

async function findQuartermasterSubagent(args: {
  userId: string
  shipDeploymentId: string
  metadataSubagentId: string | null
}): Promise<Subagent | null> {
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

  return prisma.subagent.findFirst({
    where: {
      teamId: args.userId,
      name: quartermasterSubagentName(args.shipDeploymentId),
    },
  })
}

async function findQuartermasterSession(args: {
  userId: string
  shipDeploymentId: string
  metadataSessionId: string | null
}): Promise<Session | null> {
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

  return prisma.session.findFirst({
    where: {
      userId: args.userId,
      AND: [
        {
          metadata: {
            path: ["quartermaster", "channel"],
            equals: QUARTERMASTER_CHANNEL,
          },
        },
        {
          metadata: {
            path: ["quartermaster", "shipDeploymentId"],
            equals: args.shipDeploymentId,
          },
        },
      ],
    },
    orderBy: {
      updatedAt: "desc",
    },
  })
}

function buildQuartermasterSessionMetadata(args: {
  existingMetadata: Prisma.JsonValue | null
  shipDeploymentId: string
  subagentId: string
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingMetadata)
  const runtime = asRecord(root.runtime)

  return {
    ...root,
    runtime: {
      ...runtime,
      profile: QUARTERMASTER_RUNTIME_PROFILE,
    },
    quartermaster: {
      channel: QUARTERMASTER_CHANNEL,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: QUARTERMASTER_AUTHORITY,
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: QUARTERMASTER_DIAGNOSTICS_SCOPE,
      shipDeploymentId: args.shipDeploymentId,
      subagentId: args.subagentId,
    },
  } as Prisma.InputJsonValue
}

async function assignQuartermasterPolicy(subagentId: string): Promise<void> {
  await ensureSystemPermissionPolicies()

  const policy = await prisma.permissionPolicy.findUnique({
    where: {
      slug: QUARTERMASTER_POLICY_SLUG,
    },
    select: {
      id: true,
    },
  })

  if (!policy) {
    throw new Error(`Missing system policy preset: ${QUARTERMASTER_POLICY_SLUG}`)
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
    shipDeploymentId: args.shipDeploymentId,
    metadataSubagentId: metadataState.subagentId,
  })

  const session = await findQuartermasterSession({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    metadataSessionId: metadataState.sessionId,
  })

  return serializeState({
    ship,
    quartermaster: metadataState,
    subagent,
    session,
  })
}

function buildDeploymentQuartermasterMetadata(args: {
  existingMetadata: Prisma.JsonValue | null
  subagentId: string
  sessionId: string
  provisionedAt: string
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingMetadata)

  return {
    ...root,
    quartermaster: {
      enabled: true,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: QUARTERMASTER_AUTHORITY,
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: QUARTERMASTER_DIAGNOSTICS_SCOPE,
      channel: QUARTERMASTER_CHANNEL,
      policySlug: QUARTERMASTER_POLICY_SLUG,
      subagentId: args.subagentId,
      sessionId: args.sessionId,
      provisionedAt: args.provisionedAt,
    },
  } as Prisma.InputJsonValue
}

export async function ensureShipQuartermaster(args: EnsureShipQuartermasterArgs): Promise<ShipQuartermasterState> {
  const ship = await loadShipForUser({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })

  if (!ship) {
    throw new Error("Ship deployment not found for Quartermaster provisioning")
  }

  const shipName = args.shipName?.trim() || ship.name || "Unnamed Ship"
  const metadataState = extractQuartermasterMetadata(ship.metadata)

  let subagent = await findQuartermasterSubagent({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    metadataSubagentId: metadataState.subagentId,
  })

  if (!subagent) {
    subagent = await prisma.subagent.create({
      data: {
        name: quartermasterSubagentName(args.shipDeploymentId),
        description: `${QUARTERMASTER_CALLSIGN} Quartermaster for ${shipName}.`,
        content: quartermasterPromptTemplate(shipName),
        isShared: false,
        teamId: args.userId,
        settings: {
          quartermaster: {
            roleKey: QUARTERMASTER_ROLE_KEY,
            callsign: QUARTERMASTER_CALLSIGN,
            authority: QUARTERMASTER_AUTHORITY,
            runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
            diagnosticsScope: QUARTERMASTER_DIAGNOSTICS_SCOPE,
            shipDeploymentId: args.shipDeploymentId,
          },
        },
      },
    })
  }

  await assignQuartermasterPolicy(subagent.id)

  let session = await findQuartermasterSession({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    metadataSessionId: metadataState.sessionId,
  })

  const desiredTitle = quartermasterSessionTitle(shipName)
  const desiredDescription = `Quartermaster channel for ${shipName}.`
  const sessionMetadata = buildQuartermasterSessionMetadata({
    existingMetadata: session?.metadata || null,
    shipDeploymentId: args.shipDeploymentId,
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
      }),
    },
  })

  return {
    ship: {
      id: ship.id,
      name: ship.name,
      status: ship.status,
      nodeId: ship.nodeId,
      nodeType: ship.nodeType,
      deploymentProfile: ship.deploymentProfile,
      healthStatus: ship.healthStatus,
      lastHealthCheck: ship.lastHealthCheck ? ship.lastHealthCheck.toISOString() : null,
      updatedAt: ship.updatedAt.toISOString(),
    },
    quartermaster: {
      enabled: true,
      roleKey: QUARTERMASTER_ROLE_KEY,
      callsign: QUARTERMASTER_CALLSIGN,
      authority: QUARTERMASTER_AUTHORITY,
      runtimeProfile: QUARTERMASTER_RUNTIME_PROFILE,
      diagnosticsScope: QUARTERMASTER_DIAGNOSTICS_SCOPE,
      channel: QUARTERMASTER_CHANNEL,
      policySlug: QUARTERMASTER_POLICY_SLUG,
      subagentId: subagent.id,
      sessionId: session.id,
      provisionedAt,
    },
    subagent: {
      id: subagent.id,
      name: subagent.name,
      description: subagent.description,
    },
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      updatedAt: session.updatedAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    },
  }
}
