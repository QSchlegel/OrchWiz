import test from "node:test"
import assert from "node:assert/strict"
import {
  BRIDGE_DISPATCH_DEFAULT_RUNTIME,
  BridgeDispatchRuntimeValidationError,
  parseBridgeDispatchRuntimeStrict,
  resolveBridgeDispatchRuntime,
} from "./dispatch-runtime"

test("resolveBridgeDispatchRuntime defaults to openclaw when runtime is missing", () => {
  assert.equal(resolveBridgeDispatchRuntime(undefined), BRIDGE_DISPATCH_DEFAULT_RUNTIME)
  assert.equal(resolveBridgeDispatchRuntime(""), BRIDGE_DISPATCH_DEFAULT_RUNTIME)
})

test("parseBridgeDispatchRuntimeStrict accepts explicit openclaw runtime", () => {
  assert.equal(parseBridgeDispatchRuntimeStrict("openclaw"), "openclaw")
  assert.equal(parseBridgeDispatchRuntimeStrict(" OPENCLAW "), "openclaw")
})

test("parseBridgeDispatchRuntimeStrict rejects unknown explicit runtime", () => {
  assert.throws(
    () => parseBridgeDispatchRuntimeStrict("nano-claw"),
    (error) => {
      assert.ok(error instanceof BridgeDispatchRuntimeValidationError)
      assert.deepEqual(error.supportedRuntimeIds, ["openclaw"])
      return true
    },
  )
})
