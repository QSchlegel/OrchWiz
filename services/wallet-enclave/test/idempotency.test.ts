import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { lookupIdempotency, storeIdempotency } from "../src/idempotency/idempotency.js"

test("idempotency store roundtrip", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-enclave-idempo-"))

  storeIdempotency(dir, {
    key: "k1",
    scope: "sign-data:agent-a",
    createdAt: new Date().toISOString(),
    response: { signature: "sig-1" },
  })

  const hit = lookupIdempotency(dir, "sign-data:agent-a", "k1")
  assert.ok(hit)
  assert.equal(hit?.response.signature, "sig-1")

  const miss = lookupIdempotency(dir, "sign-data:agent-b", "k1")
  assert.equal(miss, null)
})
