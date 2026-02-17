import test from "node:test"
import assert from "node:assert/strict"
import { executeSessionPrompt, SessionPromptError } from "@/lib/runtime/session-prompt"
import { motionPrecheckCommandExecution } from "@/lib/supervision/motion"

function withEnv(name: string, value: string | undefined) {
  const previous = process.env[name]
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
  return () => {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

test("executeSessionPrompt blocks in production when motion supervision is out-of-range", async () => {
  const restoreIncidents = withEnv("ENABLE_SECURITY_INCIDENTS", "false")
  const restoreEncryptEnabled = withEnv("TRACE_ENCRYPT_ENABLED", "false")
  const restoreEncryptRequired = withEnv("TRACE_ENCRYPT_REQUIRED", "false")

  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  const now = new Date()

  globalAny.prisma = {
    session: {
      findFirst: async () => ({
        id: "sess-1",
        userId: "user-1",
        status: "planning",
      }),
    },
    sessionInteraction: {
      create: async (args: any) => ({
        id: args.data.type === "user_input" ? "int-user" : "int-error",
        sessionId: args.data.sessionId,
        type: args.data.type,
        content: args.data.content,
        metadata: args.data.metadata ?? null,
        timestamp: now,
      }),
    },
    motionSupervisionConfig: {
      upsert: async () => ({
        id: "cfg-1",
        ownerUserId: "user-1",
        mode: "production",
        strictness: "strict",
        failMode: "fail_open_alert",
        baselineMinSamples: 10,
        embeddingModel: "text-embedding-3-small",
        createdAt: now,
        updatedAt: now,
      }),
    },
    motionBaseline: {
      findUnique: async () => ({
        id: "baseline-1",
        ownerUserId: "user-1",
        entityType: "user",
        entityKey: "user:user-1",
        shipDeploymentId: null,
        subagentId: null,
        stationKey: null,
        sampleCount: 10,
        promptCharsMean: 100,
        promptCharsM2: 900,
        promptCharsCount: 10,
        outputCharsMean: null,
        outputCharsM2: null,
        outputCharsCount: 0,
        durationMsMean: null,
        durationMsM2: null,
        durationMsCount: 0,
        inputCentroid: null,
        inputSimMean: null,
        inputSimM2: null,
        inputSimCount: 0,
        outputCentroid: null,
        outputSimMean: null,
        outputSimM2: null,
        outputSimCount: 0,
        toolBindingSlugCounts: null,
        skillPolicySlugCounts: null,
        shipGrantedToolSlugCounts: null,
        commandUsageCounts: null,
        createdAt: now,
        updatedAt: now,
      }),
    },
    motionSample: {
      create: async () => ({
        id: "sample-1",
        incidentId: null,
      }),
      update: async () => ({
        id: "sample-1",
        incidentId: null,
      }),
    },
    subagent: {
      findFirst: async () => null,
    },
  }

  try {
    await assert.rejects(
      async () =>
        executeSessionPrompt({
          userId: "user-1",
          sessionId: "sess-1",
          prompt: "x".repeat(220),
          metadata: {},
        }),
      (error: unknown) => {
        assert.ok(error instanceof SessionPromptError)
        assert.equal(error.status, 403)
        assert.equal((error.details as any)?.code, "MOTION_OUT_OF_RANGE")
        return true
      },
    )
  } finally {
    globalAny.prisma = previousPrisma
    restoreIncidents()
    restoreEncryptEnabled()
    restoreEncryptRequired()
  }
})

test("motionPrecheckCommandExecution blocks unseen command usage in production when baseline is ready", async () => {
  const restoreIncidents = withEnv("ENABLE_SECURITY_INCIDENTS", "false")

  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  const now = new Date()

  globalAny.prisma = {
    motionSupervisionConfig: {
      upsert: async () => ({
        id: "cfg-1",
        ownerUserId: "user-1",
        mode: "production",
        strictness: "strict",
        failMode: "fail_open_alert",
        baselineMinSamples: 10,
        embeddingModel: "text-embedding-3-small",
        createdAt: now,
        updatedAt: now,
      }),
    },
    motionBaseline: {
      findUnique: async () => ({
        id: "baseline-1",
        ownerUserId: "user-1",
        entityType: "subagent",
        entityKey: "subagent:sub-1",
        shipDeploymentId: null,
        subagentId: "sub-1",
        stationKey: null,
        sampleCount: 10,
        promptCharsMean: null,
        promptCharsM2: null,
        promptCharsCount: 0,
        outputCharsMean: null,
        outputCharsM2: null,
        outputCharsCount: 0,
        durationMsMean: null,
        durationMsM2: null,
        durationMsCount: 0,
        inputCentroid: null,
        inputSimMean: null,
        inputSimM2: null,
        inputSimCount: 0,
        outputCentroid: null,
        outputSimMean: null,
        outputSimM2: null,
        outputSimCount: 0,
        toolBindingSlugCounts: {},
        skillPolicySlugCounts: {},
        shipGrantedToolSlugCounts: {},
        commandUsageCounts: {
          "cmd:known": 3,
        },
        createdAt: now,
        updatedAt: now,
      }),
    },
    motionSample: {
      create: async () => ({
        id: "sample-1",
        incidentId: null,
      }),
      update: async () => ({
        id: "sample-1",
        incidentId: null,
      }),
    },
    subagent: {
      findFirst: async () => null,
    },
  }

  try {
    const result = await motionPrecheckCommandExecution({
      ownerUserId: "user-1",
      commandExecutionId: "exec-1",
      sessionId: null,
      subagentId: "sub-1",
      command: {
        id: "unknown",
        name: "danger",
        path: null,
        candidates: ["danger"],
      },
    })

    assert.equal(result.enabled, true)
    assert.equal(result.config?.mode, "production")
    assert.equal(result.decision, "block")
    assert.ok(result.reasons.some((r) => r.code === "commandUsage_unseen"))
  } finally {
    globalAny.prisma = previousPrisma
    restoreIncidents()
  }
})

