import assert from "node:assert/strict"
import test from "node:test"
import {
  ShipyardCloudVaultError,
  storeCloudCredentialEnvelope,
  summarizeCloudSecretEnvelope,
} from "@/lib/shipyard/cloud/vault"

test("cloud vault fails closed when wallet enclave is disabled", async () => {
  const original = process.env.WALLET_ENCLAVE_ENABLED
  process.env.WALLET_ENCLAVE_ENABLED = "false"

  try {
    await assert.rejects(
      () =>
        storeCloudCredentialEnvelope({
          userId: "user-1",
          provider: "hetzner",
          token: "token",
        }),
      (error: unknown) => {
        assert.ok(error instanceof ShipyardCloudVaultError)
        assert.equal((error as ShipyardCloudVaultError).code, "WALLET_ENCLAVE_DISABLED")
        return true
      },
    )
  } finally {
    if (original === undefined) {
      delete process.env.WALLET_ENCLAVE_ENABLED
    } else {
      process.env.WALLET_ENCLAVE_ENABLED = original
    }
  }
})

test("summarizeCloudSecretEnvelope reports unknown for malformed envelopes", () => {
  assert.deepEqual(summarizeCloudSecretEnvelope({ storageMode: "plaintext-fallback" }), {
    storageMode: "unknown",
    hasSecret: false,
  })
})
