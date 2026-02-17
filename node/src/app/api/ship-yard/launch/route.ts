import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { RunCommandFn } from "@/lib/shipyard/cluster-database-url"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { AccessControlError } from "@/lib/security/access-control"
import {
  runDeploymentAdapter,
  type DeploymentAdapterResult,
} from "@/lib/deployment/adapter"
import { runShipyardLocalLaunch } from "@/lib/deployment/shipyard-local-launch"
import { runLocalBootstrap } from "@/lib/deployment/local-bootstrap"
import {
  normalizeDeploymentProfileInput,
  type InfrastructureConfig,
} from "@/lib/deployment/profile"
import { runShipyardCloudBootstrap } from "@/lib/deployment/shipyard-cloud-bootstrap"
import { isCloudDeployOnlyEnabled } from "@/lib/deployment/cloud-deploy-only"
import { publishShipUpdated } from "@/lib/shipyard/events"
import {
  BRIDGE_CREW_ROLE_ORDER,
  bridgeCrewTemplateForRole,
  isBridgeCrewRole,
  type BridgeCrewRole,
} from "@/lib/shipyard/bridge-crew"
import { estimateShipBaseRequirements } from "@/lib/shipyard/resource-estimation"
import {
  buildShipDeploymentOverview,
  hasCompleteBridgeCrewCoverage,
} from "@/lib/shipyard/deployment-overview"
import { buildOpenClawBridgeCrewContextBundle } from "@/lib/deployment/openclaw-context"
import { ensureShipQuartermaster } from "@/lib/quartermaster/service"
import { getCloudProviderHandler } from "@/lib/shipyard/cloud/providers/registry"
import { readCloudProviderConfig } from "@/lib/shipyard/cloud/types"
import {
  resolveCloudCredentialToken,
  resolveCloudSshPrivateKey,
  ShipyardCloudVaultError,
} from "@/lib/shipyard/cloud/vault"
import {
  buildShipyardCloudLaunchQuote,
  ShipyardBillingQuoteError,
  withWalletBalance,
} from "@/lib/shipyard/billing/pricing"
import {
  debitForLaunch,
  getOrCreateWallet,
  refundLaunchDebit,
  ShipyardInsufficientCreditsError,
} from "@/lib/shipyard/billing/wallet"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"
import {
  bootstrapInitialApplicationsForShipFailOpen,
} from "@/lib/shipyard/initial-applications"
import { SHIP_LATEST_VERSION } from "@/lib/shipyard/versions"
import {
  publishShipLaunchLog,
  createCloudBootstrapLoggingRuntime,
  createLocalBootstrapLoggingRuntime,
  type ShipLaunchLogLevel,
  type ShipLaunchLogSource,
  type ShipLaunchLogStream,
} from "@/lib/shipyard/launch-logging"
import { cleanupFailedLocalLaunch } from "@/lib/shipyard/infra-teardown"

export const dynamic = "force-dynamic"

function uniqueCrewRoles(input: unknown): BridgeCrewRole[] {
  if (!Array.isArray(input)) return []
  const set = new Set<BridgeCrewRole>()
  for (const entry of input) {
    if (isBridgeCrewRole(entry)) {
      set.add(entry)
    }
  }
  return BRIDGE_CREW_ROLE_ORDER.filter((role) => set.has(role))
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") return null
  return value
}

function mergeMetadataPreservingKubeview(
  base: Record<string, unknown>,
  incoming?: Record<string, unknown>,
): Record<string, unknown> {
  const next = {
    ...base,
    ...(incoming || {}),
  }

  const preserveKey = (key: string) => {
    if (!incoming || !Object.prototype.hasOwnProperty.call(incoming, key)) {
      if (Object.prototype.hasOwnProperty.call(base, key)) {
        ;(next as any)[key] = (base as any)[key]
      }
    }
  }

  preserveKey("kubeview")
  preserveKey("runtimeUi")

  return next
}

