import assert from "node:assert/strict"
import test from "node:test"
import { mintSseJwt, verifySseJwt } from "./sse-jwt"

test("mintSseJwt + verifySseJwt roundtrip with optional claims", () => {
  const token = mintSseJwt({
    userId: "user-1",
    secret: "test-secret",
    ttlSeconds: 60,
    issuer: "orchwiz",
    audience: "orchwiz-sse",
    types: ["task.updated", "task.updated", "verification.updated"],
    admin: true,
    now: new Date("2026-02-17T00:00:00.000Z"),
    jti: "jti-1",
  })

  const verified = verifySseJwt(token, {
    secret: "test-secret",
    issuer: "orchwiz",
    audience: "orchwiz-sse",
    now: new Date("2026-02-17T00:00:30.000Z"),
    strictTypes: true,
    allowedTypes: new Set(["task.updated", "verification.updated"]),
  })

  assert.equal(verified.ok, true)
  if (!verified.ok) {
    return
  }

  assert.equal(verified.payload.sub, "user-1")
  assert.equal(verified.payload.scope, "realtime:read")
  assert.equal(verified.payload.adm, true)
  assert.deepEqual(verified.payload.types, ["task.updated", "verification.updated"])
})

test("verifySseJwt rejects invalid signature and invalid scope", () => {
  const token = mintSseJwt({
    userId: "user-1",
    secret: "good-secret",
    ttlSeconds: 60,
    now: new Date("2026-02-17T00:00:00.000Z"),
  })

  const wrongSecret = verifySseJwt(token, {
    secret: "bad-secret",
    now: new Date("2026-02-17T00:00:05.000Z"),
  })
  assert.equal(wrongSecret.ok, false)

  const parts = token.split(".")
  const payload = JSON.parse(Buffer.from(parts[1] || "", "base64url").toString("utf8")) as Record<string, unknown>
  payload.scope = "other"
  const modifiedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  const tamperedToken = `${parts[0]}.${modifiedPayload}.${parts[2]}`

  const invalidScope = verifySseJwt(tamperedToken, {
    secret: "good-secret",
    now: new Date("2026-02-17T00:00:05.000Z"),
  })
  assert.equal(invalidScope.ok, false)
})

test("verifySseJwt strict type validation rejects unknown types", () => {
  const token = mintSseJwt({
    userId: "user-1",
    secret: "test-secret",
    ttlSeconds: 60,
    types: ["task.updated", "unknown.type"],
    now: new Date("2026-02-17T00:00:00.000Z"),
  })

  const verified = verifySseJwt(token, {
    secret: "test-secret",
    now: new Date("2026-02-17T00:00:05.000Z"),
    strictTypes: true,
    allowedTypes: new Set(["task.updated"]),
  })

  assert.equal(verified.ok, false)
})
