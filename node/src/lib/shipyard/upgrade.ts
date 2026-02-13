import type {
  BridgeCrewRole,
  DeploymentStatus,
  Prisma,
  ProvisioningMode,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  runDeploymentAdapter,
  type DeploymentAdapterResult,
} from "@/lib/deployment/adapter"
import {
  normalizeInfrastructureInConfig,
  type DeploymentProfile,
  type InfrastructureConfig,
  type NodeType,
} from "@/lib/deployment/profile"
import { runShipyardCloudBootstrap } from "@/lib/deployment/shipyard-cloud-bootstrap"
import { runShipyardLocalLaunch } from "@/lib/deployment/shipyard-local-launch"
import { buildOpenClawBridgeCrewContextBundle } from "@/lib/deployment/openclaw-context"
import { BRIDGE_CREW_ROLE_ORDER } from "@/lib/shipyard/bridge-crew"
import { readCloudProviderConfig } from "@/lib/shipyard/cloud/types"
import {
  resolveCloudCredentialToken,
  resolveCloudSshPrivateKey,
  ShipyardCloudVaultError,
} from "@/lib/shipyard/cloud/vault"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  latestShipVersion,
  resolveShipVersion,
  shipVersionNeedsUpgrade,
  type ShipVersion,
} from "@/lib/shipyard/versions"

const SHIP_TRANSITION_STATUSES = new Set<DeploymentStatus>([
  "pending",
  "deploying",
  "updating",
])

const SHIP_DEPLOYMENT_SELECT = {
  id: true,
  name: true,
  userId: true,
  nodeId: true,
  nodeType: true,
  nodeUrl: true,
  deploymentProfile: true,
  provisioningMode: true,
  status: true,
  shipVersion: true,
  shipVersionUpdatedAt: true,
  config: true,
  metadata: true,
  deployedAt: true,
  lastHealthCheck: true,
  healthStatus: true,
} satisfies Prisma.AgentDeploymentSelect

export type ShipUpgradeDeployment = Prisma.AgentDeploymentGetPayload<{
  select: typeof SHIP_DEPLOYMENT_SELECT
}>

export interface ShipUpgradeResult {
  upgraded: boolean
  fromVersion: ShipVersion
  toVersion: ShipVersion
  deployment: ShipUpgradeDeployment
}

interface BridgeCrewContextRecord {
  role: BridgeCrewRole
  callsign: string
  name: string
  content: string
}

interface ShipUpgradeCloudCredential {
  tokenEnvelope: unknown
}

interface ShipUpgradeCloudSshKey {
  name: string
  privateKeyEnvelope: unknown
}

interface LockShipForUpgradeInput {
  ship: ShipUpgradeDeployment
  metadata: Record<string, unknown>
}

interface UpdateShipInput {
  shipId: string
  userId: string
  data: Prisma.AgentDeploymentUpdateInput
}

interface ResolveCloudCredentialTokenInput {
  userId: string
  provider: "hetzner"
  stored: unknown
}

interface ResolveCloudSshPrivateKeyInput {
  userId: string
  provider: "hetzner"
  keyName: string
  stored: unknown
}

interface RunShipUpgradeInput {
  ship: ShipUpgradeDeployment
}

