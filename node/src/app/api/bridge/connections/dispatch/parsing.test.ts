import test from "node:test"
import assert from "node:assert/strict"
import { BridgeDispatchRuntimeValidationError } from "@/lib/bridge/connections/dispatch-runtime"
import { parseBridgeDispatchRequestBody } from "./parsing"

test("parseBridgeDispatchRequestBody supports legacy payload without runtime or bridgeContext", () => {
  const parsed = parseBridgeDispatchRequestBody({
    deploymentId: "ship-1",
    message: "  bridge update  ",
  })

  assert.equal(parsed.deploymentId, "ship-1")
  assert.equal(parsed.message, "bridge update")
  assert.equal(parsed.runtime, "openclaw")
  assert.equal(parsed.bridgeContext, undefined)
})

test("parseBridgeDispatchRequestBody parses explicit runtime and bridge context", () => {
  const parsed = parseBridgeDispatchRequestBody({
    deploymentId: "ship-2",
    message: "status green",
    runtime: "openclaw",
    connectionIds: ["conn-1", "conn-2"],
    bridgeContext: {
      stationKey: "eng",
      callsign: "ENG-GEO",
      bridgeCrewId: "crew-eng",
    },
  })

  assert.equal(parsed.runtime, "openclaw")
  assert.deepEqual(parsed.connectionIds, ["conn-1", "conn-2"])
  assert.deepEqual(parsed.bridgeContext, {
    stationKey: "eng",
    callsign: "ENG-GEO",
    bridgeCrewId: "crew-eng",
  })
})

test("parseBridgeDispatchRequestBody rejects unknown runtime", () => {
  assert.throws(
    () =>
      parseBridgeDispatchRequestBody({
        deploymentId: "ship-3",
        message: "hello",
        runtime: "nano-claw",
      }),
    (error) => error instanceof BridgeDispatchRuntimeValidationError,
  )
})
