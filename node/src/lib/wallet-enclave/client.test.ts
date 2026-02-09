import test from "node:test"
import assert from "node:assert/strict"
import { signMessagePayload, WalletEnclaveError } from "./client"

test("signMessagePayload fails fast when wallet enclave disabled", async () => {
  const previous = process.env.WALLET_ENCLAVE_ENABLED
  process.env.WALLET_ENCLAVE_ENABLED = "false"

  try {
    await assert.rejects(
      () =>
        signMessagePayload({
          keyRef: "xo",
          payload: "payload",
        }),
      (error: unknown) => {
        assert.ok(error instanceof WalletEnclaveError)
        assert.equal((error as WalletEnclaveError).code, "WALLET_ENCLAVE_DISABLED")
        return true
      },
    )
  } finally {
    if (previous === undefined) {
      delete process.env.WALLET_ENCLAVE_ENABLED
    } else {
      process.env.WALLET_ENCLAVE_ENABLED = previous
    }
  }
})