type CrewOverrides = Partial<
  Record<
    BridgeCrewRole,
    {
      name?: string
      description?: string
      content?: string
    }
  >
>

function parseCrewOverrides(input: unknown): CrewOverrides {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }

  const source = input as Record<string, unknown>
  const result: CrewOverrides = {}

  for (const role of BRIDGE_CREW_ROLE_ORDER) {
    const raw = source[role]
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const parsed = raw as Record<string, unknown>

    result[role] = {
      name: asString(parsed.name) || undefined,
      description: asString(parsed.description) || undefined,
      content: asString(parsed.content) || undefined,
    }
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const body = asRecord(await request.json())
    const actor = await requireShipyardRequestActor(request, {
      allowLegacyTokenAuth: true,
      body,
    })
    const ownerUserId = actor.userId
    const requestId = asString(body?.requestId)
    let launchDeploymentId: string | null = null

    const emitLaunchLog = (entry: {
      level: ShipLaunchLogLevel
      source: ShipLaunchLogSource
      stream?: ShipLaunchLogStream
      lines: string[]
    }) => {
      if (!requestId) return
      const lines = Array.isArray(entry.lines)
        ? entry.lines.filter((line) => typeof line === "string" && line.trim().length > 0)
        : []
      if (lines.length === 0) return

      publishShipLaunchLog({
        userId: ownerUserId,
        payload: {
          requestId,
          deploymentId: launchDeploymentId,
          level: entry.level,
          source: entry.source,
          ...(entry.stream ? { stream: entry.stream } : {}),
          lines,
        },
      })
    }

    const emitLaunchProgress = (progress: {
      percent: number
      stage: string
      message: string
      deploymentId?: string | null
    }) => {
      if (!requestId) return

      publishRealtimeEvent({
        type: "ship.launch.progress",
        userId: ownerUserId,
        payload: {
          requestId,
          percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
          stage: progress.stage,
          message: progress.message,
          deploymentId: progress.deploymentId ?? null,
        },
      })
    }

    const name = asString(body?.name)
    const nodeId = asString(body?.nodeId)
    if (!name || !nodeId) {
      return NextResponse.json(
        { error: "Missing required fields: name and nodeId" },
        { status: 400 },
      )
    }

    emitLaunchProgress({
      percent: 2,
      stage: "validating_crew",
      message: "Validating crew",
    })
    const crewRoles = uniqueCrewRoles(body?.crewRoles)
    if (crewRoles.length === 0) {
      return NextResponse.json(
        { error: "At least one bridge crew role is required" },
        { status: 400 },
      )
    }
    if (!hasCompleteBridgeCrewCoverage(crewRoles)) {
      return NextResponse.json(
        {
          error: "Ship launch requires all six bridge crew roles (XO, OPS, ENG, SEC, MED, COU).",
          details: {
            requiredCrewRoles: BRIDGE_CREW_ROLE_ORDER,
            receivedCrewRoles: crewRoles,
          },
        },
        { status: 400 },
      )
    }

    emitLaunchProgress({
      percent: 5,
      stage: "validated",
      message: "Validating launch request",
    })
    emitLaunchLog({
      level: "info",
      source: "ship-yard",
      lines: ["Validating launch request"],
    })

    const crewOverrides = parseCrewOverrides(body?.crewOverrides)

    const normalizedProfile = normalizeDeploymentProfileInput({
      deploymentProfile: body?.deploymentProfile,
      provisioningMode: body?.provisioningMode,
      nodeType: body?.nodeType,
      advancedNodeTypeOverride: body?.advancedNodeTypeOverride,
      config: body?.config,
    })

    emitLaunchProgress({
      percent: 8,
      stage: "profile_ready",
      message: "Preparing launch profile",
    })

    if (
      normalizedProfile.deploymentProfile === "local_starship_build"
      && isCloudDeployOnlyEnabled()
    ) {
      return NextResponse.json(
        {
          error:
            "Local Starship Build launches are disabled because CLOUD_DEPLOY_ONLY=true. Use Cloud Shipyard instead.",
          code: "CLOUD_DEPLOY_ONLY",
          details: {
            blockedDeploymentProfile: "local_starship_build",
            requiredDeploymentProfile: "cloud_shipyard",
            suggestedCommands: [
              "Set deploymentProfile to cloud_shipyard and retry launch.",
              "Unset CLOUD_DEPLOY_ONLY to re-enable local starship launches.",
            ],
          },
        },
        { status: 403 },
      )
    }

    const saneBootstrap =
      normalizedProfile.deploymentProfile === "local_starship_build"
        ? (asBoolean(body?.saneBootstrap) ?? true)
        : false
    const baseRequirementsEstimate = estimateShipBaseRequirements({
      deploymentProfile: normalizedProfile.deploymentProfile,
      crewRoles,
    })
    const deploymentOverview = buildShipDeploymentOverview({
      deploymentProfile: normalizedProfile.deploymentProfile,
      provisioningMode: normalizedProfile.provisioningMode,
      nodeType: normalizedProfile.nodeType,
      infrastructure: normalizedProfile.infrastructure,
      crewRoles,
      baseRequirementsEstimate,
    })

    emitLaunchProgress({
      percent: 12,
      stage: "creating_record",
      message: "Creating deployment record",
    })

    const created = await prisma.$transaction(async (tx) => {
      const deployment = await tx.agentDeployment.create({
        data: {
          name,
          description: asString(body?.description),
          subagentId: null,
          nodeId,
          nodeType: normalizedProfile.nodeType,
          deploymentType: "ship",
          deploymentProfile: normalizedProfile.deploymentProfile,
          provisioningMode: normalizedProfile.provisioningMode,
          nodeUrl: asString(body?.nodeUrl),
          shipVersion: SHIP_LATEST_VERSION,
          shipVersionUpdatedAt: new Date(),
          config: normalizedProfile.config as Prisma.InputJsonValue,
          metadata: {
            shipYard: true,
            bridgeCrewRoles: crewRoles,
            baseRequirementsEstimate:
              baseRequirementsEstimate as unknown as Prisma.InputJsonValue,
            deploymentOverview:
              deploymentOverview as unknown as Prisma.InputJsonValue,
            apiActor: {
              type: actor.authType,
              requestedUserId: actor.requestedUserId || actor.userId,
              impersonated: actor.impersonated === true,
            },
            ...(normalizedProfile.deploymentProfile === "local_starship_build"
              ? { saneBootstrap }
              : {}),
          },
          userId: ownerUserId,
          status: "pending",
        },
      })

      const bridgeCrew = await Promise.all(
        crewRoles.map((role) => {
          const template = bridgeCrewTemplateForRole(role)
          const override = crewOverrides[role]
          return tx.bridgeCrew.create({
            data: {
              deploymentId: deployment.id,
              role,
              callsign: template.callsign,
              name: override?.name || template.name,
              description: override?.description || template.description,
              content: override?.content || template.content,
              status: "active",
            },
          })
        }),
      )

      return { deployment, bridgeCrew }
    })
    launchDeploymentId = created.deployment.id

    emitLaunchProgress({
      percent: 18,
      stage: "records_created",
      message: "Deployment record created",
      deploymentId: created.deployment.id,
    })
    emitLaunchLog({
      level: "info",
      source: "ship-yard",
      lines: ["Creating ship deployment record"],
    })

    emitLaunchProgress({
      percent: 22,
      stage: "assigning_quartermaster",
      message: "Assigning ship quartermaster",
      deploymentId: created.deployment.id,
    })

    const quartermaster = await ensureShipQuartermaster({
      userId: ownerUserId,
      shipDeploymentId: created.deployment.id,
      shipName: created.deployment.name,
    })

    emitLaunchProgress({
      percent: 25,
      stage: "quartermaster_ready",
      message: "Quartermaster ready",
      deploymentId: created.deployment.id,
    })

    await prisma.agentDeployment.update({
      where: { id: created.deployment.id },
      data: { status: "deploying" },
    })

    emitLaunchProgress({
      percent: 28,
      stage: "preparing_provisioning",
      message: "Preparing provisioning",
      deploymentId: created.deployment.id,
    })

    emitLaunchProgress({
      percent: 32,
      stage: "deploying",
      message: "Provisioning infrastructure",
      deploymentId: created.deployment.id,
    })
    emitLaunchLog({
      level: "info",
      source: "ship-yard",
      lines: ["Provisioning infrastructure"],
    })

    const bridgeCrew = created.bridgeCrew.sort(
      (a, b) => BRIDGE_CREW_ROLE_ORDER.indexOf(a.role) - BRIDGE_CREW_ROLE_ORDER.indexOf(b.role),
    )
    const openClawContextBundle = buildOpenClawBridgeCrewContextBundle({
      deploymentId: created.deployment.id,
      bridgeCrew: bridgeCrew.map((member) => ({
        role: member.role,
        callsign: member.callsign,
        name: member.name,
        content: member.content,
      })),
    })

    let launchMetadataState: Record<string, unknown> = {
      ...((created.deployment.metadata as Record<string, unknown> | null) || {}),
    }
    let launchDebitedAmountCents = 0
    let launchDebitLedgerEntryId: string | null = null
    let launchRefundLedgerEntryId: string | null = null
    let launchRefunded = false

    const failLaunch = async (args: {
      error: string
      code: string
      details?: unknown
      metadata?: Record<string, unknown>
      httpStatus?: number
    }) => {
      emitLaunchLog({
        level: "error",
        source: "ship-yard",
        lines: [`Launch failed (${args.code}): ${args.error}`],
      })
      if (
        args.details
        && typeof args.details === "object"
        && !Array.isArray(args.details)
        && Array.isArray((args.details as Record<string, unknown>).suggestedCommands)
      ) {
        const suggested = (args.details as Record<string, unknown>).suggestedCommands as unknown[]
        const lines = suggested
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .slice(0, 12)
          .map((command) => `suggested: ${command}`)
        if (lines.length > 0) {
          emitLaunchLog({
            level: "info",
            source: "ship-yard",
            lines,
          })
        }
      }

      emitLaunchProgress({
        percent: 100,
        stage: "failed",
        message: args.error,
        deploymentId: created.deployment.id,
      })

      if (launchDebitedAmountCents > 0 && !launchRefunded) {
        try {
          const refundResult = await refundLaunchDebit({
            userId: ownerUserId,
            amountCents: launchDebitedAmountCents,
            launchReferenceId: created.deployment.id,
            metadata: {
              reason: "launch_failed",
              failureCode: args.code,
              failureError: args.error,
            },
          })
          launchRefunded = true
          launchRefundLedgerEntryId = refundResult.ledgerEntryId
          launchMetadataState = {
            ...launchMetadataState,
            billing: {
              ...(launchMetadataState.billing as Record<string, unknown> | undefined),
              refund: {
                refunded: true,
                amountCents: launchDebitedAmountCents,
                refundLedgerEntryId: refundResult.ledgerEntryId,
                idempotent: refundResult.idempotent,
              },
            },
          }
        } catch (refundError) {
          launchMetadataState = {
            ...launchMetadataState,
            billing: {
              ...(launchMetadataState.billing as Record<string, unknown> | undefined),
              refund: {
                refunded: false,
                amountCents: launchDebitedAmountCents,
                error: (refundError as Error).message,
              },
            },
          }
        }
      }

      const failureMetadata = {
        ...mergeMetadataPreservingKubeview(launchMetadataState, args.metadata),
        deploymentError: args.error,
        deploymentErrorCode: args.code,
        ...(launchDebitLedgerEntryId
          ? {
              billingDebitLedgerEntryId: launchDebitLedgerEntryId,
            }
          : {}),
        ...(launchRefundLedgerEntryId
          ? {
              billingRefundLedgerEntryId: launchRefundLedgerEntryId,
            }
          : {}),
        ...(args.details
          ? { deploymentErrorDetails: args.details as Prisma.InputJsonValue }
          : {}),
      }

      const deployment = await prisma.agentDeployment.update({
        where: { id: created.deployment.id },
        data: {
          status: "failed",
          lastHealthCheck: new Date(),
          healthStatus: "unhealthy",
          metadata: failureMetadata as Prisma.InputJsonValue,
        },
      })

      publishShipUpdated({
        shipId: deployment.id,
        status: deployment.status,
        nodeId: deployment.nodeId,
        userId: ownerUserId,
      })

      return NextResponse.json(
        {
          error: args.error,
          code: args.code,
          details: args.details,
          deployment,
          bridgeCrew,
          quartermaster,
          baseRequirementsEstimate,
          deploymentOverview,
        },
        { status: args.httpStatus ?? 422 },
      )
    }

    let adapterResult: DeploymentAdapterResult
    if (created.deployment.deploymentProfile === "local_starship_build") {
      emitLaunchProgress({
        percent: 36,
        stage: "checking_tools",
        message: "Checking local tools",
        deploymentId: created.deployment.id,
      })
      emitLaunchProgress({
        percent: 42,
        stage: "launching_local",
        message: "Bootstrapping local Starship build",
        deploymentId: created.deployment.id,
      })
      emitLaunchLog({
        level: "info",
        source: "ship-yard",
        lines: ["Bootstrapping local Starship build"],
      })

      const launchResult = await runShipyardLocalLaunch({
        provisioningMode: created.deployment.provisioningMode,
        infrastructure: normalizedProfile.infrastructure as InfrastructureConfig,
        saneBootstrap,
        openClawContextBundle,
      }, {
        localBootstrapRunner: (input) =>
          runLocalBootstrap(
            input,
            createLocalBootstrapLoggingRuntime({
              emitLaunchLog,
              onProgress: (percent, stage, message) =>
                emitLaunchProgress({
                  percent,
                  stage,
                  message,
                  deploymentId: created.deployment.id,
                }),
            }),
          ),
      })

      if (!launchResult.ok) {
        void cleanupFailedLocalLaunch({
          deploymentId: created.deployment.id,
          userId: ownerUserId,
          deploymentProfile: created.deployment.deploymentProfile,
          config: created.deployment.config,
          metadata: launchResult.metadata as Record<string, unknown> | undefined,
        }).catch((err) => {
          console.error("[shipyard] cleanup after launch failure", err)
        })
        return await failLaunch({
          error: launchResult.error,
          code: launchResult.code,
          details: launchResult.details,
          metadata: launchResult.metadata,
          httpStatus: launchResult.httpStatus,
        })
      }

      adapterResult = launchResult.adapterResult
    } else {
      const cloudProvider = readCloudProviderConfig(created.deployment.config || {})
      if (
        created.deployment.deploymentProfile === "cloud_shipyard"
        && cloudProvider
        && cloudProvider.provider === "hetzner"
      ) {
        emitLaunchProgress({
          percent: 42,
          stage: "launching_cloud",
          message: "Starting managed cloud provisioning",
          deploymentId: created.deployment.id,
        })

        const credentials = await prisma.shipyardCloudCredential.findUnique({
          where: {
            userId_provider: {
              userId: ownerUserId,
              provider: "hetzner",
            },
          },
        })
        if (!credentials) {
          return await failLaunch({
            error: "Hetzner credentials are missing. Configure cloud credentials in Ship Yard Cloud Utility.",
            code: "CLOUD_CREDENTIALS_MISSING",
            details: {
              provider: "hetzner",
              suggestedCommands: [
                "Open Ship Yard -> Cloud Utility -> Hetzner credentials and save API token.",
              ],
            },
          })
        }

        if (!cloudProvider.sshKeyId) {
          return await failLaunch({
            error: "Cloud provider configuration is missing sshKeyId.",
            code: "CLOUD_SSH_KEY_MISSING",
            details: {
              provider: "hetzner",
              suggestedCommands: [
                "Generate/select a Hetzner SSH key in Ship Yard Cloud Utility and retry launch.",
              ],
            },
          })
        }

        const sshKey = await prisma.shipyardCloudSshKey.findFirst({
          where: {
            id: cloudProvider.sshKeyId,
            userId: ownerUserId,
            provider: "hetzner",
          },
        })
        if (!sshKey) {
          return await failLaunch({
            error: "Selected Hetzner SSH key was not found.",
            code: "CLOUD_SSH_KEY_MISSING",
            details: {
              provider: "hetzner",
              sshKeyId: cloudProvider.sshKeyId,
            },
          })
        }

        let sshPrivateKey: string
        let credentialToken: string
        try {
          credentialToken = await resolveCloudCredentialToken({
            userId: ownerUserId,
            provider: "hetzner",
            stored: credentials.tokenEnvelope,
          })
          sshPrivateKey = await resolveCloudSshPrivateKey({
            userId: ownerUserId,
            provider: "hetzner",
            keyName: sshKey.name,
            stored: sshKey.privateKeyEnvelope,
          })
        } catch (error) {
          if (error instanceof ShipyardCloudVaultError) {
            return await failLaunch({
              error: error.message,
              code: error.code,
              details: error.details,
              httpStatus: error.status,
            })
          }
          throw error
        }

        let launchQuote
        try {
          const catalog = await getCloudProviderHandler("hetzner").catalog({
            token: credentialToken,
          })
          launchQuote = buildShipyardCloudLaunchQuote({
            cloudProvider,
            catalog,
          })
        } catch (error) {
          if (error instanceof ShipyardBillingQuoteError) {
            return await failLaunch({
              error: error.message,
              code: error.code,
              httpStatus: error.status,
            })
          }
          return await failLaunch({
            error: "Failed to generate cloud launch billing quote.",
            code: "BILLING_QUOTE_UNAVAILABLE",
            httpStatus: 422,
          })
        }

        const wallet = await getOrCreateWallet({ userId: ownerUserId })
        const quoteWithBalance = withWalletBalance(launchQuote, wallet.balanceCents)
        if (!quoteWithBalance.canLaunch) {
          return await failLaunch({
            error: "Insufficient credits. Refuel before launching managed cloud service.",
            code: "INSUFFICIENT_CREDITS",
            details: {
              requiredCents: quoteWithBalance.totalCents,
              balanceCents: quoteWithBalance.walletBalanceCents,
              shortfallCents: quoteWithBalance.shortfallCents,
            },
            httpStatus: 402,
          })
        }

        try {
          const debitResult = await debitForLaunch({
            userId: ownerUserId,
            amountCents: launchQuote.totalCents,
            launchReferenceId: created.deployment.id,
            metadata: {
              provider: "hetzner",
              location: launchQuote.location,
              baseCostCents: launchQuote.baseCostCents,
              convenienceFeeCents: launchQuote.convenienceFeeCents,
              totalCents: launchQuote.totalCents,
              quoteHours: launchQuote.hours,
            },
          })

          launchDebitedAmountCents = launchQuote.totalCents
          launchDebitLedgerEntryId = debitResult.ledgerEntryId
          launchMetadataState = {
            ...launchMetadataState,
            billing: {
              provider: "hetzner",
              location: launchQuote.location,
              quoteHours: launchQuote.hours,
              currency: launchQuote.currency,
              baseCostCents: launchQuote.baseCostCents,
              convenienceFeePercent: launchQuote.convenienceFeePercent,
              convenienceFeeCents: launchQuote.convenienceFeeCents,
              totalDebitedCents: launchQuote.totalCents,
              debitLedgerEntryId: debitResult.ledgerEntryId,
              walletBalanceAfterDebitCents: debitResult.balanceAfterCents,
            },
          }
        } catch (error) {
          if (error instanceof ShipyardInsufficientCreditsError) {
            return await failLaunch({
              error: "Insufficient credits. Refuel before launching managed cloud service.",
              code: error.code,
              details: {
                requiredCents: error.requiredCents,
                balanceCents: error.balanceCents,
                shortfallCents: error.shortfallCents,
              },
              httpStatus: error.status,
            })
          }
          throw error
        }

        const cloudLaunch = await runShipyardCloudBootstrap({
          deploymentId: created.deployment.id,
          provisioningMode: created.deployment.provisioningMode,
          infrastructure: normalizedProfile.infrastructure as InfrastructureConfig,
          cloudProvider,
          sshPrivateKey,
        }, createCloudBootstrapLoggingRuntime({ emitLaunchLog }))

        if (!cloudLaunch.ok) {
          return await failLaunch({
            error: cloudLaunch.error,
            code: cloudLaunch.code,
            details: cloudLaunch.details,
            metadata: cloudLaunch.metadata,
            httpStatus: cloudLaunch.expected ? 422 : 500,
          })
        }

        adapterResult = {
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
      } else {
        emitLaunchProgress({
          percent: 42,
          stage: "launching",
          message: "Provisioning deployment",
          deploymentId: created.deployment.id,
        })
        emitLaunchLog({
          level: "info",
          source: "deployment-adapter",
          lines: ["Provisioning deployment (deployment adapter)"],
        })

        adapterResult = await runDeploymentAdapter({
          kind: "agent",
          recordId: created.deployment.id,
          name: created.deployment.name,
          nodeId: created.deployment.nodeId,
          nodeType: created.deployment.nodeType,
          nodeUrl: created.deployment.nodeUrl,
          deploymentProfile: created.deployment.deploymentProfile,
          provisioningMode: created.deployment.provisioningMode,
          config: (created.deployment.config || {}) as Record<string, unknown>,
          infrastructure: (((created.deployment.config || {}) as Record<string, unknown>).infrastructure ||
            undefined) as Record<string, unknown> | undefined,
          metadata: (created.deployment.metadata || {}) as Record<string, unknown>,
        })
      }
    }

    emitLaunchProgress({
      percent: 74,
      stage: "adapter_complete",
      message: "Deployment adapter complete. Bootstrapping applications",
      deploymentId: created.deployment.id,
    })
    emitLaunchLog({
      level: "info",
      source: "apps-bootstrap",
      lines: ["Bootstrapping initial applications"],
    })

    emitLaunchProgress({
      percent: 76,
      stage: "preparing_apps",
      message: "Preparing initial applications",
      deploymentId: created.deployment.id,
    })

    const successMetadata = {
      ...mergeMetadataPreservingKubeview(
        launchMetadataState,
        (adapterResult.metadata || {}) as Record<string, unknown>,
      ),
      ...(adapterResult.error ? { deploymentError: adapterResult.error } : {}),
    }

    let deployment = await prisma.agentDeployment.update({
      where: { id: created.deployment.id },
      data: {
        status: adapterResult.status,
        deployedAt: adapterResult.deployedAt || null,
        lastHealthCheck: adapterResult.lastHealthCheck || null,
        healthStatus: adapterResult.healthStatus || null,
        metadata: successMetadata as Prisma.InputJsonValue,
      },
    })

    emitLaunchProgress({
      percent: 86,
      stage: "bootstrapping_apps",
      message: "Bootstrapping initial applications",
      deploymentId: deployment.id,
    })

    const runCommandFn: RunCommandFn = async (command, args, options = {}) => {
      try {
        const execFileAsync = promisify(execFile)
        const { stdout, stderr } = await execFileAsync(command, args, {
          timeout: options.timeoutMs ?? 15_000,
          maxBuffer: 1024 * 1024,
          encoding: "utf8",
        })
        return { code: 0, stdout: stdout ?? "", stderr: stderr ?? "" }
      } catch (err: unknown) {
        const code = typeof (err as NodeJS.ErrnoException)?.code === "number" ? (err as NodeJS.ErrnoException).code : 1
        return {
          code: code ?? 1,
          stderr: err instanceof Error ? err.message : String(err),
        }
      }
    }

    const bootstrap = await bootstrapInitialApplicationsForShipFailOpen(
      {
        ownerUserId,
        ship: {
          id: deployment.id,
          name: deployment.name,
          userId: deployment.userId,
          nodeId: deployment.nodeId,
          nodeType: deployment.nodeType,
          nodeUrl: deployment.nodeUrl,
          deploymentProfile: deployment.deploymentProfile,
          provisioningMode: deployment.provisioningMode,
          config: deployment.config,
        },
        shipStatus: deployment.status,
      },
      {
        onProgress: (message, percent) => {
          if (percent != null) {
            emitLaunchProgress({
              percent,
              stage: "bootstrapping_apps",
              message,
              deploymentId: deployment.id,
            })
          }
        },
        runCommandFn,
      },
    )

    emitLaunchProgress({
      percent: 90,
      stage: "apps_bootstrap_complete",
      message: "Applications bootstrap complete",
      deploymentId: deployment.id,
    })
    emitLaunchProgress({
      percent: 92,
      stage: "applications_ready",
      message: "Applications ready",
      deploymentId: deployment.id,
    })

    console.info("Ship launch initial application bootstrap summary", {
      shipId: deployment.id,
      ownerUserId,
      n8nStatus: bootstrap.n8n.status,
      n8nWarnings: bootstrap.n8n.warnings,
      n8nErrors: bootstrap.n8n.errors.map((entry) => ({
        stage: entry.stage,
        code: entry.code || null,
        message: entry.message,
      })),
      n8nApplicationId: bootstrap.n8n.applicationId,
      n8nToolCatalogEntryId: bootstrap.n8n.toolCatalogEntryId,
      n8nToolGrantId: bootstrap.n8n.toolGrantId,
    })

    const deploymentMetadata = asRecord(deployment.metadata)
    const existingBootstrap = asRecord(deploymentMetadata.bootstrap)
    const existingInitialApplications = asRecord(existingBootstrap.initialApplications)
    const nextMetadata = {
      ...deploymentMetadata,
      bootstrap: {
        ...existingBootstrap,
        initialApplications: {
          ...existingInitialApplications,
          n8n: bootstrap.n8n,
        },
      },
    }

    deployment = await prisma.agentDeployment.update({
      where: { id: deployment.id },
      data: {
        metadata: nextMetadata as unknown as Prisma.InputJsonValue,
      },
    })

    emitLaunchProgress({
      percent: 97,
      stage: "finalizing",
      message: "Finalizing ship systems",
      deploymentId: deployment.id,
    })

    publishShipUpdated({
      shipId: deployment.id,
      status: deployment.status,
      nodeId: deployment.nodeId,
      userId: ownerUserId,
    })

    emitLaunchProgress({
      percent: 100,
      stage: "complete",
      message: "Ship launch complete",
      deploymentId: deployment.id,
    })
    emitLaunchLog({
      level: "info",
      source: "ship-yard",
      lines: ["Ship launch complete"],
    })

    return NextResponse.json({
      deployment,
      bridgeCrew,
      quartermaster,
      baseRequirementsEstimate,
      deploymentOverview,
      bootstrap,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error("Error launching ship yard deployment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