export interface ShipUpgradeDeps {
  now: () => Date
  findOwnedShip: (args: { shipDeploymentId: string; userId: string }) => Promise<ShipUpgradeDeployment | null>
  lockShipForUpgrade: (input: LockShipForUpgradeInput) => Promise<ShipUpgradeDeployment | null>
  updateShip: (input: UpdateShipInput) => Promise<ShipUpgradeDeployment>
  listBridgeCrewContext: (shipDeploymentId: string) => Promise<BridgeCrewContextRecord[]>
  readCloudProviderConfig: (config: Record<string, unknown>) => ReturnType<typeof readCloudProviderConfig>
  findCloudCredential: (args: {
    userId: string
    provider: "hetzner"
  }) => Promise<ShipUpgradeCloudCredential | null>
  findCloudSshKey: (args: {
    userId: string
    provider: "hetzner"
    id: string
  }) => Promise<ShipUpgradeCloudSshKey | null>
  resolveCloudCredentialToken: (
    args: ResolveCloudCredentialTokenInput,
  ) => Promise<string>
  resolveCloudSshPrivateKey: (
    args: ResolveCloudSshPrivateKeyInput,
  ) => Promise<string>
  runLocalUpgrade: (input: {
    provisioningMode: ProvisioningMode
    infrastructure: InfrastructureConfig
    saneBootstrap: boolean
    openClawContextBundle?: ReturnType<typeof buildOpenClawBridgeCrewContextBundle>
  }) => Promise<Awaited<ReturnType<typeof runShipyardLocalLaunch>>>
  runCloudUpgrade: (input: {
    deploymentId: string
    provisioningMode: ProvisioningMode
    infrastructure: InfrastructureConfig
    cloudProvider: NonNullable<ReturnType<typeof readCloudProviderConfig>>
    sshPrivateKey: string
  }) => Promise<Awaited<ReturnType<typeof runShipyardCloudBootstrap>>>
  runAdapterUpgrade: (input: {
    kind: "agent"
    recordId: string
    name: string
    nodeId: string
    nodeType: NodeType
    deploymentProfile: DeploymentProfile
    provisioningMode: ProvisioningMode
    nodeUrl?: string | null
    config?: Record<string, unknown>
    infrastructure?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) => Promise<DeploymentAdapterResult>
  publishShipUpdated: typeof publishShipUpdated
}

const defaultDeps: ShipUpgradeDeps = {
  now: () => new Date(),
  findOwnedShip: async ({ shipDeploymentId, userId }) =>
    prisma.agentDeployment.findFirst({
      where: {
        id: shipDeploymentId,
        userId,
        deploymentType: "ship",
      },
      select: SHIP_DEPLOYMENT_SELECT,
    }),
  lockShipForUpgrade: async ({ ship, metadata }) =>
    prisma.$transaction(async (tx) => {
      const lockResult = await tx.agentDeployment.updateMany({
        where: {
          id: ship.id,
          userId: ship.userId,
          deploymentType: "ship",
          status: ship.status,
        },
        data: {
          status: "updating",
          metadata: metadata as Prisma.InputJsonValue,
        },
      })

      if (lockResult.count === 0) {
        return null
      }

      return tx.agentDeployment.findFirst({
        where: {
          id: ship.id,
          userId: ship.userId,
          deploymentType: "ship",
        },
        select: SHIP_DEPLOYMENT_SELECT,
      })
    }),
  updateShip: async ({ shipId, userId, data }) =>
    prisma.agentDeployment.update({
      where: {
        id: shipId,
        userId,
      },
      data,
      select: SHIP_DEPLOYMENT_SELECT,
    }),
  listBridgeCrewContext: async (shipDeploymentId) =>
    prisma.bridgeCrew.findMany({
      where: {
        deploymentId: shipDeploymentId,
        status: "active",
      },
      select: {
        role: true,
        callsign: true,
        name: true,
        content: true,
      },
    }),
  readCloudProviderConfig,
  findCloudCredential: async ({ userId, provider }) =>
    prisma.shipyardCloudCredential.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      select: {
        tokenEnvelope: true,
      },
    }),
  findCloudSshKey: async ({ userId, provider, id }) =>
    prisma.shipyardCloudSshKey.findFirst({
      where: {
        id,
        userId,
        provider,
      },
      select: {
        name: true,
        privateKeyEnvelope: true,
      },
    }),
  resolveCloudCredentialToken,
  resolveCloudSshPrivateKey,
  runLocalUpgrade: (input) => runShipyardLocalLaunch(input),
  runCloudUpgrade: (input) => runShipyardCloudBootstrap(input),
  runAdapterUpgrade: (input) => runDeploymentAdapter(input),
  publishShipUpdated,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function mergeMetadataPreservingKubeview(
  base: Record<string, unknown>,
  incoming?: Record<string, unknown>,
): Record<string, unknown> {
  const merged = {
    ...base,
    ...(incoming || {}),
  }

  if (!incoming || !Object.prototype.hasOwnProperty.call(incoming, "kubeview")) {
    if (Object.prototype.hasOwnProperty.call(base, "kubeview")) {
      merged.kubeview = base.kubeview
    }
  }

  return merged
}

function isUpgradeBlockedStatus(status: DeploymentStatus): boolean {
  return SHIP_TRANSITION_STATUSES.has(status)
}

function readSaneBootstrap(metadata: unknown): boolean {
  const candidate = asBoolean(asRecord(metadata).saneBootstrap)
  if (candidate === null) {
    return true
  }
  return candidate
}

