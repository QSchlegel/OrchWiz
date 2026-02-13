import test from "node:test"
import assert from "node:assert/strict"
import type { AgentLightningConfig } from "./config"
import { AgentLightningClient, resetAgentLightningCircuitBreakerForTests } from "./client"

function testConfig(overrides: Partial<AgentLightningConfig> = {}): AgentLightningConfig {
  return {
    enabled: true,
    storeUrl: "http://127.0.0.1:4747",
    timeoutMs: 10,
    failOpenBackoffMs: 30_000,
    agentSyncEnabled: true,
    agentSyncResourceName: "agentsync_guidance_template",
    ...overrides,
  }
}

test("AgentLightningClient is fail-open when fetch throws", async () => {
  resetAgentLightningCircuitBreakerForTests()

  let fetchCalls = 0
  const fetchImpl = (async () => {
    fetchCalls += 1
    throw new TypeError("fetch failed")
  }) as typeof fetch

  const client = new AgentLightningClient(testConfig(), fetchImpl)

  const resources = await client.getLatestResources()
  assert.equal(resources, null)
  assert.equal(fetchCalls, 1)
})

test("AgentLightningClient circuit breaker skips repeated calls during backoff window", async () => {
  resetAgentLightningCircuitBreakerForTests()

  const originalNow = Date.now
  let nowMs = 1_000_000
  Date.now = () => nowMs

  try {
    let fetchCalls = 0
    const fetchImpl = (async () => {
      fetchCalls += 1
      throw new TypeError("fetch failed")
    }) as typeof fetch

    const client = new AgentLightningClient(testConfig({ failOpenBackoffMs: 30_000 }), fetchImpl)

    assert.equal(await client.health(), false)
    assert.equal(fetchCalls, 1)

    assert.equal(await client.health(), false)
    assert.equal(fetchCalls, 1)

    nowMs += 30_001
    assert.equal(await client.health(), false)
    assert.equal(fetchCalls, 2)
  } finally {
    Date.now = originalNow
  }
})

