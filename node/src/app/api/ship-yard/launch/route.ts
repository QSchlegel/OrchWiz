import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import {
  runDeploymentAdapter,
  type DeploymentAdapterResult,
} from "@/lib/deployment/adapter"
import { runShipyardLocalLaunch } from "@/lib/deployment/shipyard-local-launch"
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

  if (!incoming || !Object.prototype.hasOwnProperty.call(incoming, "kubeview")) {
    if (Object.prototype.hasOwnProperty.call(base, "kubeview")) {
      next.kubeview = base.kubeview
    }
  }

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

    const name = asString(body?.name)
    const nodeId = asString(body?.nodeId)
    if (!name || !nodeId) {
      return NextResponse.json(
        { error: "Missing required fields: name and nodeId" },
        { status: 400 },
      )
    }

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

    const crewOverrides = parseCrewOverrides(body?.crewOverrides)

    const normalizedProfile = normalizeDeploymentProfileInput({
      deploymentProfile: body?.deploymentProfile,
      provisioningMode: body?.provisioningMode,
      nodeType: body?.nodeType,
      advancedNodeTypeOverride: body?.advancedNodeTypeOverride,
      config: body?.config,
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

    const quartermaster = await ensureShipQuartermaster({
      userId: ownerUserId,
      shipDeploymentId: created.deployment.id,
      shipName: created.deployment.name,
    })

    await prisma.agentDeployment.update({
      where: { id: created.deployment.id },
      data: { status: "deploying" },
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
      const launchResult = await runShipyardLocalLaunch({
        provisioningMode: created.deployment.provisioningMode,
        infrastructure: normalizedProfile.infrastructure as InfrastructureConfig,
        saneBootstrap,
        openClawContextBundle,
      })

      if (!launchResult.ok) {
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
        })

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

    const bootstrap = await bootstrapInitialApplicationsForShipFailOpen({
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

    publishShipUpdated({
      shipId: deployment.id,
      status: deployment.status,
      nodeId: deployment.nodeId,
      userId: ownerUserId,
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
