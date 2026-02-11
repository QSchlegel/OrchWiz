import assert from "node:assert/strict"
import test from "node:test"
import type { RuntimeIntelligenceConfig } from "./config"
import {
  getRuntimeClassifierPromptTemplate,
  LOCAL_CLASSIFIER_PROMPT,
  renderRuntimeClassifierPrompt,
  resetRuntimeClassifierPromptManagerForTests,
  setRuntimeClassifierLangfuseClientForTests,
} from "./prompt-manager"

function buildConfig(overrides?: Partial<RuntimeIntelligenceConfig>): RuntimeIntelligenceConfig {
  return {
    enabled: true,
    requireControllableProviders: true,
    maxModel: "gpt-5",
    simpleModel: "gpt-5-mini",
    classifierModel: "gpt-5-nano",
    classifierTimeoutMs: 6000,
    langfusePromptName: "runtime-intelligence-autonomous-classifier",
    langfusePromptLabel: "production",
    langfusePromptVersion: null,
    langfusePromptCacheTtlSeconds: 60,
    usdToEur: 0.92,
    modelPricingUsdPer1M: {
      "gpt-5": { input: 1.25, output: 10 },
      "gpt-5-mini": { input: 0.25, output: 2 },
      "gpt-5-nano": { input: 0.05, output: 0.4 },
    },
    thresholdDefault: 0.62,
    thresholdMin: 0.35,
    thresholdMax: 0.95,
    learningRate: 0.08,
    explorationRate: 0.05,
    targetReward: 0.55,
    nightlyCronToken: null,
    ...overrides,
  }
}

test("getRuntimeClassifierPromptTemplate fetches Langfuse prompt by label and version", async () => {
  resetRuntimeClassifierPromptManagerForTests()
  let capturedName: string | null = null
  let capturedOptions: Record<string, unknown> | null = null

  const fakeClient = {
    prompt: {
      get: async (name: string, options: Record<string, unknown>) => {
        capturedName = name
        capturedOptions = options
        return {
          prompt: "Classify: {{task}}",
          isFallback: false,
          labels: ["production"],
          version: 7,
        }
      },
    },
  }

  setRuntimeClassifierLangfuseClientForTests(fakeClient as never)

  const template = await getRuntimeClassifierPromptTemplate(buildConfig({
    langfusePromptVersion: 7,
  }))

  assert.equal(capturedName, "runtime-intelligence-autonomous-classifier")
  assert.equal(capturedOptions?.label, "production")
  assert.equal(capturedOptions?.version, 7)
  assert.equal(template.template, "Classify: {{task}}")
  assert.equal(template.source, "langfuse")
  assert.equal(template.label, "production")
  assert.equal(template.version, 7)
})

test("getRuntimeClassifierPromptTemplate fails open to local fallback", async () => {
  resetRuntimeClassifierPromptManagerForTests()

  const fakeClient = {
    prompt: {
      get: async () => {
        throw new Error("langfuse unavailable")
      },
    },
  }

  setRuntimeClassifierLangfuseClientForTests(fakeClient as never)

  const template = await getRuntimeClassifierPromptTemplate(buildConfig())
  assert.equal(template.template, LOCAL_CLASSIFIER_PROMPT)
  assert.equal(template.source, "local")
  assert.equal(template.label, null)
  assert.equal(template.version, null)
})

test("renderRuntimeClassifierPrompt substitutes task and execution context variables", () => {
  const prompt = renderRuntimeClassifierPrompt({
    template: "Task={{task}}\\nContext={{execution_context}}",
    task: "Analyze hull pressure.",
    executionContext: "profile=default",
  })

  assert.equal(prompt, "Task=Analyze hull pressure.\\nContext=profile=default")
})