function buildRunningUpgradeMetadata(args: {
  metadata: unknown
  fromVersion: ShipVersion
  toVersion: ShipVersion
  startedAtIso: string
}): Record<string, unknown> {
  const currentMetadata = asRecord(args.metadata)
  const currentUpgrade = asRecord(currentMetadata.shipUpgrade)

  return {
    ...currentMetadata,
    shipUpgrade: {
      ...currentUpgrade,
      status: "running",
      fromVersion: args.fromVersion,
      toVersion: args.toVersion,
      startedAt: args.startedAtIso,
    },
  }
}

function buildSucceededUpgradeMetadata(args: {
  metadata: unknown
  fromVersion: ShipVersion
  toVersion: ShipVersion
  completedAtIso: string
  adapterResult: DeploymentAdapterResult
}): Record<string, unknown> {
  const currentMetadata = asRecord(args.metadata)
  const currentUpgrade = asRecord(currentMetadata.shipUpgrade)

  return {
    ...mergeMetadataPreservingKubeview(
      currentMetadata,
      (args.adapterResult.metadata || {}) as Record<string, unknown>,
    ),
    ...(args.adapterResult.error ? { deploymentError: args.adapterResult.error } : {}),
    shipUpgrade: {
      ...currentUpgrade,
      status: "succeeded",
      fromVersion: args.fromVersion,
      toVersion: args.toVersion,
      completedAt: args.completedAtIso,
    },
  }
}

function buildFailedUpgradeMetadata(args: {
  metadata: unknown
  fromVersion: ShipVersion
  toVersion: ShipVersion
  failedAtIso: string
  error: ShipUpgradeError
}): Record<string, unknown> {
  const currentMetadata = asRecord(args.metadata)
  const currentUpgrade = asRecord(currentMetadata.shipUpgrade)

  return {
    ...mergeMetadataPreservingKubeview(currentMetadata, args.error.metadata),
    deploymentError: args.error.message,
    deploymentErrorCode: args.error.code,
    ...(args.error.details
      ? {
          deploymentErrorDetails: args.error.details as Prisma.InputJsonValue,
        }
      : {}),
    shipUpgrade: {
      ...currentUpgrade,
      status: "failed",
      fromVersion: args.fromVersion,
      toVersion: args.toVersion,
      failedAt: args.failedAtIso,
      errorCode: args.error.code,
      error: args.error.message,
    },
  }
}

function toShipUpgradeError(error: unknown): ShipUpgradeError {
  if (error instanceof ShipUpgradeError) {
    return error
  }

  if (error instanceof ShipyardCloudVaultError) {
    return new ShipUpgradeError(
      error.message,
      error.status >= 500 ? 500 : 422,
      error.code,
      error.details,
    )
  }

  return new ShipUpgradeError(
    "Ship upgrade failed due to an unexpected error.",
    500,
    "SHIP_UPGRADE_UNEXPECTED",
  )
}

