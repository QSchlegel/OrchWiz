import assert from "node:assert/strict"
import test from "node:test"
import { resolveOpenAiFallbackModel } from "./openai-fallback"
import {
  resolveCodexRuntimeModel,
  resolveQuartermasterCodexExecutionConfig,
} from "./codex-cli"

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

test("resolveOpenAiFallbackModel prefers runtime intelligence selected model", () => {
  const restoreFallbackModel = withEnv("OPENAI_RUNTIME_FALLBACK_MODEL", "gpt-4.1-mini")
  try {
    const model = resolveOpenAiFallbackModel({
      sessionId: "session-1",
      prompt: "hello",
      metadata: {
        runtime: {
          intelligence: {
            selectedModel: "gpt-5-mini",
          },
        },
      },
    })

    assert.equal(model, "gpt-5-mini")
  } finally {
    restoreFallbackModel()
  }
})

test("resolveCodexRuntimeModel prefers runtime intelligence selected model over CODEX_RUNTIME_MODEL", () => {
  const restoreCodexModel = withEnv("CODEX_RUNTIME_MODEL", "gpt-4.1")
  try {
    const model = resolveCodexRuntimeModel({
      sessionId: "session-2",
      prompt: "hello",
      metadata: {
        runtime: {
          intelligence: {
            selectedModel: "gpt-5",
          },
        },
      },
    })

    assert.equal(model, "gpt-5")
  } finally {
    restoreCodexModel()
  }
})

test("resolveCodexRuntimeModel falls back to CODEX_RUNTIME_MODEL when intelligence model is missing", () => {
  const restoreCodexModel = withEnv("CODEX_RUNTIME_MODEL", "gpt-4.1")
  try {
    const model = resolveCodexRuntimeModel({
      sessionId: "session-3",
      prompt: "hello",
      metadata: {},
    })
    assert.equal(model, "gpt-4.1")
  } finally {
    restoreCodexModel()
  }
})

test("resolveQuartermasterCodexExecutionConfig defaults to read-only when metadata is missing", () => {
  const config = resolveQuartermasterCodexExecutionConfig({
    sessionId: "session-4",
    prompt: "hello",
    metadata: {},
  })

  assert.equal(config.executionLevel, "read_only")
  assert.equal(config.sandbox, "read-only")
  assert.equal(config.fullAuto, false)
})
