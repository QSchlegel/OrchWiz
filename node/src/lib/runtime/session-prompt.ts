import type { Prisma, SessionInteraction } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { runSessionRuntime } from "@/lib/runtime"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { resolveSessionRuntimePrompt } from "@/lib/runtime/bridge-prompt"
import type { RuntimeResult } from "@/lib/types/runtime"
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
import { RuntimeProviderError } from "@/lib/runtime/errors"
import { buildExocompCapabilityInstructionBlock } from "@/lib/subagents/capabilities"
import { getShipToolRuntimeContext } from "@/lib/tools/requests"
import { recordRuntimePerformanceSample } from "@/lib/performance/tracker"

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

function resolvePromptSubagentId(metadata: Record<string, unknown>): string | null {
  const direct = nonEmptyString(metadata.subagentId)
  if (direct) {
    return direct
  }

  const quartermaster = asRecord(metadata.quartermaster)
  return nonEmptyString(quartermaster.subagentId)
}

function resolveShipToolPromptContext(metadata: Record<string, unknown>): {
  channel: "quartermaster" | "bridge" | null
  shipDeploymentId: string | null
  bridgeCrewId: string | null
} {
  const quartermaster = asRecord(metadata.quartermaster)
  if (nonEmptyString(quartermaster.channel) === "ship-quartermaster") {
    const shipContext = asRecord(metadata.shipContext)
    return {
      channel: "quartermaster",
      shipDeploymentId: nonEmptyString(quartermaster.shipDeploymentId) || nonEmptyString(shipContext.shipDeploymentId),
      bridgeCrewId: null,
    }
  }

  const bridge = asRecord(metadata.bridge)
  if (nonEmptyString(bridge.channel) === "bridge-agent") {
    return {
      channel: "bridge",
      shipDeploymentId: nonEmptyString(bridge.shipDeploymentId),
      bridgeCrewId: nonEmptyString(bridge.bridgeCrewId),
    }
  }

  return {
    channel: null,
    shipDeploymentId: null,
    bridgeCrewId: null,
  }
}

