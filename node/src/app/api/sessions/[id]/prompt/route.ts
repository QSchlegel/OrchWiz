import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import type { Prisma } from "@prisma/client"
import { runSessionRuntime } from "@/lib/runtime"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { resolveSessionRuntimePrompt } from "@/lib/runtime/bridge-prompt"
import {
  drainBridgeMirrorJobsSafely,
  enqueueSessionToThreadMirrorJob,
} from "@/lib/bridge-chat/sync"
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

export const dynamic = 'force-dynamic'

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { prompt, metadata } = body
    const metadataRecord = metadata && typeof metadata === "object" ? metadata : {}
    const metadataAsRecord = asRecord(metadataRecord)
    const promptResolution = resolveSessionRuntimePrompt({
      userPrompt: prompt,
      metadata: metadataAsRecord,
    })

    // Verify session belongs to user
    const dbSession = await prisma.session.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!dbSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Create user input interaction
    const interaction = await prisma.sessionInteraction.create({
      data: {
        sessionId: id,
        type: "user_input",
        content: promptResolution.interactionContent,
        metadata: metadataRecord as Prisma.InputJsonValue,
      },
    })

    try {
      await enqueueSessionToThreadMirrorJob({
        interactionId: interaction.id,
        sessionId: id,
      })
    } catch (mirrorError) {
      console.error("Failed to enqueue session->thread mirror for user interaction:", mirrorError)
    }

    // Update session status if needed
    if (dbSession.status === "planning") {
      await prisma.session.update({
        where: { id },
        data: { status: "executing" },
      })
    }

    const runtimeResult = await runSessionRuntime({
      sessionId: id,
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
        sessionId: id,
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
              userId: session.user.id,
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
            return NextResponse.json(
              {
                error: "Bridge signature required but no enabled wallet binding exists for the selected bridge crew.",
              },
              { status: 412 },
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
              idempotencyKey: `${id}:${interaction.id}:ai-response`,
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
              return NextResponse.json(
                {
                  error: "Bridge signature required but wallet-enclave signing failed.",
                  details,
                },
                { status: 502 },
              )
            }
          }
        }
      }
    } else if (shouldRequireSignature) {
      return NextResponse.json(
        {
          error: "Bridge signature required but bridgeCrewId/stationKey metadata is missing.",
        },
        { status: 400 },
      )
    }

    if (shouldRequireSignature && !signatureMetadata) {
      return NextResponse.json(
        {
          error: "Bridge signature required but no valid signature metadata was produced.",
        },
        { status: 502 },
      )
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
        sessionId: id,
        type: "ai_response",
        content: runtimeResult.output,
        metadata: responseMetadata,
      },
    })

    try {
      await enqueueSessionToThreadMirrorJob({
        interactionId: responseInteraction.id,
        sessionId: id,
      })
      await drainBridgeMirrorJobsSafely({ label: "sessions.prompt" })
    } catch (mirrorError) {
      console.error("Failed to enqueue session->thread mirror for AI interaction:", mirrorError)
    }

    publishRealtimeEvent({
      type: "session.prompted",
      payload: {
        sessionId: id,
        userInteractionId: interaction.id,
        aiInteractionId: responseInteraction.id,
        provider: runtimeResult.provider,
      },
    })

    return NextResponse.json({
      interaction,
      responseInteraction,
      provider: runtimeResult.provider,
      fallbackUsed: runtimeResult.fallbackUsed,
      signature: signatureMetadata || null,
    })
  } catch (error) {
    console.error("Error submitting prompt:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
