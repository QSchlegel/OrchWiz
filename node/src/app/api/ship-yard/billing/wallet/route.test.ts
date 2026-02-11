import assert from "node:assert/strict"
import test from "node:test"
import { AccessControlError, type AccessActor } from "@/lib/security/access-control"
import { handleGetWallet } from "./route"

const actor: AccessActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
}

test("wallet route returns wallet and billing policy", async () => {
  const response = await handleGetWallet({
    requireActor: async () => actor,
    getWallet: async () => ({
      id: "wallet-1",
      userId: actor.userId,
      balanceCents: 1234,
      currency: "eur",
    }),
  })

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.deepEqual(payload.wallet, {
    id: "wallet-1",
    userId: actor.userId,
    balanceCents: 1234,
    currency: "eur",
  })

  const policy = payload.policy as Record<string, unknown>
  assert.equal(policy.minTopupCents, 500)
  assert.equal(policy.quoteHours, 720)
  assert.equal(policy.convenienceFeePercent, 10)
})

test("wallet route propagates access control errors", async () => {
  const response = await handleGetWallet({
    requireActor: async () => {
      throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
    },
    getWallet: async () => {
      throw new Error("unreachable")
    },
  })

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})
