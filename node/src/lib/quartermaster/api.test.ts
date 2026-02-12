import assert from "node:assert/strict"
import test from "node:test"
import type { SessionInteraction } from "@prisma/client"
import type { ShipQuartermasterState } from "@/lib/quartermaster/service"
import {
  executeShipQuartermasterPrompt,
  loadShipQuartermasterStateWithInteractions,
  QuartermasterApiResponseError,
  type QuartermasterApiDeps,
} from "./api"
import { RagBackendUnavailableError } from "@/lib/memory/rag-backend"

function makeInteraction(
  id: string,
  type: SessionInteraction["type"],
  content: string,
): SessionInteraction {
  return {
    id,
    sessionId: "session-1",
    type,
    content,
    metadata: null,
    timestamp: new Date("2026-02-12T00:00:00.000Z"),
  }
}

function makeState(): ShipQuartermasterState {
  return {
    ship: {
      id: "ship-1",
      name: "USS Test",
      status: "active",
      nodeId: "node-1",
      nodeType: "local",
      deploymentProfile: "local_starship_build",
      healthStatus: "healthy",
      lastHealthCheck: "2026-02-12T00:00:00.000Z",
      updatedAt: "2026-02-12T00:00:00.000Z",
    },
    quartermaster: {
      enabled: true,
      roleKey: "qtm",
      callsign: "QTM-LGR",
      authority: "scoped_operator",
      runtimeProfile: "quartermaster",
      diagnosticsScope: "read_only",
      channel: "ship-quartermaster",
      policySlug: "quartermaster-readonly",
      subagentId: "subagent-1",
      sessionId: "session-1",
      provisionedAt: "2026-02-12T00:00:00.000Z",
    },
    subagent: {
      id: "subagent-1",
      name: "QTM-LGR:ship-1",
      description: null,
    },
    session: {
      id: "session-1",
      title: "QTM",
      status: "planning",
      createdAt: "2026-02-12T00:00:00.000Z",
      updatedAt: "2026-02-12T00:00:00.000Z",
    },
  }
}

function createDeps(overrides: Partial<QuartermasterApiDeps> = {}): QuartermasterApiDeps {
  const state = makeState()

  return {
    getShipQuartermasterState: async () => state,
    ensureShipQuartermaster: async () => state,
    listSessionInteractions: async () => [
      makeInteraction("i-user", "user_input", "hello"),
      makeInteraction("i-ai", "ai_response", "world"),
    ],
    countBridgeCrew: async () => 6,
    dataCoreEnabled: () => false,
    resolveRagBackend: () => ({
      requestedBackend: "auto",
      effectiveBackend: "vault-local",
    }),
    getMergedMemoryRetriever: () => ({
      query: async () => ({
        mode: "hybrid",
        fallbackUsed: false,
        results: [],
      }),
    }),
    queryVaultRag: async () => ({
      mode: "hybrid",
      fallbackUsed: false,
      results: [],
    }),
    recordRagPerformanceSample: async () => {},
    executeSessionPrompt: async () => ({
      interaction: makeInteraction("i-user", "user_input", "hello"),
      responseInteraction: makeInteraction("i-ai", "ai_response", "world"),
      provider: "codex-cli",
      fallbackUsed: false,
      signature: null,
    }),
    publishNotificationUpdated: () => {},
    ...overrides,
  }
}

test("loadShipQuartermasterStateWithInteractions returns 404 error when ship is missing", async () => {
  await assert.rejects(
    () =>
      loadShipQuartermasterStateWithInteractions(
        {
          userId: "user-1",
          shipDeploymentId: "missing-ship",
        },
        createDeps({
          getShipQuartermasterState: async () => null,
        }),
      ),
    (error) => {
      assert.ok(error instanceof QuartermasterApiResponseError)
      assert.equal(error.status, 404)
      assert.equal(error.payload.error, "Ship not found")
      assert.equal(error.payload.code, "SHIP_NOT_FOUND")
      return true
    },
  )
})

test("loadShipQuartermasterStateWithInteractions auto-provisions when quartermaster is missing", async () => {
  const missingState: ShipQuartermasterState = {
    ...makeState(),
    quartermaster: {
      ...makeState().quartermaster,
      enabled: false,
      subagentId: null,
      sessionId: null,
      provisionedAt: null,
    },
    subagent: null,
    session: null,
  }

  let ensureCalled = false
  const result = await loadShipQuartermasterStateWithInteractions(
    {
      userId: "user-1",
      shipDeploymentId: "ship-1",
    },
    createDeps({
      getShipQuartermasterState: async () => missingState,
      ensureShipQuartermaster: async () => {
        ensureCalled = true
        return makeState()
      },
    }),
  )

  assert.equal(ensureCalled, true)
  assert.equal(result.subagent?.id, "subagent-1")
  assert.equal(result.session?.id, "session-1")
  assert.equal(result.interactions.length, 2)
})

test("executeShipQuartermasterPrompt surfaces backend unavailable response contract", async () => {
  let recordedStatus: string | null = null

  await assert.rejects(
    () =>
      executeShipQuartermasterPrompt(
        {
          userId: "user-1",
          shipDeploymentId: "ship-1",
          prompt: "status report",
          requestedBackend: "data-core-merged",
          autoProvisionIfMissing: false,
        },
        createDeps({
          resolveRagBackend: () => {
            throw new RagBackendUnavailableError("data-core-merged")
          },
          recordRagPerformanceSample: async (sample) => {
            recordedStatus = sample.status
          },
        }),
      ),
    (error) => {
      assert.ok(error instanceof QuartermasterApiResponseError)
      assert.equal(error.status, 409)
      assert.equal(error.payload.code, "RAG_BACKEND_UNAVAILABLE")
      assert.equal(error.payload.requestedBackend, "data-core-merged")
      assert.equal(error.payload.effectiveBackend, "data-core-merged")
      assert.equal((error.payload.performance as { status: string }).status, "backend_unavailable")
      return true
    },
  )

  assert.equal(recordedStatus, "backend_unavailable")
})

test("executeShipQuartermasterPrompt fail-opens retrieval errors and still executes runtime prompt", async () => {
  let executed = false
  let runtimeMetadata: Record<string, unknown> | undefined

  const result = await executeShipQuartermasterPrompt(
    {
      userId: "user-1",
      shipDeploymentId: "ship-1",
      prompt: "run quick launch readiness",
      requestedBackend: "auto",
      autoProvisionIfMissing: false,
    },
    createDeps({
      queryVaultRag: async () => {
        throw new Error("retrieval down")
      },
      executeSessionPrompt: async (args) => {
        executed = true
        runtimeMetadata = args.metadata
        return {
          interaction: makeInteraction("i-user", "user_input", "run quick launch readiness"),
          responseInteraction: makeInteraction("i-ai", "ai_response", "ready"),
          provider: "codex-cli",
          fallbackUsed: false,
          signature: null,
        }
      },
    }),
  )

  assert.equal(executed, true)
  assert.equal(result.provider, "codex-cli")
  assert.equal(result.knowledge.mode, "lexical")
  assert.equal(result.knowledge.fallbackUsed, true)
  assert.equal(result.knowledge.performance.status, "error")

  const quartermasterMetadata = (runtimeMetadata?.quartermaster || {}) as Record<string, unknown>
  const knowledgeMetadata = (quartermasterMetadata.knowledge || {}) as Record<string, unknown>
  assert.equal((knowledgeMetadata.mode as string), "lexical")
  assert.equal((knowledgeMetadata.fallbackUsed as boolean), true)
})
