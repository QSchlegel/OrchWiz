import assert from "node:assert/strict"
import test from "node:test"
import { resolveRuntimeExecutionPlan, isRuntimeProviderControllable } from "@/lib/runtime/registry"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test("resolveRuntimeExecutionPlan keeps legacy order when registry is disabled", async () => {
  await withEnv(
    {
      RUNTIME_ADAPTER_REGISTRY_ENABLED: "false",
    },
    async () => {
      const plan = await resolveRuntimeExecutionPlan({
        request: {
          sessionId: "session-legacy",
          prompt: "hello",
        },
        profile: "default",
        legacyProviderOrder: ["openclaw", "openai-fallback", "local-fallback"],
      })

      assert.deepEqual(plan.providerOrder, ["openclaw", "openai-fallback", "local-fallback"])
    },
  )
})

test("resolveRuntimeExecutionPlan respects profile env override when registry is enabled", async () => {
  await withEnv(
    {
      RUNTIME_ADAPTER_REGISTRY_ENABLED: "true",
      RUNTIME_PROFILE_DEFAULT: "openai-fallback",
    },
    async () => {
      const plan = await resolveRuntimeExecutionPlan({
        request: {
          sessionId: "session-env-override",
          prompt: "hello",
        },
        profile: "default",
        legacyProviderOrder: ["openclaw", "openai-fallback", "local-fallback"],
      })

      assert.deepEqual(plan.providerOrder, ["openai-fallback", "local-fallback"])
    },
  )
})

test("isRuntimeProviderControllable treats openclaw as non-controllable by default", () => {
  assert.equal(
    isRuntimeProviderControllable({
      providerId: "openclaw",
    }),
    false,
  )

  assert.equal(
    isRuntimeProviderControllable({
      providerId: "openai-fallback",
    }),
    true,
  )
})
