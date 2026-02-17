import test from "node:test"
import assert from "node:assert/strict"
import {
  BRIDGE_DISPATCH_DEFAULT_RUNTIME,
  BridgeDispatchRuntimeValidationError,
  parseBridgeDispatchRuntimeStrict,
  resolveBridgeDispatchRuntime,
} from "./dispatch-runtime"

test("resolveBridgeDispatchRuntime defaults to openclaw when runtime is missing", async () => {
  assert.equal(await resolveBridgeDispatchRuntime(undefined), BRIDGE_DISPATCH_DEFAULT_RUNTIME)
  assert.equal(await resolveBridgeDispatchRuntime(""), BRIDGE_DISPATCH_DEFAULT_RUNTIME)
})

test("parseBridgeDispatchRuntimeStrict accepts explicit openclaw runtime", async () => {
  assert.equal(await parseBridgeDispatchRuntimeStrict("openclaw"), "openclaw")
  assert.equal(await parseBridgeDispatchRuntimeStrict(" OPENCLAW "), "openclaw")
})

test("parseBridgeDispatchRuntimeStrict rejects unknown explicit runtime", async () => {
  await assert.rejects(
    async () => parseBridgeDispatchRuntimeStrict("nano-claw"),
    (error) => {
      assert.ok(error instanceof BridgeDispatchRuntimeValidationError)
      assert.deepEqual(error.supportedRuntimeIds, ["openclaw"])
      return true
    },
  )
})