async function executeShipUpgrade(
  input: RunShipUpgradeInput,
  deps: ShipUpgradeDeps,
): Promise<DeploymentAdapterResult> {
  const shipConfig = asRecord(input.ship.config)
  const normalizedInfrastructure = normalizeInfrastructureInConfig(
    input.ship.deploymentProfile,
    shipConfig,
  )
  const infrastructure = normalizedInfrastructure.infrastructure

  if (input.ship.deploymentProfile === "local_starship_build") {
    const bridgeCrewContext = await deps.listBridgeCrewContext(input.ship.id)
    const sortedBridgeCrew = [...bridgeCrewContext].sort(
      (left, right) => BRIDGE_CREW_ROLE_ORDER.indexOf(left.role) - BRIDGE_CREW_ROLE_ORDER.indexOf(right.role),
    )
    const openClawContextBundle =
      sortedBridgeCrew.length > 0
        ? buildOpenClawBridgeCrewContextBundle({
            deploymentId: input.ship.id,
            bridgeCrew: sortedBridgeCrew.map((member) => ({
              role: member.role,
              callsign: member.callsign,
              name: member.name,
              content: member.content,
            })),
          })
        : undefined

    const launchResult = await deps.runLocalUpgrade({
      provisioningMode: input.ship.provisioningMode,
      infrastructure,
      saneBootstrap: readSaneBootstrap(input.ship.metadata),
      ...(openClawContextBundle ? { openClawContextBundle } : {}),
    })

    if (!launchResult.ok) {
      throw new ShipUpgradeError(
        launchResult.error,
        launchResult.httpStatus >= 500 ? 500 : 422,
        launchResult.code,
        launchResult.details,
        undefined,
        launchResult.metadata,
      )
    }

    return launchResult.adapterResult
  }

  if (input.ship.deploymentProfile === "cloud_shipyard") {
    const cloudProvider = deps.readCloudProviderConfig(normalizedInfrastructure.config)
    if (!cloudProvider) {
      throw new ShipUpgradeError(
        "Cloud provider configuration is missing.",
        422,
        "CLOUD_PROVIDER_CONFIG_MISSING",
      )
    }

    if (cloudProvider.provider === "hetzner") {
      const credentials = await deps.findCloudCredential({
        userId: input.ship.userId,
        provider: "hetzner",
      })

      if (!credentials) {
        throw new ShipUpgradeError(
          "Hetzner credentials are missing. Configure cloud credentials in Ship Yard Cloud Utility.",
          422,
          "CLOUD_CREDENTIALS_MISSING",
          {
            provider: "hetzner",
            suggestedCommands: [
              "Open Ship Yard -> Cloud Utility -> Hetzner credentials and save API token.",
            ],
          },
        )
      }

      if (!cloudProvider.sshKeyId) {
        throw new ShipUpgradeError(
          "Cloud provider configuration is missing sshKeyId.",
          422,
          "CLOUD_SSH_KEY_MISSING",
          {
            provider: "hetzner",
            suggestedCommands: [
              "Generate/select a Hetzner SSH key in Ship Yard Cloud Utility and retry upgrade.",
            ],
          },
        )
      }

      const sshKey = await deps.findCloudSshKey({
        userId: input.ship.userId,
        provider: "hetzner",
        id: cloudProvider.sshKeyId,
      })

      if (!sshKey) {
        throw new ShipUpgradeError(
          "Selected Hetzner SSH key was not found.",
          422,
          "CLOUD_SSH_KEY_MISSING",
          {
            provider: "hetzner",
            sshKeyId: cloudProvider.sshKeyId,
          },
        )
      }

      const credentialToken = await deps.resolveCloudCredentialToken({
        userId: input.ship.userId,
        provider: "hetzner",
        stored: credentials.tokenEnvelope,
      })
      const sshPrivateKey = await deps.resolveCloudSshPrivateKey({
        userId: input.ship.userId,
        provider: "hetzner",
        keyName: sshKey.name,
        stored: sshKey.privateKeyEnvelope,
      })

      // Token resolution verifies vault/decryption path before provisioning execution.
      if (!credentialToken || credentialToken.trim().length === 0) {
        throw new ShipUpgradeError(
          "Resolved Hetzner credential token is empty.",
          500,
          "CLOUD_CREDENTIALS_INVALID",
        )
      }

      const cloudLaunch = await deps.runCloudUpgrade({
        deploymentId: input.ship.id,
        provisioningMode: input.ship.provisioningMode,
        infrastructure,
        cloudProvider,
        sshPrivateKey,
      })

      if (!cloudLaunch.ok) {
        throw new ShipUpgradeError(
          cloudLaunch.error,
          cloudLaunch.expected ? 422 : 500,
          cloudLaunch.code,
          cloudLaunch.details,
          undefined,
          cloudLaunch.metadata,
        )
      }

      return {
        status: "active",
        deployedAt: new Date(),
        lastHealthCheck: new Date(),
        healthStatus: "healthy",
        metadata: {
          mode: "shipyard_cloud",
          provider: "hetzner",
          cloudProvider: cloudProvider as unknown as Prisma.InputJsonValue,
          ...cloudLaunch.metadata,
        },
      }
    }
  }

  const adapterResult = await deps.runAdapterUpgrade({
    kind: "agent",
    recordId: input.ship.id,
    name: input.ship.name,
    nodeId: input.ship.nodeId,
    nodeType: input.ship.nodeType,
    nodeUrl: input.ship.nodeUrl,
    deploymentProfile: input.ship.deploymentProfile,
    provisioningMode: input.ship.provisioningMode,
    config: normalizedInfrastructure.config,
    infrastructure: normalizedInfrastructure.infrastructure as unknown as Record<string, unknown>,
    metadata: asRecord(input.ship.metadata),
  })

  if (adapterResult.status === "failed") {
    throw new ShipUpgradeError(
      adapterResult.error || "Deployment adapter returned failed status.",
      422,
      "DEPLOYMENT_ADAPTER_FAILED",
    )
  }

  return adapterResult
}

