import assert from "node:assert/strict"
import test from "node:test"
import {
  createCodexDeviceAuthPendingMetadata,
  DEVICE_AUTH_MAX_WAIT_MS,
  resolveCodexDeviceAuthFlowState,
  restoreCodexDeviceAuthFlow,
} from "./codex-cli-device-auth-flow"

test("resolveCodexDeviceAuthFlowState transitions awaiting flow to connected when snapshot is connected", () => {
  const next = resolveCodexDeviceAuthFlowState({
    flowState: "awaiting_authorization",
    startedAt: 1_000,
    connectorConnected: true,
    now: 1_500,
  })

  assert.equal(next, "connected")
})

test("resolveCodexDeviceAuthFlowState transitions awaiting flow to timed_out at max wait boundary", () => {
  const startedAt = 5_000
  const next = resolveCodexDeviceAuthFlowState({
    flowState: "awaiting_authorization",
    startedAt,
    connectorConnected: false,
    now: startedAt + DEVICE_AUTH_MAX_WAIT_MS,
  })

  assert.equal(next, "timed_out")
})

test("restoreCodexDeviceAuthFlow resumes awaiting flow for valid pending metadata", () => {
  const startedAt = Date.now() - 45_000
  const restored = restoreCodexDeviceAuthFlow(
    createCodexDeviceAuthPendingMetadata(startedAt),
    startedAt + 5_000,
  )

  assert.equal(restored.flowState, "awaiting_authorization")
  assert.equal(restored.startedAt, startedAt)
})

test("restoreCodexDeviceAuthFlow returns timed_out when pending metadata is expired", () => {
  const startedAt = 10_000
  const restored = restoreCodexDeviceAuthFlow(
    createCodexDeviceAuthPendingMetadata(startedAt),
    startedAt + DEVICE_AUTH_MAX_WAIT_MS + 1,
  )

  assert.equal(restored.flowState, "timed_out")
  assert.equal(restored.startedAt, null)
})
