import type { Prisma } from "@prisma/client"
import type {
  BridgeCrewRole,
  MotionBaseline,
  MotionDecision,
  MotionSample,
  MotionSupervisionConfig,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { getShipToolRuntimeContext } from "@/lib/tools/requests"
import { upsertMotionIncident } from "@/lib/security/incident-response/persistence"
import { embedTextForMotion } from "./embeddings"
import { updateEmbeddingBaseline } from "./baseline"
import { resolveMotionEntity, type MotionEntityResolution } from "./entity"
import { scoreMotionSample, type MotionBaselineSnapshot, type MotionReason } from "./scoring"
import {
  dedupeStrings,
  incrementCountMap,
  parseCountMap,
  parseVector,
  welfordFromBaseline,
  welfordUpdate,
} from "./stats"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asBridgeCrewRole(value: unknown): BridgeCrewRole | null {
  if (
    value === "xo" ||
    value === "ops" ||
    value === "eng" ||
    value === "sec" ||
    value === "med" ||
    value === "cou"
  ) {
    return value
  }

  return null
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function baselineSnapshotFromRecord(baseline: MotionBaseline | null): MotionBaselineSnapshot | null {
  if (!baseline) return null

  return {
    sampleCount: baseline.sampleCount,
    promptCharsMean: baseline.promptCharsMean,
    promptCharsM2: baseline.promptCharsM2,
    promptCharsCount: baseline.promptCharsCount,
    outputCharsMean: baseline.outputCharsMean,
    outputCharsM2: baseline.outputCharsM2,
    outputCharsCount: baseline.outputCharsCount,
    durationMsMean: baseline.durationMsMean,
    durationMsM2: baseline.durationMsM2,
    durationMsCount: baseline.durationMsCount,
    inputCentroid: baseline.inputCentroid,
    inputSimMean: baseline.inputSimMean,
    inputSimM2: baseline.inputSimM2,
    inputSimCount: baseline.inputSimCount,
    outputCentroid: baseline.outputCentroid,
    outputSimMean: baseline.outputSimMean,
    outputSimM2: baseline.outputSimM2,
    outputSimCount: baseline.outputSimCount,
    toolBindingSlugCounts: baseline.toolBindingSlugCounts,
    skillPolicySlugCounts: baseline.skillPolicySlugCounts,
    shipGrantedToolSlugCounts: baseline.shipGrantedToolSlugCounts,
    commandUsageCounts: baseline.commandUsageCounts,
  }
}

async function getOrCreateMotionConfig(ownerUserId: string): Promise<MotionSupervisionConfig> {
  return prisma.motionSupervisionConfig.upsert({
    where: {
      ownerUserId,
    },
    create: {
      ownerUserId,
    },
    update: {},
  })
}

async function resolveSubagentBindings(ownerUserId: string, subagentId: string | null): Promise<{
  toolBindingSlugs: string[]
  skillPolicySlugs: string[]
}> {
  if (!subagentId) {
    return { toolBindingSlugs: [], skillPolicySlugs: [] }
  }

  const subagent = await prisma.subagent.findFirst({
    where: {
      id: subagentId,
      OR: [{ ownerUserId }, { isShared: true }],
    },
    select: {
      toolBindings: {
        where: { enabled: true },
        select: {
          toolCatalogEntry: {
            select: { slug: true },
          },
        },
      },
      permissionPolicies: {
        where: { enabled: true },
        select: {
          policy: {
            select: { slug: true },
          },
        },
      },
    },
  })

  if (!subagent) {
    return { toolBindingSlugs: [], skillPolicySlugs: [] }
  }

  const toolBindingSlugs = dedupeStrings(subagent.toolBindings.map((binding) => binding.toolCatalogEntry.slug))
  const skillPolicySlugs = dedupeStrings(subagent.permissionPolicies.map((assignment) => assignment.policy.slug))
  return { toolBindingSlugs, skillPolicySlugs }
}

async function resolveShipToolSlugsForMotion(args: {
  ownerUserId: string
  metadata: Record<string, unknown>
}): Promise<{ granted: string[]; requestable: string[] }> {
  const bridge = asRecord(args.metadata.bridge)
  const quartermaster = asRecord(args.metadata.quartermaster)
  const shipContext = asRecord(args.metadata.shipContext)

  const quartermasterChannel = nonEmptyString(quartermaster.channel)
  if (quartermasterChannel === "ship-quartermaster") {
    const shipDeploymentId = nonEmptyString(quartermaster.shipDeploymentId) || nonEmptyString(shipContext.shipDeploymentId)
    if (!shipDeploymentId) {
      return { granted: [], requestable: [] }
    }

    try {
      const context = await getShipToolRuntimeContext({
        ownerUserId: args.ownerUserId,
        shipDeploymentId,
        bridgeCrewId: null,
      })

      return {
        granted: context ? dedupeStrings(context.grantedTools.map((tool) => tool.slug)) : [],
        requestable: context ? dedupeStrings(context.requestableTools.map((tool) => tool.slug)) : [],
      }
    } catch (error) {
      console.error("Motion ship tool context resolution failed (quartermaster, fail-open):", error)
      return { granted: [], requestable: [] }
    }
  }

  const bridgeChannel = nonEmptyString(bridge.channel)
  if (bridgeChannel === "bridge-agent") {
    const shipDeploymentId = nonEmptyString(bridge.shipDeploymentId)
    if (!shipDeploymentId) {
      return { granted: [], requestable: [] }
    }

    try {
      const context = await getShipToolRuntimeContext({
        ownerUserId: args.ownerUserId,
        shipDeploymentId,
        bridgeCrewId: nonEmptyString(bridge.bridgeCrewId),
      })

      return {
        granted: context ? dedupeStrings(context.grantedTools.map((tool) => tool.slug)) : [],
        requestable: context ? dedupeStrings(context.requestableTools.map((tool) => tool.slug)) : [],
      }
    } catch (error) {
      console.error("Motion ship tool context resolution failed (bridge-agent, fail-open):", error)
      return { granted: [], requestable: [] }
    }
  }

  return { granted: [], requestable: [] }
}

function realtimeMotionPayload(args: {
  sampleId: string
  decision: MotionDecision
  reasons: MotionReason[]
  entity: MotionEntityResolution
  incidentId: string | null
}): Record<string, unknown> {
  return {
    sampleId: args.sampleId,
    decision: args.decision,
    reasons: args.reasons,
    entity: {
      entityKey: args.entity.entityKey,
      entityType: args.entity.entityType,
      shipDeploymentId: args.entity.shipDeploymentId,
      subagentId: args.entity.subagentId,
      stationKey: args.entity.stationKey,
      bridgeCrewId: args.entity.bridgeCrewId,
    },
    incidentId: args.incidentId,
  }
}

function recordRealtimeMotionAnomaly(args: {
  ownerUserId: string
  sampleId: string
  decision: MotionDecision
  reasons: MotionReason[]
  entity: MotionEntityResolution
  incidentId: string | null
}): void {
  if (args.decision !== "warn" && args.decision !== "block") {
    return
  }

  publishRealtimeEvent({
    type: "security.motion.anomaly",
    userId: args.ownerUserId,
    payload: realtimeMotionPayload(args),
  })
}

export interface MotionRuntimePromptPrecheckResult {
  enabled: boolean
  config: MotionSupervisionConfig | null
  entity: MotionEntityResolution
  baseline: MotionBaseline | null
  baselineSnapshot: MotionBaselineSnapshot | null
  sample: MotionSample | null
  inputEmbedding: number[] | null
  outputEmbedding: null
  toolBindingSlugs: string[]
  skillPolicySlugs: string[]
  shipGrantedToolSlugs: string[]
  shipRequestableToolSlugs: string[]
  decision: MotionDecision
  reasons: MotionReason[]
  baselineReady: boolean
  inputSimilarity: number | null
  incidentId: string | null
}

export async function motionPrecheckRuntimePrompt(args: {
  ownerUserId: string
  sessionId: string
  interactionId: string
  traceId: string
  runtimePrompt: string
  metadata: Record<string, unknown>
  runtimeProfile: string | null
  executionKind: string | null
}): Promise<MotionRuntimePromptPrecheckResult> {
  const config = await getOrCreateMotionConfig(args.ownerUserId)

  const entity = resolveMotionEntity({
    ownerUserId: args.ownerUserId,
    metadata: args.metadata,
  })

  if (config.mode === "off") {
    return {
      enabled: false,
      config,
      entity,
      baseline: null,
      baselineSnapshot: null,
      sample: null,
      inputEmbedding: null,
      outputEmbedding: null,
      toolBindingSlugs: [],
      skillPolicySlugs: [],
      shipGrantedToolSlugs: [],
      shipRequestableToolSlugs: [],
      decision: "allow",
      reasons: [],
      baselineReady: false,
      inputSimilarity: null,
      incidentId: null,
    }
  }

  const [baseline, bindings, shipToolSlugs] = await Promise.all([
    prisma.motionBaseline.findUnique({
      where: {
        ownerUserId_entityKey: {
          ownerUserId: args.ownerUserId,
          entityKey: entity.entityKey,
        },
      },
    }),
    resolveSubagentBindings(args.ownerUserId, entity.subagentId),
    resolveShipToolSlugsForMotion({ ownerUserId: args.ownerUserId, metadata: args.metadata }),
  ])

  const baselineSnapshot = baselineSnapshotFromRecord(baseline)
  const inputEmbedding = await embedTextForMotion({ text: args.runtimePrompt, model: config.embeddingModel })

  const score = scoreMotionSample({
    strictness: config.strictness,
    baselineMinSamples: config.baselineMinSamples,
    baseline: baselineSnapshot,
    promptChars: args.runtimePrompt.length,
    inputEmbedding,
    outputEmbedding: undefined,
    toolBindingSlugs: bindings.toolBindingSlugs,
    skillPolicySlugs: bindings.skillPolicySlugs,
    shipGrantedToolSlugs: shipToolSlugs.granted,
    commandUsageKeys: undefined,
  })

  const sample = await prisma.motionSample.create({
    data: {
      ownerUserId: args.ownerUserId,
      baselineId: baseline?.id ?? null,
      entityType: entity.entityType,
      entityKey: entity.entityKey,
      eventType: "runtime_prompt",
      decision: score.decision,
      reasons: toJsonValue(score.reasons),
      baselineReady: score.baselineReady,
      shipDeploymentId: entity.shipDeploymentId,
      subagentId: entity.subagentId,
      stationKey: asBridgeCrewRole(entity.stationKey),
      bridgeCrewId: entity.bridgeCrewId,
      sessionId: args.sessionId,
      interactionId: args.interactionId,
      traceId: args.traceId,
      runtimeProfile: args.runtimeProfile,
      executionKind: args.executionKind,
      promptChars: args.runtimePrompt.length,
      inputSimilarity: score.inputSimilarity,
      toolBindingSlugs: toJsonValue(bindings.toolBindingSlugs),
      skillPolicySlugs: toJsonValue(bindings.skillPolicySlugs),
      shipGrantedToolSlugs: toJsonValue(shipToolSlugs.granted),
      shipRequestableToolSlugs: toJsonValue(shipToolSlugs.requestable),
    },
  })

  let incidentId: string | null = null
  if (config.mode === "production" && score.decision === "block") {
    const incident = await upsertMotionIncident({
      ownerUserId: args.ownerUserId,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      decision: "block",
      reasons: score.reasons,
      shipDeploymentId: entity.shipDeploymentId,
      subagentId: entity.subagentId,
      stationKey: entity.stationKey,
      bridgeCrewId: entity.bridgeCrewId,
      traceId: args.traceId,
      sessionId: args.sessionId,
      interactionId: args.interactionId,
      motionSampleId: sample.id,
    })

    incidentId = incident?.incidentId ?? null
    if (incidentId) {
      await prisma.motionSample.update({
        where: { id: sample.id },
        data: {
          incidentId,
        },
      })

      publishRealtimeEvent({
        type: "security.incident.updated",
        userId: args.ownerUserId,
        payload: {
          incidentId,
          source: "motion-supervision",
          entityKey: entity.entityKey,
          decision: "block",
          sampleId: sample.id,
        },
      })
    }
  }

  recordRealtimeMotionAnomaly({
    ownerUserId: args.ownerUserId,
    sampleId: sample.id,
    decision: score.decision,
    reasons: score.reasons,
    entity,
    incidentId,
  })

  return {
    enabled: true,
    config,
    entity,
    baseline,
    baselineSnapshot,
    sample,
    inputEmbedding,
    outputEmbedding: null,
    toolBindingSlugs: bindings.toolBindingSlugs,
    skillPolicySlugs: bindings.skillPolicySlugs,
    shipGrantedToolSlugs: shipToolSlugs.granted,
    shipRequestableToolSlugs: shipToolSlugs.requestable,
    decision: score.decision,
    reasons: score.reasons,
    baselineReady: score.baselineReady,
    inputSimilarity: score.inputSimilarity,
    incidentId,
  }
}

function buildBaselineObservationUpdate(args: {
  baseline: MotionBaseline
  entity: MotionEntityResolution
  promptChars: number | null
  outputChars: number | null
  durationMs: number | null
  inputEmbedding: number[] | null
  outputEmbedding: number[] | null
  toolBindingSlugs: string[]
  skillPolicySlugs: string[]
  shipGrantedToolSlugs: string[]
  commandUsageKeys: string[]
}): Prisma.MotionBaselineUncheckedUpdateInput {
  const data: Prisma.MotionBaselineUncheckedUpdateInput = {
    sampleCount: {
      increment: 1,
    },
    shipDeploymentId: args.entity.shipDeploymentId,
    subagentId: args.entity.subagentId,
    stationKey: asBridgeCrewRole(args.entity.stationKey),
  }

  if (typeof args.promptChars === "number" && Number.isFinite(args.promptChars)) {
    const prev = welfordFromBaseline({
      mean: args.baseline.promptCharsMean,
      m2: args.baseline.promptCharsM2,
      count: args.baseline.promptCharsCount,
    })
    const next = welfordUpdate(prev, args.promptChars)
    data.promptCharsMean = next.mean
    data.promptCharsM2 = next.m2
    data.promptCharsCount = next.count
  }

  if (typeof args.outputChars === "number" && Number.isFinite(args.outputChars)) {
    const prev = welfordFromBaseline({
      mean: args.baseline.outputCharsMean,
      m2: args.baseline.outputCharsM2,
      count: args.baseline.outputCharsCount,
    })
    const next = welfordUpdate(prev, args.outputChars)
    data.outputCharsMean = next.mean
    data.outputCharsM2 = next.m2
    data.outputCharsCount = next.count
  }

  if (typeof args.durationMs === "number" && Number.isFinite(args.durationMs)) {
    const prev = welfordFromBaseline({
      mean: args.baseline.durationMsMean,
      m2: args.baseline.durationMsM2,
      count: args.baseline.durationMsCount,
    })
    const next = welfordUpdate(prev, args.durationMs)
    data.durationMsMean = next.mean
    data.durationMsM2 = next.m2
    data.durationMsCount = next.count
  }

  if (args.inputEmbedding) {
    const prevCentroid = parseVector(args.baseline.inputCentroid)
    const prevSim = welfordFromBaseline({
      mean: args.baseline.inputSimMean,
      m2: args.baseline.inputSimM2,
      count: args.baseline.inputSimCount,
    })

    const next = updateEmbeddingBaseline({
      state: {
        centroid: prevCentroid,
        sim: prevSim,
      },
      vector: args.inputEmbedding,
    })

    data.inputCentroid = toJsonValue(next.state.centroid)
    if (next.state.sim) {
      data.inputSimMean = next.state.sim.mean
      data.inputSimM2 = next.state.sim.m2
      data.inputSimCount = next.state.sim.count
    }
  }

  if (args.outputEmbedding) {
    const prevCentroid = parseVector(args.baseline.outputCentroid)
    const prevSim = welfordFromBaseline({
      mean: args.baseline.outputSimMean,
      m2: args.baseline.outputSimM2,
      count: args.baseline.outputSimCount,
    })

    const next = updateEmbeddingBaseline({
      state: {
        centroid: prevCentroid,
        sim: prevSim,
      },
      vector: args.outputEmbedding,
    })

    data.outputCentroid = toJsonValue(next.state.centroid)
    if (next.state.sim) {
      data.outputSimMean = next.state.sim.mean
      data.outputSimM2 = next.state.sim.m2
      data.outputSimCount = next.state.sim.count
    }
  }

  data.toolBindingSlugCounts = toJsonValue(
    incrementCountMap(parseCountMap(args.baseline.toolBindingSlugCounts), args.toolBindingSlugs),
  )
  data.skillPolicySlugCounts = toJsonValue(
    incrementCountMap(parseCountMap(args.baseline.skillPolicySlugCounts), args.skillPolicySlugs),
  )
  data.shipGrantedToolSlugCounts = toJsonValue(
    incrementCountMap(parseCountMap(args.baseline.shipGrantedToolSlugCounts), args.shipGrantedToolSlugs),
  )
  data.commandUsageCounts = toJsonValue(
    incrementCountMap(parseCountMap(args.baseline.commandUsageCounts), args.commandUsageKeys),
  )

  return data
}

export interface MotionRuntimePromptFinalizeResult {
  enabled: boolean
  decision: MotionDecision
  reasons: MotionReason[]
  incidentId: string | null
  outputEmbedding: number[] | null
}

export async function motionFinalizeRuntimePrompt(args: {
  ownerUserId: string
  sampleId: string
  traceId: string
  sessionId: string
  interactionId: string
  responseInteractionId: string
  runtimePrompt: string
  outputText: string
  durationMs: number | null
  provider: string | null
  runtimeProfile: string | null
  executionKind: string | null
  metadata: Record<string, unknown>
  precheck: MotionRuntimePromptPrecheckResult
}): Promise<MotionRuntimePromptFinalizeResult> {
  if (!args.precheck.enabled || !args.precheck.config) {
    return {
      enabled: false,
      decision: "allow",
      reasons: [],
      incidentId: null,
      outputEmbedding: null,
    }
  }

  const config = args.precheck.config
  const entity = args.precheck.entity
  const baseline = args.precheck.baseline
  const baselineSnapshot = args.precheck.baselineSnapshot
  const inputEmbedding = args.precheck.inputEmbedding

  const outputEmbedding = await embedTextForMotion({
    text: args.outputText,
    model: config.embeddingModel,
  })

  const score = scoreMotionSample({
    strictness: config.strictness,
    baselineMinSamples: config.baselineMinSamples,
    baseline: baselineSnapshot,
    promptChars: args.runtimePrompt.length,
    outputChars: args.outputText.length,
    durationMs: args.durationMs,
    inputEmbedding,
    outputEmbedding,
    toolBindingSlugs: args.precheck.toolBindingSlugs,
    skillPolicySlugs: args.precheck.skillPolicySlugs,
    shipGrantedToolSlugs: args.precheck.shipGrantedToolSlugs,
    commandUsageKeys: undefined,
  })

  const updated = await prisma.motionSample.update({
    where: { id: args.sampleId },
    data: {
      responseInteractionId: args.responseInteractionId,
      provider: args.provider,
      runtimeProfile: args.runtimeProfile,
      executionKind: args.executionKind,
      outputChars: args.outputText.length,
      durationMs: args.durationMs,
      decision: score.decision,
      reasons: toJsonValue(score.reasons),
      outputSimilarity: score.outputSimilarity,
      inputSimilarity: score.inputSimilarity,
    },
  })

  let incidentId = updated.incidentId || null
  if (config.mode === "production" && score.decision === "block" && !incidentId) {
    const incident = await upsertMotionIncident({
      ownerUserId: args.ownerUserId,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      decision: "block",
      reasons: score.reasons,
      shipDeploymentId: entity.shipDeploymentId,
      subagentId: entity.subagentId,
      stationKey: entity.stationKey,
      bridgeCrewId: entity.bridgeCrewId,
      traceId: args.traceId,
      sessionId: args.sessionId,
      interactionId: args.interactionId,
      responseInteractionId: args.responseInteractionId,
      motionSampleId: updated.id,
    })

    incidentId = incident?.incidentId ?? null
    if (incidentId) {
      await prisma.motionSample.update({
        where: { id: updated.id },
        data: {
          incidentId,
        },
      })

      publishRealtimeEvent({
        type: "security.incident.updated",
        userId: args.ownerUserId,
        payload: {
          incidentId,
          source: "motion-supervision",
          entityKey: entity.entityKey,
          decision: "block",
          sampleId: updated.id,
        },
      })
    }
  }

  recordRealtimeMotionAnomaly({
    ownerUserId: args.ownerUserId,
    sampleId: updated.id,
    decision: score.decision,
    reasons: score.reasons,
    entity,
    incidentId,
  })

  if (config.mode === "observation") {
    await prisma.$transaction(async (tx) => {
      const ensured = await tx.motionBaseline.upsert({
        where: {
          ownerUserId_entityKey: {
            ownerUserId: args.ownerUserId,
            entityKey: entity.entityKey,
          },
        },
        create: {
          ownerUserId: args.ownerUserId,
          entityType: entity.entityType,
          entityKey: entity.entityKey,
          shipDeploymentId: entity.shipDeploymentId,
          subagentId: entity.subagentId,
          stationKey: asBridgeCrewRole(entity.stationKey),
        },
        update: {
          shipDeploymentId: entity.shipDeploymentId,
          subagentId: entity.subagentId,
          stationKey: asBridgeCrewRole(entity.stationKey),
        },
      })

      const updateData = buildBaselineObservationUpdate({
        baseline: ensured,
        entity,
        promptChars: args.runtimePrompt.length,
        outputChars: args.outputText.length,
        durationMs: args.durationMs,
        inputEmbedding,
        outputEmbedding,
        toolBindingSlugs: args.precheck.toolBindingSlugs,
        skillPolicySlugs: args.precheck.skillPolicySlugs,
        shipGrantedToolSlugs: args.precheck.shipGrantedToolSlugs,
        commandUsageKeys: [],
      })

      await tx.motionBaseline.update({
        where: {
          id: ensured.id,
        },
        data: updateData,
      })
    })
  }

  return {
    enabled: true,
    decision: score.decision,
    reasons: score.reasons,
    incidentId,
    outputEmbedding,
  }
}

export interface MotionCommandExecutionPrecheckResult {
  enabled: boolean
  config: MotionSupervisionConfig | null
  entity: MotionEntityResolution
  baseline: MotionBaseline | null
  baselineSnapshot: MotionBaselineSnapshot | null
  sample: MotionSample | null
  decision: MotionDecision
  reasons: MotionReason[]
  baselineReady: boolean
  incidentId: string | null
  toolBindingSlugs: string[]
  skillPolicySlugs: string[]
  commandUsageKeys: string[]
}

export async function motionPrecheckCommandExecution(args: {
  ownerUserId: string
  commandExecutionId: string
  sessionId: string | null
  subagentId: string | null
  command: { id: string; name: string; path: string | null; candidates: string[] }
}): Promise<MotionCommandExecutionPrecheckResult> {
  const config = await getOrCreateMotionConfig(args.ownerUserId)
  const entity = resolveMotionEntity({
    ownerUserId: args.ownerUserId,
    metadata: null,
    subagentIdOverride: args.subagentId,
  })

  if (config.mode === "off") {
    return {
      enabled: false,
      config,
      entity,
      baseline: null,
      baselineSnapshot: null,
      sample: null,
      decision: "allow",
      reasons: [],
      baselineReady: false,
      incidentId: null,
      toolBindingSlugs: [],
      skillPolicySlugs: [],
      commandUsageKeys: [],
    }
  }

  const [baseline, bindings] = await Promise.all([
    prisma.motionBaseline.findUnique({
      where: {
        ownerUserId_entityKey: {
          ownerUserId: args.ownerUserId,
          entityKey: entity.entityKey,
        },
      },
    }),
    resolveSubagentBindings(args.ownerUserId, entity.subagentId),
  ])

  const baselineSnapshot = baselineSnapshotFromRecord(baseline)
  const commandUsageKeys = dedupeStrings([`cmd:${args.command.id}`])

  const score = scoreMotionSample({
    strictness: config.strictness,
    baselineMinSamples: config.baselineMinSamples,
    baseline: baselineSnapshot,
    inputEmbedding: undefined,
    outputEmbedding: undefined,
    toolBindingSlugs: bindings.toolBindingSlugs,
    skillPolicySlugs: bindings.skillPolicySlugs,
    shipGrantedToolSlugs: undefined,
    commandUsageKeys,
  })

  const sample = await prisma.motionSample.create({
    data: {
      ownerUserId: args.ownerUserId,
      baselineId: baseline?.id ?? null,
      entityType: entity.entityType,
      entityKey: entity.entityKey,
      eventType: "command_execution",
      decision: score.decision,
      reasons: toJsonValue(score.reasons),
      baselineReady: score.baselineReady,
      subagentId: entity.subagentId,
      stationKey: asBridgeCrewRole(entity.stationKey),
      sessionId: args.sessionId,
      commandExecutionId: args.commandExecutionId,
      commandId: args.command.id,
      commandName: args.command.name,
      commandPath: args.command.path,
      commandCandidates: toJsonValue(args.command.candidates),
      toolBindingSlugs: toJsonValue(bindings.toolBindingSlugs),
      skillPolicySlugs: toJsonValue(bindings.skillPolicySlugs),
    },
  })

  let incidentId: string | null = null
  if (config.mode === "production" && score.decision === "block") {
    const incident = await upsertMotionIncident({
      ownerUserId: args.ownerUserId,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      decision: "block",
      reasons: score.reasons,
      subagentId: entity.subagentId,
      stationKey: entity.stationKey,
      sessionId: args.sessionId,
      motionSampleId: sample.id,
    })

    incidentId = incident?.incidentId ?? null
    if (incidentId) {
      await prisma.motionSample.update({
        where: { id: sample.id },
        data: {
          incidentId,
        },
      })

      publishRealtimeEvent({
        type: "security.incident.updated",
        userId: args.ownerUserId,
        payload: {
          incidentId,
          source: "motion-supervision",
          entityKey: entity.entityKey,
          decision: "block",
          sampleId: sample.id,
        },
      })
    }
  }

  recordRealtimeMotionAnomaly({
    ownerUserId: args.ownerUserId,
    sampleId: sample.id,
    decision: score.decision,
    reasons: score.reasons,
    entity,
    incidentId,
  })

  return {
    enabled: true,
    config,
    entity,
    baseline,
    baselineSnapshot,
    sample,
    decision: score.decision,
    reasons: score.reasons,
    baselineReady: score.baselineReady,
    incidentId,
    toolBindingSlugs: bindings.toolBindingSlugs,
    skillPolicySlugs: bindings.skillPolicySlugs,
    commandUsageKeys,
  }
}

export async function motionFinalizeCommandExecution(args: {
  ownerUserId: string
  sampleId: string
  commandExecutionId: string
  sessionId: string | null
  subagentId: string | null
  output: string | null
  durationMs: number | null
  precheck: MotionCommandExecutionPrecheckResult
}): Promise<{ enabled: boolean; decision: MotionDecision; reasons: MotionReason[]; incidentId: string | null }> {
  if (!args.precheck.enabled || !args.precheck.config) {
    return { enabled: false, decision: "allow", reasons: [], incidentId: null }
  }

  const config = args.precheck.config
  const entity = args.precheck.entity
  const baselineSnapshot = args.precheck.baselineSnapshot

  const outputChars = args.output ? args.output.length : 0

  const score = scoreMotionSample({
    strictness: config.strictness,
    baselineMinSamples: config.baselineMinSamples,
    baseline: baselineSnapshot,
    outputChars,
    durationMs: args.durationMs,
    inputEmbedding: undefined,
    outputEmbedding: undefined,
    toolBindingSlugs: args.precheck.toolBindingSlugs,
    skillPolicySlugs: args.precheck.skillPolicySlugs,
    commandUsageKeys: args.precheck.commandUsageKeys,
  })

  const updated = await prisma.motionSample.update({
    where: { id: args.sampleId },
    data: {
      outputChars,
      durationMs: args.durationMs,
      decision: score.decision,
      reasons: toJsonValue(score.reasons),
    },
  })

  let incidentId = updated.incidentId || null
  if (config.mode === "production" && score.decision === "block" && !incidentId) {
    const incident = await upsertMotionIncident({
      ownerUserId: args.ownerUserId,
      entityKey: entity.entityKey,
      entityType: entity.entityType,
      decision: "block",
      reasons: score.reasons,
      subagentId: entity.subagentId,
      stationKey: entity.stationKey,
      sessionId: args.sessionId,
      motionSampleId: updated.id,
    })

    incidentId = incident?.incidentId ?? null
    if (incidentId) {
      await prisma.motionSample.update({
        where: { id: updated.id },
        data: { incidentId },
      })

      publishRealtimeEvent({
        type: "security.incident.updated",
        userId: args.ownerUserId,
        payload: {
          incidentId,
          source: "motion-supervision",
          entityKey: entity.entityKey,
          decision: "block",
          sampleId: updated.id,
        },
      })
    }
  }

  recordRealtimeMotionAnomaly({
    ownerUserId: args.ownerUserId,
    sampleId: updated.id,
    decision: score.decision,
    reasons: score.reasons,
    entity,
    incidentId,
  })

  if (config.mode === "observation") {
    await prisma.$transaction(async (tx) => {
      const ensured = await tx.motionBaseline.upsert({
        where: {
          ownerUserId_entityKey: {
            ownerUserId: args.ownerUserId,
            entityKey: entity.entityKey,
          },
        },
        create: {
          ownerUserId: args.ownerUserId,
          entityType: entity.entityType,
          entityKey: entity.entityKey,
          subagentId: entity.subagentId,
          stationKey: asBridgeCrewRole(entity.stationKey),
        },
        update: {
          subagentId: entity.subagentId,
          stationKey: asBridgeCrewRole(entity.stationKey),
        },
      })

      const updateData = buildBaselineObservationUpdate({
        baseline: ensured,
        entity,
        promptChars: null,
        outputChars,
        durationMs: args.durationMs,
        inputEmbedding: null,
        outputEmbedding: null,
        toolBindingSlugs: args.precheck.toolBindingSlugs,
        skillPolicySlugs: args.precheck.skillPolicySlugs,
        shipGrantedToolSlugs: [],
        commandUsageKeys: args.precheck.commandUsageKeys,
      })

      await tx.motionBaseline.update({
        where: {
          id: ensured.id,
        },
        data: updateData,
      })
    })
  }

  return { enabled: true, decision: score.decision, reasons: score.reasons, incidentId }
}