export class ShipUpgradeError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  readonly deployment?: ShipUpgradeDeployment
  readonly metadata?: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    code: string,
    details?: unknown,
    deployment?: ShipUpgradeDeployment,
    metadata?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "ShipUpgradeError"
    this.status = status
    this.code = code
    this.details = details
    this.deployment = deployment
    this.metadata = metadata
  }
}

export async function upgradeShipToLatest(
  args: {
    shipDeploymentId: string
    userId: string
  },
  deps: ShipUpgradeDeps = defaultDeps,
): Promise<ShipUpgradeResult> {
  const ship = await deps.findOwnedShip(args)
  if (!ship) {
    throw new ShipUpgradeError("Ship not found", 404, "SHIP_NOT_FOUND")
  }

  const fromVersion = resolveShipVersion(ship.shipVersion)
  const toVersion = latestShipVersion()

  if (!shipVersionNeedsUpgrade(fromVersion, toVersion)) {
    return {
      upgraded: false,
      fromVersion,
      toVersion,
      deployment: ship,
    }
  }

  if (isUpgradeBlockedStatus(ship.status)) {
    throw new ShipUpgradeError(
      "Ship is currently transitioning; wait for status to settle before upgrading.",
      409,
      "SHIP_UPGRADE_CONFLICT",
      {
        status: ship.status,
      },
      ship,
    )
  }

  const now = deps.now()
  const runningMetadata = buildRunningUpgradeMetadata({
    metadata: ship.metadata,
    fromVersion,
    toVersion,
    startedAtIso: now.toISOString(),
  })

  const lockedShip = await deps.lockShipForUpgrade({
    ship,
    metadata: runningMetadata,
  })

  if (!lockedShip) {
    throw new ShipUpgradeError(
      "Ship is currently transitioning; wait for status to settle before upgrading.",
      409,
      "SHIP_UPGRADE_CONFLICT",
      {
        status: ship.status,
      },
      ship,
    )
  }

  deps.publishShipUpdated({
    shipId: lockedShip.id,
    status: lockedShip.status,
    nodeId: lockedShip.nodeId,
    userId: lockedShip.userId,
  })

  try {
    const adapterResult = await executeShipUpgrade(
      {
        ship: lockedShip,
      },
      deps,
    )

    if (adapterResult.status === "failed") {
      throw new ShipUpgradeError(
        adapterResult.error || "Ship upgrade failed.",
        422,
        "SHIP_UPGRADE_FAILED",
      )
    }

    const succeededAt = deps.now()
    const successMetadata = buildSucceededUpgradeMetadata({
      metadata: lockedShip.metadata,
      fromVersion,
      toVersion,
      completedAtIso: succeededAt.toISOString(),
      adapterResult,
    })

    const upgradedDeployment = await deps.updateShip({
      shipId: lockedShip.id,
      userId: lockedShip.userId,
      data: {
        status: adapterResult.status,
        shipVersion: toVersion,
        shipVersionUpdatedAt: succeededAt,
        deployedAt: adapterResult.deployedAt || null,
        lastHealthCheck: adapterResult.lastHealthCheck || null,
        healthStatus: adapterResult.healthStatus || null,
        metadata: successMetadata as Prisma.InputJsonValue,
      },
    })

    deps.publishShipUpdated({
      shipId: upgradedDeployment.id,
      status: upgradedDeployment.status,
      nodeId: upgradedDeployment.nodeId,
      userId: upgradedDeployment.userId,
    })

    return {
      upgraded: true,
      fromVersion,
      toVersion,
      deployment: upgradedDeployment,
    }
  } catch (error) {
    const normalizedError = toShipUpgradeError(error)
    const failedAt = deps.now()

    const failedMetadata = buildFailedUpgradeMetadata({
      metadata: lockedShip.metadata,
      fromVersion,
      toVersion,
      failedAtIso: failedAt.toISOString(),
      error: normalizedError,
    })

    const failedDeployment = await deps.updateShip({
      shipId: lockedShip.id,
      userId: lockedShip.userId,
      data: {
        status: "failed",
        lastHealthCheck: failedAt,
        healthStatus: "unhealthy",
        metadata: failedMetadata as Prisma.InputJsonValue,
      },
    })

    deps.publishShipUpdated({
      shipId: failedDeployment.id,
      status: failedDeployment.status,
      nodeId: failedDeployment.nodeId,
      userId: failedDeployment.userId,
    })

    throw new ShipUpgradeError(
      normalizedError.message,
      normalizedError.status,
      normalizedError.code,
      normalizedError.details,
      failedDeployment,
      normalizedError.metadata,
    )
  }
}
