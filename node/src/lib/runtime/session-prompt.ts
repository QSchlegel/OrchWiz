import type { Prisma, SessionInteraction } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { runSessionRuntime } from "@/lib/runtime"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { resolveSessionRuntimePrompt } from "@/lib/runtime/bridge-prompt"
import {
  drainBridgeMirrorJobsSafely,
  enqueueSessionToThreadMirrorJob,
} from "@/lib/bridge-chat/sync"
import {
  drainBridgeDispatchQueueSafely,
  enqueueBridgeDispatchDeliveries,
} from "@/lib/bridge/connections/dispatch"
import {
  buildCanonicalBridgeSigningPayload,
  type BridgeMessageSignatureMetadata,
  signatureMetadataFromEnclave,
  signatureMetadataFromRuntimeBundle,
  validateRuntimeSignatureBundle,
} from "@/lib/runtime/message-signing"
import {
  requireBridgeSignatures,
  signMessagePayload,
  WalletEnclaveError,
} from "@/lib/wallet-enclave/client"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toJsonMetadata(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function resolveBridgeShipDeploymentId(args: {
  userId: string
  bridgeMetadata: Record<string, unknown>
}): Promise<string | null> {
  const directDeploymentId = nonEmptyString(args.bridgeMetadata.shipDeploymentId)
  if (directDeploymentId) {
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id: directDeploymentId,
        userId: args.userId,
        deploymentType: "ship",
      },
      select: {
        id: true,
      },
    })

    if (deployment) {
      return deployment.id
    }
  }

  const bridgeCrewId = nonEmptyString(args.bridgeMetadata.bridgeCrewId)
  if (!bridgeCrewId) {
    return null
  }

  const bridgeCrew = await prisma.bridgeCrew.findFirst({
    where: {
      id: bridgeCrewId,
      deployment: {
        userId: args.userId,
        deploymentType: "ship",
      },
    },
    select: {
      deploymentId: true,
    },
  })

  return bridgeCrew?.deploymentId || null
}

export class SessionPromptError extends Error {
  status: number
  details?: Record<string, unknown>

  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.name = "SessionPromptError"
    this.status = status
    this.details = details
  }
}

export interface ExecuteSessionPromptArgs {
  userId: string
  sessionId: string
  prompt: string
  metadata?: Record<string, unknown>
}

export interface ExecuteSessionPromptResult {
  interaction: SessionInteraction
  responseInteraction: SessionInteraction
  provider: string
  fallbackUsed: boolean
  signature: BridgeMessageSignatureMetadata | null
}

