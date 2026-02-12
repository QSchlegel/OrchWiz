import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBridgeInspectionSummary,
  buildDeliveryMessagePreview,
  extractInspectionFailureFromMetadata,
  extractInspectionLogTailsFromMetadata,
} from "./inspection"

test("extractInspectionFailureFromMetadata extracts structured failure and suggested commands", () => {
  const failure = extractInspectionFailureFromMetadata({
    deploymentStatus: "failed",
    metadata: {
      deploymentError: "Launch failed",
      deploymentErrorCode: "LOCAL_PROVISIONING_FAILED",
      deploymentErrorDetails: {
        missingContext: "kind-orchwiz",
        suggestedCommands: [
          "kind create cluster --name orchwiz",
          "kubectl config use-context kind-orchwiz",
          "kind create cluster --name orchwiz",
          "",
        ],
      },
    },
  })

  assert.equal(failure.isTerminalFailure, true)
  assert.equal(failure.message, "Launch failed")
  assert.equal(failure.code, "LOCAL_PROVISIONING_FAILED")
  assert.deepEqual(failure.suggestedCommands, [
    "kind create cluster --name orchwiz",
    "kubectl config use-context kind-orchwiz",
  ])
  assert.equal((failure.details || {}).missingContext, "kind-orchwiz")
})

test("extractInspectionLogTailsFromMetadata keeps known order and truncates tails", () => {
  const longTail = `${"x".repeat(300)}${"y".repeat(1500)}`
  const tails = extractInspectionLogTailsFromMetadata({
    contextCheckOutputTail: "context output",
    provisionOutputTail: longTail,
    sudoCheckOutputTail: "sudo output",
  })

  assert.deepEqual(
    tails.map((entry) => entry.key),
    ["provisionOutputTail", "contextCheckOutputTail", "sudoCheckOutputTail"],
  )
  assert.equal(tails[0]?.value.length, 1500)
  assert.equal(tails[0]?.value, "y".repeat(1500))
})

test("buildBridgeInspectionSummary returns provider counters and last delivery marker", () => {
  const summary = buildBridgeInspectionSummary({
    connections: [
      { provider: "telegram", enabled: true, autoRelay: true },
      { provider: "telegram", enabled: false, autoRelay: true },
      { provider: "discord", enabled: true, autoRelay: false },
      { provider: "whatsapp", enabled: false, autoRelay: false },
      { provider: "custom", enabled: true, autoRelay: true },
    ],
    deliveries: [
      { createdAt: "2026-02-12T11:00:00.000Z", status: "failed" },
      { createdAt: "2026-02-12T12:00:00.000Z", status: "completed" },
    ],
  })

  assert.equal(summary.total, 5)
  assert.equal(summary.enabled, 3)
  assert.equal(summary.autoRelay, 2)
  assert.equal(summary.lastDeliveryStatus, "completed")
  assert.equal(summary.lastDeliveryAt, "2026-02-12T12:00:00.000Z")
  assert.deepEqual(summary.providers, {
    telegram: { total: 2, enabled: 1 },
    discord: { total: 1, enabled: 1 },
    whatsapp: { total: 1, enabled: 0 },
  })
})

test("buildDeliveryMessagePreview compacts whitespace and truncates long text", () => {
  const preview = buildDeliveryMessagePreview(" bridge   ready   for   dispatch ")
  assert.equal(preview, "bridge ready for dispatch")

  const truncated = buildDeliveryMessagePreview(`start ${"a".repeat(260)}`)
  assert.equal(truncated.endsWith("..."), true)
  assert.equal(truncated.length, 220)
})
