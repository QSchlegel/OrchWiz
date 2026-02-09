import test from "node:test"
import assert from "node:assert/strict"
import {
  buildBridgeRuntimePrompt,
  resolveSessionRuntimePrompt,
  selectBridgeCameoKeys,
} from "./bridge-prompt"

test("resolveSessionRuntimePrompt falls back to raw prompt outside bridge channel", () => {
  const result = resolveSessionRuntimePrompt({
    userPrompt: "status report",
    metadata: {},
  })

  assert.equal(result.interactionContent, "status report")
  assert.equal(result.runtimePrompt, "status report")
  assert.equal(result.bridgeResponseMetadata, undefined)
})

test("buildBridgeRuntimePrompt includes primary framing and operator message", () => {
  const result = buildBridgeRuntimePrompt({
    userPrompt: "Prioritize deployment stability checks",
    station: {
      stationKey: "xo",
      callsign: "XO-CB01",
      role: "Executive Officer",
    },
    cameoCandidates: [
      { stationKey: "ops", callsign: "OPS-ARX", role: "Operations" },
      { stationKey: "eng", callsign: "ENG-GEO", role: "Engineering" },
    ],
  })

  assert.equal(result.primaryAgent, "XO-CB01")
  assert.deepEqual(result.cameoKeys, ["ops", "eng"])
  assert.match(result.runtimePrompt, /Primary speaker: \[XO-CB01\]/)
  assert.match(result.runtimePrompt, /Operator message:\nPrioritize deployment stability checks/)
})

test("selectBridgeCameoKeys uses deterministic max-2 selection with keyword priority", () => {
  const cameoKeys = selectBridgeCameoKeys(
    "ops",
    "Security incident and policy drift found during rollout",
    { maxCameos: 2 },
  )

  assert.deepEqual(cameoKeys, ["sec", "eng"])
})

test("resolveSessionRuntimePrompt keeps raw interaction content while enriching runtime prompt", () => {
  const result = resolveSessionRuntimePrompt({
    userPrompt: "Run incident triage now",
    metadata: {
      bridge: {
        channel: "bridge-agent",
        stationKey: "eng",
        callsign: "ENG-GEO",
        role: "Engineering",
        cameoCandidates: [
          { stationKey: "ops", callsign: "OPS-ARX", role: "Operations" },
          { stationKey: "med", callsign: "MED-BEV", role: "Medical" },
        ],
      },
    },
  })

  assert.equal(result.interactionContent, "Run incident triage now")
  assert.notEqual(result.runtimePrompt, "Run incident triage now")
  assert.equal(result.bridgeResponseMetadata?.bridgeStationKey, "eng")
  assert.equal(result.bridgeResponseMetadata?.bridgePrimaryAgent, "ENG-GEO")
  assert.ok(Array.isArray(result.bridgeResponseMetadata?.bridgeCameos))
  assert.ok((result.bridgeResponseMetadata?.bridgeCameos?.length || 0) <= 2)
})