export async function executeSessionPrompt(args: ExecuteSessionPromptArgs): Promise<ExecuteSessionPromptResult> {
  const metadataRecord = args.metadata && typeof args.metadata === "object" ? args.metadata : {}
  const metadataAsRecord = asRecord(metadataRecord)
  const promptResolution = resolveSessionRuntimePrompt({
    userPrompt: args.prompt,
    metadata: metadataAsRecord,
  })

  const dbSession = await prisma.session.findFirst({
    where: {
      id: args.sessionId,
      userId: args.userId,
    },
  })

  if (!dbSession) {
    throw new SessionPromptError("Session not found", 404)
  }

  const interaction = await prisma.sessionInteraction.create({
    data: {
      sessionId: args.sessionId,
      type: "user_input",
      content: promptResolution.interactionContent,
      metadata: metadataRecord as Prisma.InputJsonValue,
    },
  })

  try {
    await enqueueSessionToThreadMirrorJob({
      interactionId: interaction.id,
      sessionId: args.sessionId,
    })
  } catch (mirrorError) {
    console.error("Failed to enqueue session->thread mirror for user interaction:", mirrorError)
  }

  if (dbSession.status === "planning") {
    await prisma.session.update({
      where: { id: args.sessionId },
      data: { status: "executing" },
    })
  }

  const runtimeResult = await runSessionRuntime({
    sessionId: args.sessionId,
    prompt: promptResolution.runtimePrompt,
    metadata: metadataRecord,
  })

  const bridgeMetadata = asRecord(metadataAsRecord.bridge)
  const isBridgeAgentChannel = bridgeMetadata.channel === "bridge-agent"
  const bridgeCrewId = nonEmptyString(bridgeMetadata.bridgeCrewId)
  const bridgeStationKey = nonEmptyString(bridgeMetadata.stationKey)
  const shouldRequireSignature = isBridgeAgentChannel && requireBridgeSignatures()
  let signatureMetadata: BridgeMessageSignatureMetadata | undefined

  if (isBridgeAgentChannel && bridgeCrewId && bridgeStationKey) {
    const signedAt = nonEmptyString(runtimeResult.signatureBundle?.signedAt) || new Date().toISOString()
    const canonical = buildCanonicalBridgeSigningPayload({
      sessionId: args.sessionId,
      interactionType: "ai_response",
      bridgeCrewId,
      bridgeStationKey,
      provider: runtimeResult.provider,
      content: runtimeResult.output,
      signedAt,
    })

    if (validateRuntimeSignatureBundle(runtimeResult.signatureBundle, canonical.payloadHash)) {
      signatureMetadata = signatureMetadataFromRuntimeBundle(runtimeResult.signatureBundle, canonical.payloadJson)
    } else {
      const bridgeCrew = await prisma.bridgeCrew.findFirst({
        where: {
          id: bridgeCrewId,
          status: "active",
          deployment: {
            userId: args.userId,
          },
        },
        select: {
          id: true,
          walletEnabled: true,
          walletAddress: true,
          walletKeyRef: true,
          walletEnclaveUrl: true,
        },
      })

      if (!bridgeCrew?.walletEnabled) {
        if (shouldRequireSignature) {
          throw new SessionPromptError(
            "Bridge signature required but no enabled wallet binding exists for the selected bridge crew.",
            412,
          )
        }
      } else {
        const keyRef = bridgeCrew.walletKeyRef || bridgeCrew.id

        try {
          const enclaveSigned = await signMessagePayload({
            keyRef,
            payload: canonical.payloadJson,
            address: bridgeCrew.walletAddress || undefined,
            enclaveUrl: bridgeCrew.walletEnclaveUrl || undefined,
            idempotencyKey: `${args.sessionId}:${interaction.id}:ai-response`,
          })

          if (enclaveSigned.payloadHash !== canonical.payloadHash) {
            throw new WalletEnclaveError("Wallet enclave returned a mismatched payload hash.", {
              status: 502,
              code: "INVALID_SIGNATURE_PAYLOAD_HASH",
            })
          }

          signatureMetadata = signatureMetadataFromEnclave(
            {
              ...enclaveSigned,
              keyRef,
            },
            canonical.payloadJson,
            canonical.payload.signedAt,
          )
        } catch (error) {
          if (shouldRequireSignature) {
            const details =
              error instanceof WalletEnclaveError
                ? { code: error.code, requestId: error.requestId, details: error.details }
                : undefined
            throw new SessionPromptError(
              "Bridge signature required but wallet-enclave signing failed.",
              502,
              details,
            )
          }
        }
      }
    }
  } else if (shouldRequireSignature) {
    throw new SessionPromptError("Bridge signature required but bridgeCrewId/stationKey metadata is missing.", 400)
  }

  if (shouldRequireSignature && !signatureMetadata) {
    throw new SessionPromptError("Bridge signature required but no valid signature metadata was produced.", 502)
  }

  const responseMetadata = toJsonMetadata({
    provider: runtimeResult.provider,
    fallbackUsed: runtimeResult.fallbackUsed,
    ...(runtimeResult.metadata || {}),
    ...(promptResolution.bridgeResponseMetadata || {}),
    ...(signatureMetadata ? { signature: signatureMetadata } : {}),
  })

  const responseInteraction = await prisma.sessionInteraction.create({
    data: {
      sessionId: args.sessionId,
      type: "ai_response",
      content: runtimeResult.output,
      metadata: responseMetadata,
    },
  })

  if (isBridgeAgentChannel && bridgeStationKey === "cou") {
    try {
      const shipDeploymentId = await resolveBridgeShipDeploymentId({
        userId: args.userId,
        bridgeMetadata,
      })

      if (shipDeploymentId) {
        const deliveries = await enqueueBridgeDispatchDeliveries({
          deploymentId: shipDeploymentId,
          source: "cou_auto",
          message: runtimeResult.output,
          autoRelayOnly: true,
          payload: {
            type: "bridge.cou.auto-relay",
            sessionId: args.sessionId,
            interactionId: responseInteraction.id,
            bridgeCrewId,
            stationKey: bridgeStationKey,
          },
          metadata: {
            provider: runtimeResult.provider,
            fallbackUsed: runtimeResult.fallbackUsed,
          },
        })

        await drainBridgeDispatchQueueSafely({
          deploymentId: shipDeploymentId,
          limit: Math.max(6, deliveries.length * 3),
          label: "runtime.session-prompt.cou-auto-relay",
        })
      }
    } catch (dispatchError) {
      console.error("COU auto-relay dispatch failed (fail-open):", dispatchError)
    }
  }

  try {
    await enqueueSessionToThreadMirrorJob({
      interactionId: responseInteraction.id,
      sessionId: args.sessionId,
    })
    await drainBridgeMirrorJobsSafely({ label: "runtime.session-prompt" })
  } catch (mirrorError) {
    console.error("Failed to enqueue session->thread mirror for AI interaction:", mirrorError)
  }

  publishRealtimeEvent({
    type: "session.prompted",
    payload: {
      sessionId: args.sessionId,
      userInteractionId: interaction.id,
      aiInteractionId: responseInteraction.id,
      provider: runtimeResult.provider,
    },
  })

  return {
    interaction,
    responseInteraction,
    provider: runtimeResult.provider,
    fallbackUsed: runtimeResult.fallbackUsed,
    signature: signatureMetadata || null,
  }
}