function trimShipToolBlock(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars - 23)}\n...[tools block trimmed]`
}

function buildShipToolInstructionBlock(args: {
  channel: "quartermaster" | "bridge"
  context: {
    shipName: string
    grantedTools: Array<{
      slug: string
      name: string
      description: string | null
      scope: "ship" | "bridge_crew"
      bridgeCrewCallsign?: string
    }>
    requestableTools: Array<{
      slug: string
      name: string
      description: string | null
    }>
  }
}): string {
  const grantedLines: string[] = []
  const requestableLines: string[] = []

  for (const item of args.context.grantedTools.slice(0, 10)) {
    const scopeLabel = item.scope === "ship"
      ? "ship-wide"
      : `bridge-crew${item.bridgeCrewCallsign ? `:${item.bridgeCrewCallsign}` : ""}`
    grantedLines.push(`- ${item.slug} (${scopeLabel})${item.description ? `: ${item.description}` : ""}`)
  }

  for (const item of args.context.requestableTools.slice(0, 12)) {
    requestableLines.push(`- ${item.slug}${item.description ? `: ${item.description}` : ""}`)
  }

  const lines = [
    "Available Tools:",
    `Ship: ${args.context.shipName}`,
    "Granted:",
    ...(grantedLines.length > 0 ? grantedLines : ["- none"]),
    "Requestable:",
    ...(requestableLines.length > 0 ? requestableLines : ["- none"]),
    "Request protocol:",
    args.channel === "quartermaster"
      ? "- Use the Ship Quartermaster panel action `File Tool Request` with catalogEntryId, requesterBridgeCrewId (optional), and rationale."
      : "- Ask quartermaster to file a tool request; include tool slug and rationale. Do not assume immediate access.",
  ]

  return trimShipToolBlock(lines.join("\n"), 3_500)
}

export async function appendShipToolInstructions(args: {
  userId: string
  metadata: Record<string, unknown>
  runtimePrompt: string
}, deps?: {
  getRuntimeContext: typeof getShipToolRuntimeContext
}): Promise<string> {
  const contextInfo = resolveShipToolPromptContext(args.metadata)
  if (!contextInfo.channel || !contextInfo.shipDeploymentId) {
    return args.runtimePrompt
  }

  const getRuntimeContext = deps?.getRuntimeContext || getShipToolRuntimeContext

  try {
    const context = await getRuntimeContext({
      ownerUserId: args.userId,
      shipDeploymentId: contextInfo.shipDeploymentId,
      bridgeCrewId: contextInfo.channel === "bridge" ? contextInfo.bridgeCrewId : null,
    })

    if (!context) {
      return args.runtimePrompt
    }

    const block = buildShipToolInstructionBlock({
      channel: contextInfo.channel,
      context,
    })

    return `${args.runtimePrompt}\n\n${block}`
  } catch (error) {
    console.error("Failed to append ship tool instructions to runtime prompt (fail-open):", error)
    return args.runtimePrompt
  }
}

export async function appendExocompCapabilityInstructions(args: {
  userId: string
  metadata: Record<string, unknown>
  runtimePrompt: string
}): Promise<string> {
  const subagentId = resolvePromptSubagentId(args.metadata)
  if (!subagentId) {
    return args.runtimePrompt
  }

  try {
    const subagent = await prisma.subagent.findFirst({
      where: {
        id: subagentId,
        OR: [
          { ownerUserId: args.userId },
          { isShared: true },
        ],
      },
      select: {
        subagentType: true,
        settings: true,
      },
    })

    if (!subagent || subagent.subagentType !== "exocomp") {
      return args.runtimePrompt
    }

    const settings = asRecord(subagent.settings)
    const capabilityBlock = buildExocompCapabilityInstructionBlock(settings.capabilities)
    if (!capabilityBlock.trim()) {
      return args.runtimePrompt
    }

    return `${args.runtimePrompt}\n\n${capabilityBlock}`
  } catch (error) {
    console.error("Failed to resolve exocomp capabilities for runtime prompt (fail-open):", error)
    return args.runtimePrompt
  }
}

interface QuartermasterCitationSource {
  id: string
  path: string
  title: string
}

function normalizeQuartermasterCitationSource(value: unknown, index: number): QuartermasterCitationSource | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>
  const id = nonEmptyString(record.id) || `S${index + 1}`
  const path = nonEmptyString(record.path)
  if (!path) {
    return null
  }

  return {
    id: id.startsWith("S") ? id : `S${id}`,
    path,
    title: nonEmptyString(record.title) || "Untitled",
  }
}

function quartermasterCitationSources(metadata: Record<string, unknown>): QuartermasterCitationSource[] {
  const quartermaster = asRecord(metadata.quartermaster)
  const knowledge = asRecord(quartermaster.knowledge)
  if (!Array.isArray(knowledge.sources)) {
    return []
  }

  const normalized = knowledge.sources
    .map((source, index) => normalizeQuartermasterCitationSource(source, index))
    .filter((source): source is QuartermasterCitationSource => Boolean(source))

  const deduped = new Map<string, QuartermasterCitationSource>()
  for (const source of normalized) {
    deduped.set(source.id, source)
  }

  return [...deduped.values()].sort((left, right) => left.id.localeCompare(right.id))
}

export function buildQuartermasterCitationFooter(sources: QuartermasterCitationSource[]): string {
  if (sources.length === 0) {
    return "Sources:\n[S0] No indexed knowledge sources retrieved."
  }

  const lines = ["Sources:"]
  for (const source of sources) {
    lines.push(`[${source.id}] ${source.title} - ${source.path}`)
  }
  return lines.join("\n")
}

export function enforceQuartermasterCitationFooter(
  output: string,
  sources: QuartermasterCitationSource[],
): string {
  const trimmed = output.trimEnd()
  const footer = buildQuartermasterCitationFooter(sources)

  if (!trimmed) {
    return footer
  }

  const hasSourceSection = /(^|\n)Sources:\n/iu.test(trimmed)
  if (hasSourceSection) {
    return trimmed
  }

  const hasCitationMarker = /\[S\d+\]/u.test(trimmed)
  if (hasCitationMarker) {
    return `${trimmed}\n\n${footer}`
  }

  if (sources.length > 0) {
    const references = sources.map((source) => `[${source.id}]`).join(" ")
    return `${trimmed}\n\nCitations: ${references}\n\n${footer}`
  }

  return `${trimmed}\n\n${footer}`
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
  const runtimePromptWithCapabilities = await appendExocompCapabilityInstructions({
    userId: args.userId,
    metadata: metadataAsRecord,
    runtimePrompt: promptResolution.runtimePrompt,
  })
  const runtimePrompt = await appendShipToolInstructions({
    userId: args.userId,
    metadata: metadataAsRecord,
    runtimePrompt: runtimePromptWithCapabilities,
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

  const runtimeMetadata = asRecord(metadataAsRecord.runtime)
  const runtimeProfile = nonEmptyString(runtimeMetadata.profile)
  const runtimeStartedAt = Date.now()
  let runtimeResult: RuntimeResult
  try {
    runtimeResult = await runSessionRuntime({
      sessionId: args.sessionId,
      prompt: runtimePrompt,
      metadata: metadataRecord,
    })

    await recordRuntimePerformanceSample({
      userId: args.userId,
      sessionId: args.sessionId,
      source: "runtime.session-prompt",
      runtimeProfile,
      provider: runtimeResult.provider,
      status: "success",
      fallbackUsed: runtimeResult.fallbackUsed,
      durationMs: Date.now() - runtimeStartedAt,
    })
  } catch (error) {
    const runtimeDurationMs = Date.now() - runtimeStartedAt
    if (error instanceof RuntimeProviderError) {
      await recordRuntimePerformanceSample({
        userId: args.userId,
        sessionId: args.sessionId,
        source: "runtime.session-prompt",
        runtimeProfile,
        provider: error.provider,
        status: "error",
        fallbackUsed: false,
        durationMs: runtimeDurationMs,
        errorCode: error.code,
      })

      throw new SessionPromptError(error.message, error.status, {
        code: error.code,
        provider: error.provider,
        recoverable: error.recoverable,
        ...(error.details ? { details: error.details } : {}),
      })
    }

    await recordRuntimePerformanceSample({
      userId: args.userId,
      sessionId: args.sessionId,
      source: "runtime.session-prompt",
      runtimeProfile,
      provider: null,
      status: "error",
      fallbackUsed: false,
      durationMs: runtimeDurationMs,
      errorCode: "INTERNAL_ERROR",
    })
    throw error
  }

  const bridgeMetadata = asRecord(metadataAsRecord.bridge)
  const quartermasterMetadata = asRecord(metadataAsRecord.quartermaster)
  const isQuartermasterChannel = quartermasterMetadata.channel === "ship-quartermaster"
  const finalOutput = isQuartermasterChannel
    ? enforceQuartermasterCitationFooter(runtimeResult.output, quartermasterCitationSources(metadataAsRecord))
    : runtimeResult.output

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
      content: finalOutput,
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
      content: finalOutput,
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
          message: finalOutput,
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
    userId: args.userId,
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
