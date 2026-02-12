import assert from "node:assert/strict"
import test from "node:test"
import {
  applyRuntimeIntelligencePolicy,
  resolveRuntimeExecutionKind,
} from "./policy"
import { resetRuntimeClassifierPromptManagerForTests } from "./prompt-manager"
import type { RuntimeProvider } from "@/lib/types/runtime"

function withEnv<K extends keyof NodeJS.ProcessEnv>(key: K, value: string | undefined) {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  return () => {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

test("resolveRuntimeExecutionKind defaults to human_chat", () => {
  assert.equal(resolveRuntimeExecutionKind(undefined), "human_chat")
  assert.equal(resolveRuntimeExecutionKind({}), "human_chat")
  assert.equal(resolveRuntimeExecutionKind({ runtime: { executionKind: "unknown" } }), "human_chat")
  assert.equal(resolveRuntimeExecutionKind({ runtime: { executionKind: "autonomous_task" } }), "autonomous_task")
})

test("applyRuntimeIntelligencePolicy keeps human_chat on max tier", async () => {
  const restorePolicyEnabled = withEnv("RUNTIME_INTELLIGENCE_POLICY_ENABLED", "true")
  try {
    const policy = await applyRuntimeIntelligencePolicy({
      request: {
        sessionId: "session-human",
        prompt: "Respond politely.",
        metadata: {
          runtime: {
            executionKind: "human_chat",
          },
        },
      },
      providerOrder: ["openclaw", "openai-fallback", "local-fallback"],
      profile: "default",
    })

    assert.equal(policy.state.executionKind, "human_chat")
    assert.equal(policy.state.tier, "max")
    assert.equal(policy.state.decision, "human_forced_max")
    const runtime = (policy.request.metadata?.runtime || {}) as Record<string, unknown>
    const intelligence = (runtime.intelligence || {}) as Record<string, unknown>
    assert.equal(intelligence.executionKind, "human_chat")
    assert.equal(intelligence.tier, "max")
  } finally {
    restorePolicyEnabled()
  }
})

test("applyRuntimeIntelligencePolicy uses classifier result for autonomous task and filters openclaw", async () => {
  resetRuntimeClassifierPromptManagerForTests()
  const restoreOpenAiKey = withEnv("OPENAI_API_KEY", "test-openai-key")
  const restoreThreshold = withEnv("RUNTIME_INTELLIGENCE_THRESHOLD_DEFAULT", "0.7")
  const restorePolicyEnabled = withEnv("RUNTIME_INTELLIGENCE_POLICY_ENABLED", "true")
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    return {
      ok: true,
      json: async () => ({
        output_text: "{\"requiresBump\":false,\"confidence\":0.4,\"reason\":\"simple task\"}",
      }),
    } as Response
  }) as typeof fetch

  try {
    const policy = await applyRuntimeIntelligencePolicy({
      request: {
        sessionId: "session-auto",
        prompt: "Summarize yesterday logs.",
        metadata: {
          runtime: {
            executionKind: "autonomous_task",
          },
        },
      },
      providerOrder: ["openclaw", "openai-fallback"] as RuntimeProvider[],
      profile: "default",
    })

    assert.equal(policy.state.executionKind, "autonomous_task")
    assert.equal(policy.state.tier, "simple")
    assert.equal(policy.state.decision, "classifier_keep_simple")
    assert.equal(policy.state.classifierConfidence, 0.4)
    assert.equal(policy.state.classifierRequiresBump, false)
    assert.deepEqual(policy.providerOrder, ["openai-fallback", "local-fallback"])
  } finally {
    globalThis.fetch = originalFetch
    restoreOpenAiKey()
    restoreThreshold()
    restorePolicyEnabled()
  }
})

test("applyRuntimeIntelligencePolicy fails open to max tier when classifier output is invalid", async () => {
  resetRuntimeClassifierPromptManagerForTests()
  const restoreOpenAiKey = withEnv("OPENAI_API_KEY", "test-openai-key")
  const restorePolicyEnabled = withEnv("RUNTIME_INTELLIGENCE_POLICY_ENABLED", "true")
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    return {
      ok: true,
      json: async () => ({
        output_text: "not-json",
      }),
    } as Response
  }) as typeof fetch

  try {
    const policy = await applyRuntimeIntelligencePolicy({
      request: {
        sessionId: "session-auto-invalid",
        prompt: "Do this task.",
        metadata: {
          runtime: {
            executionKind: "autonomous_task",
          },
        },
      },
      providerOrder: ["openai-fallback", "local-fallback"],
      profile: "default",
    })

    assert.equal(policy.state.tier, "max")
    assert.equal(policy.state.decision, "classifier_unavailable_forced_max")
  } finally {
    globalThis.fetch = originalFetch
    restoreOpenAiKey()
    restorePolicyEnabled()
  }
})

test("applyRuntimeIntelligencePolicy fails open to max tier when classifier request times out", async () => {
  resetRuntimeClassifierPromptManagerForTests()
  const restoreOpenAiKey = withEnv("OPENAI_API_KEY", "test-openai-key")
  const restorePolicyEnabled = withEnv("RUNTIME_INTELLIGENCE_POLICY_ENABLED", "true")
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    throw new DOMException("The operation was aborted", "AbortError")
  }) as typeof fetch

  try {
    const policy = await applyRuntimeIntelligencePolicy({
      request: {
        sessionId: "session-auto-timeout",
        prompt: "Do this task.",
        metadata: {
          runtime: {
            executionKind: "autonomous_task",
          },
        },
      },
      providerOrder: ["openai-fallback", "local-fallback"],
      profile: "default",
    })

    assert.equal(policy.state.tier, "max")
    assert.equal(policy.state.decision, "classifier_unavailable_forced_max")
  } finally {
    globalThis.fetch = originalFetch
    restoreOpenAiKey()
    restorePolicyEnabled()
  }
})
