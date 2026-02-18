import assert from "node:assert/strict"
import test from "node:test"
import {
  mintSecureEnclaveControlToken,
  resolveSecureEnclaveControlTokenSecret,
  verifySecureEnclaveControlToken,
} from "./secure-enclave-control-token"

async function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("mintSecureEnclaveControlToken mints verifiable HS256 token", async () => {
  const now = new Date("2026-02-17T12:00:00.000Z")
  const minted = mintSecureEnclaveControlToken({
    subject: "user-1",
    secret: "test-secret",
    ttlSeconds: 120,
    issuer: "orchwiz",
    audience: "secure-enclave-control",
    scope: ["secure-enclave.control", "openclaw.action.eject"],
    source: "agentsync",
    stationKey: "xo",
    shipDeploymentId: "ship-1",
    action: "eject",
    now,
  })

  const verified = verifySecureEnclaveControlToken(minted.token, {
    secret: "test-secret",
    issuer: "orchwiz",
    audience: "secure-enclave-control",
    now: new Date("2026-02-17T12:01:00.000Z"),
  })

  assert.equal(verified.ok, true)
  if (!verified.ok) {
    return
  }

  assert.equal(verified.payload.sub, "user-1")
  assert.equal(verified.payload.stationKey, "xo")
  assert.equal(verified.payload.shipDeploymentId, "ship-1")
  assert.equal(verified.payload.action, "eject")
  assert.deepEqual(verified.payload.scope, ["secure-enclave.control", "openclaw.action.eject"])
})

test("verifySecureEnclaveControlToken rejects invalid signature", async () => {
  const minted = mintSecureEnclaveControlToken({
    subject: "user-1",
    secret: "first-secret",
  })

  const verified = verifySecureEnclaveControlToken(minted.token, {
    secret: "different-secret",
  })

  assert.equal(verified.ok, false)
  if (verified.ok) {
    return
  }
  assert.equal(verified.error, "Invalid token signature.")
})

test("resolveSecureEnclaveControlTokenSecret prefers explicit control token secret", async () => {
  await withEnv(
    {
      SECURE_ENCLAVE_CONTROL_TOKEN_SECRET: "explicit-secret",
      WALLET_ENCLAVE_SHARED_SECRET: "shared-secret",
    },
    async () => {
      assert.equal(resolveSecureEnclaveControlTokenSecret(), "explicit-secret")
    },
  )
})

test("resolveSecureEnclaveControlTokenSecret falls back to wallet enclave shared secret", async () => {
  await withEnv(
    {
      SECURE_ENCLAVE_CONTROL_TOKEN_SECRET: undefined,
      WALLET_ENCLAVE_SHARED_SECRET: "shared-secret",
    },
    async () => {
      assert.equal(resolveSecureEnclaveControlTokenSecret(), "shared-secret")
    },
  )
})
