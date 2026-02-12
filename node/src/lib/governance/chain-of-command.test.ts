import assert from "node:assert/strict"
import test from "node:test"
import {
  assertCanManageSubagentGrant,
  assertOwnerOrXo,
  GovernanceAccessError,
  resolveGovernanceActorContext,
  type GovernanceActorContext,
} from "@/lib/governance/chain-of-command"

test("resolveGovernanceActorContext returns owner-direct context without acting bridge crew", async () => {
  const context = await resolveGovernanceActorContext({
    ownerUserId: "user-1",
    shipDeploymentId: "ship-1",
  })

  assert.equal(context.ownerUserId, "user-1")
  assert.equal(context.shipDeploymentId, "ship-1")
  assert.equal(context.actingBridgeCrewId, null)
  assert.equal(context.actingBridgeCrewRole, null)
})

test("resolveGovernanceActorContext resolves active acting bridge crew", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  globalAny.prisma = {
    bridgeCrew: {
      findFirst: async () => ({
        id: "crew-1",
        role: "xo",
        callsign: "XO-CB01",
        deploymentId: "ship-1",
      }),
    },
  }

  try {
    const context = await resolveGovernanceActorContext({
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      actingBridgeCrewId: "crew-1",
    })

    assert.equal(context.actingBridgeCrewId, "crew-1")
    assert.equal(context.actingBridgeCrewRole, "xo")
    assert.equal(context.actingBridgeCrewCallsign, "XO-CB01")
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("assertOwnerOrXo denies non-XO acting bridge crew", () => {
  const context: GovernanceActorContext = {
    ownerUserId: "user-1",
    shipDeploymentId: "ship-1",
    actingBridgeCrewId: "crew-ops",
    actingBridgeCrewRole: "ops",
    actingBridgeCrewCallsign: "OPS-ARX",
  }

  assert.throws(
    () =>
      assertOwnerOrXo({
        context,
        action: "Ship approval",
      }),
    GovernanceAccessError,
  )
})

test("assertCanManageSubagentGrant allows owner and xo contexts", async () => {
  await assertCanManageSubagentGrant({
    context: {
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      actingBridgeCrewId: null,
      actingBridgeCrewRole: null,
      actingBridgeCrewCallsign: null,
    },
    subagentId: "sub-1",
    shipDeploymentId: "ship-1",
  })

  await assertCanManageSubagentGrant({
    context: {
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      actingBridgeCrewId: "crew-xo",
      actingBridgeCrewRole: "xo",
      actingBridgeCrewCallsign: "XO-CB01",
    },
    subagentId: "sub-1",
    shipDeploymentId: "ship-1",
  })
})

test("assertCanManageSubagentGrant allows assigned non-XO bridge crew", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  globalAny.prisma = {
    bridgeCrewSubagentAssignment: {
      findFirst: async () => ({ id: "assignment-1" }),
    },
  }

  try {
    await assertCanManageSubagentGrant({
      context: {
        ownerUserId: "user-1",
        shipDeploymentId: "ship-1",
        actingBridgeCrewId: "crew-ops",
        actingBridgeCrewRole: "ops",
        actingBridgeCrewCallsign: "OPS-ARX",
      },
      subagentId: "sub-1",
      shipDeploymentId: "ship-1",
    })
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("assertCanManageSubagentGrant rejects unassigned non-XO bridge crew", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  globalAny.prisma = {
    bridgeCrewSubagentAssignment: {
      findFirst: async () => null,
    },
  }

  try {
    await assert.rejects(
      () =>
        assertCanManageSubagentGrant({
          context: {
            ownerUserId: "user-1",
            shipDeploymentId: "ship-1",
            actingBridgeCrewId: "crew-ops",
            actingBridgeCrewRole: "ops",
            actingBridgeCrewCallsign: "OPS-ARX",
          },
          subagentId: "sub-1",
          shipDeploymentId: "ship-1",
        }),
      (error: unknown) =>
        error instanceof GovernanceAccessError
        && error.code === "SUBAGENT_ASSIGNMENT_REQUIRED",
    )
  } finally {
    globalAny.prisma = previousPrisma
  }
})
