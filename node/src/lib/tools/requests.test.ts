import assert from "node:assert/strict"
import test from "node:test"
import {
  createShipToolAccessRequestForOwner,
  reviewShipToolAccessRequestForOwner,
} from "@/lib/tools/requests"

function date(value: string): Date {
  return new Date(value)
}

test("createShipToolAccessRequestForOwner creates a pending request", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  let capturedCreateData: Record<string, unknown> | null = null

  globalAny.prisma = {
    agentDeployment: {
      findFirst: async () => ({ id: "ship-1", name: "USS Test", userId: "user-1" }),
    },
    toolCatalogEntry: {
      findFirst: async () => ({ id: "tool-entry-1", ownerUserId: "user-1", isInstalled: true }),
    },
    bridgeCrew: {
      findFirst: async () => ({
        id: "crew-1",
        role: "ops",
        callsign: "OPS-ARX",
        name: "Operations",
        status: "active",
      }),
    },
    shipToolAccessRequest: {
      create: async (args: any) => {
        capturedCreateData = args.data
        return {
          id: "request-1",
          ownerUserId: "user-1",
          shipDeploymentId: "ship-1",
          catalogEntryId: "tool-entry-1",
          requesterBridgeCrewId: "crew-1",
          requestedByUserId: "user-1",
          scopePreference: "requester_only",
          status: "pending",
          rationale: "Need diagnostics",
          metadata: null,
          approvedGrantId: null,
          reviewedByUserId: null,
          reviewedAt: null,
          createdAt: date("2026-02-11T10:00:00.000Z"),
          updatedAt: date("2026-02-11T10:00:00.000Z"),
          catalogEntry: {
            id: "tool-entry-1",
            slug: "camoufox",
            name: "Camoufox",
            description: "tool",
            source: "curated",
            sourceKey: "curated|daijro/camoufox|.|main|camoufox",
            repo: "daijro/camoufox",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: "https://github.com/daijro/camoufox",
            isInstalled: true,
            isSystem: false,
            installedPath: "/tmp/tools/camoufox",
            metadata: null,
            ownerUserId: "user-1",
            lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
            createdAt: date("2026-02-11T09:00:00.000Z"),
            updatedAt: date("2026-02-11T09:00:00.000Z"),
          },
          requesterBridgeCrew: {
            id: "crew-1",
            role: "ops",
            callsign: "OPS-ARX",
            name: "Operations",
          },
        }
      },
    },
  }

  try {
    const created = await createShipToolAccessRequestForOwner({
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      catalogEntryId: "tool-entry-1",
      requesterBridgeCrewId: "crew-1",
      rationale: "Need diagnostics",
      requestedByUserId: "user-1",
    })

    assert.ok(capturedCreateData)
    const createData = capturedCreateData as Record<string, unknown>
    assert.equal(createData.status, "pending")
    assert.equal(createData.scopePreference, "requester_only")
    assert.equal(createData.metadata, undefined)
    assert.equal(created.status, "pending")
    assert.equal(created.catalogEntry.slug, "camoufox")
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("reviewShipToolAccessRequestForOwner denies pending requests", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  let capturedUpdateData: Record<string, unknown> | null = null

  globalAny.prisma = {
    agentDeployment: {
      findFirst: async () => ({ id: "ship-1", name: "USS Test", userId: "user-1" }),
    },
    shipToolAccessRequest: {
      findFirst: async () => ({
        id: "request-1",
        ownerUserId: "user-1",
        shipDeploymentId: "ship-1",
        catalogEntryId: "tool-entry-1",
        requesterBridgeCrewId: null,
        requestedByUserId: "user-1",
        scopePreference: "requester_only",
        status: "pending",
        rationale: "Need diagnostics",
        metadata: null,
        approvedGrantId: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: date("2026-02-11T10:00:00.000Z"),
        updatedAt: date("2026-02-11T10:00:00.000Z"),
        catalogEntry: {
          id: "tool-entry-1",
          slug: "camoufox",
          name: "Camoufox",
          description: null,
          source: "curated",
          sourceKey: "curated|repo|.|main|camoufox",
          repo: "daijro/camoufox",
          sourcePath: ".",
          sourceRef: "main",
          sourceUrl: null,
          isInstalled: true,
          isSystem: false,
          installedPath: "/tmp/tools/camoufox",
          metadata: null,
          ownerUserId: "user-1",
          lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
          createdAt: date("2026-02-11T09:00:00.000Z"),
          updatedAt: date("2026-02-11T09:00:00.000Z"),
        },
        requesterBridgeCrew: null,
      }),
      update: async (args: any) => {
        capturedUpdateData = args.data
        return {
          id: "request-1",
          ownerUserId: "user-1",
          shipDeploymentId: "ship-1",
          catalogEntryId: "tool-entry-1",
          requesterBridgeCrewId: null,
          requestedByUserId: "user-1",
          scopePreference: "requester_only",
          status: "denied",
          rationale: "Need diagnostics",
          metadata: { reviewNote: "No" },
          approvedGrantId: null,
          reviewedByUserId: "user-1",
          reviewedAt: date("2026-02-11T10:05:00.000Z"),
          createdAt: date("2026-02-11T10:00:00.000Z"),
          updatedAt: date("2026-02-11T10:05:00.000Z"),
          catalogEntry: {
            id: "tool-entry-1",
            slug: "camoufox",
            name: "Camoufox",
            description: null,
            source: "curated",
            sourceKey: "curated|repo|.|main|camoufox",
            repo: "daijro/camoufox",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: null,
            isInstalled: true,
            isSystem: false,
            installedPath: "/tmp/tools/camoufox",
            metadata: null,
            ownerUserId: "user-1",
            lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
            createdAt: date("2026-02-11T09:00:00.000Z"),
            updatedAt: date("2026-02-11T09:00:00.000Z"),
          },
          requesterBridgeCrew: null,
        }
      },
    },
  }

  try {
    const result = await reviewShipToolAccessRequestForOwner({
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      requestId: "request-1",
      decision: "deny",
      reviewedByUserId: "user-1",
      reviewNote: "No",
    })

    assert.ok(capturedUpdateData)
    const updateData = capturedUpdateData as Record<string, unknown>
    assert.equal(updateData.status, "denied")
    assert.equal(result.request.status, "denied")
    assert.equal(result.grant, null)
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("reviewShipToolAccessRequestForOwner requester_only uses transaction grant delegate", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  let txGrantUpsertCalled = false
  let capturedGrantUpdateScopeKey = ""

  globalAny.prisma = {
    agentDeployment: {
      findFirst: async () => ({ id: "ship-1", name: "USS Test", userId: "user-1" }),
    },
    bridgeCrew: {
      findFirst: async () => ({
        id: "crew-1",
        role: "ops",
        callsign: "OPS-ARX",
        name: "Operations",
        status: "active",
      }),
    },
    shipToolGrant: {
      upsert: async () => {
        throw new Error("global shipToolGrant delegate should not be used inside transaction")
      },
    },
    shipToolAccessRequest: {
      findFirst: async () => ({
        id: "request-1",
        ownerUserId: "user-1",
        shipDeploymentId: "ship-1",
        catalogEntryId: "tool-entry-1",
        requesterBridgeCrewId: "crew-1",
        requestedByUserId: "user-1",
        scopePreference: "requester_only",
        status: "pending",
        rationale: "Need diagnostics",
        metadata: null,
        approvedGrantId: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: date("2026-02-11T10:00:00.000Z"),
        updatedAt: date("2026-02-11T10:00:00.000Z"),
        catalogEntry: {
          id: "tool-entry-1",
          slug: "camoufox",
          name: "Camoufox",
          description: null,
          source: "curated",
          sourceKey: "curated|repo|.|main|camoufox",
          repo: "daijro/camoufox",
          sourcePath: ".",
          sourceRef: "main",
          sourceUrl: null,
          isInstalled: true,
          isSystem: false,
          installedPath: "/tmp/tools/camoufox",
          metadata: null,
          ownerUserId: "user-1",
          lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
          createdAt: date("2026-02-11T09:00:00.000Z"),
          updatedAt: date("2026-02-11T09:00:00.000Z"),
        },
        requesterBridgeCrew: {
          id: "crew-1",
          role: "ops",
          callsign: "OPS-ARX",
          name: "Operations",
        },
      }),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      shipToolGrant: {
        upsert: async (args: any) => {
          txGrantUpsertCalled = true
          capturedGrantUpdateScopeKey = args.update.scopeKey
          return {
            id: "grant-1",
            ownerUserId: "user-1",
            shipDeploymentId: "ship-1",
            catalogEntryId: "tool-entry-1",
            scope: "bridge_crew",
            scopeKey: "bridge_crew:crew-1",
            bridgeCrewId: "crew-1",
            grantedByUserId: "user-1",
            createdAt: date("2026-02-11T10:06:00.000Z"),
            updatedAt: date("2026-02-11T10:06:00.000Z"),
            catalogEntry: {
              id: "tool-entry-1",
              slug: "camoufox",
              name: "Camoufox",
              description: null,
              source: "curated",
              sourceKey: "curated|repo|.|main|camoufox",
              repo: "daijro/camoufox",
              sourcePath: ".",
              sourceRef: "main",
              sourceUrl: null,
              isInstalled: true,
              isSystem: false,
              installedPath: "/tmp/tools/camoufox",
              metadata: null,
              ownerUserId: "user-1",
              lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
              createdAt: date("2026-02-11T09:00:00.000Z"),
              updatedAt: date("2026-02-11T09:00:00.000Z"),
            },
            bridgeCrew: {
              id: "crew-1",
              role: "ops",
              callsign: "OPS-ARX",
              name: "Operations",
            },
          }
        },
      },
      shipToolAccessRequest: {
        update: async () => ({
          id: "request-1",
          ownerUserId: "user-1",
          shipDeploymentId: "ship-1",
          catalogEntryId: "tool-entry-1",
          requesterBridgeCrewId: "crew-1",
          requestedByUserId: "user-1",
          scopePreference: "requester_only",
          status: "approved",
          rationale: "Need diagnostics",
          metadata: { grantMode: "requester_only" },
          approvedGrantId: "grant-1",
          reviewedByUserId: "user-1",
          reviewedAt: date("2026-02-11T10:06:00.000Z"),
          createdAt: date("2026-02-11T10:00:00.000Z"),
          updatedAt: date("2026-02-11T10:06:00.000Z"),
          catalogEntry: {
            id: "tool-entry-1",
            slug: "camoufox",
            name: "Camoufox",
            description: null,
            source: "curated",
            sourceKey: "curated|repo|.|main|camoufox",
            repo: "daijro/camoufox",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: null,
            isInstalled: true,
            isSystem: false,
            installedPath: "/tmp/tools/camoufox",
            metadata: null,
            ownerUserId: "user-1",
            lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
            createdAt: date("2026-02-11T09:00:00.000Z"),
            updatedAt: date("2026-02-11T09:00:00.000Z"),
          },
          requesterBridgeCrew: {
            id: "crew-1",
            role: "ops",
            callsign: "OPS-ARX",
            name: "Operations",
          },
        }),
      },
    }),
  }

  try {
    const result = await reviewShipToolAccessRequestForOwner({
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      requestId: "request-1",
      decision: "approve",
      grantMode: "requester_only",
      reviewedByUserId: "user-1",
    })

    assert.equal(txGrantUpsertCalled, true)
    assert.equal(capturedGrantUpdateScopeKey, "bridge_crew:crew-1")
    assert.equal(result.request.status, "approved")
    assert.equal(result.grant?.scope, "bridge_crew")
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("reviewShipToolAccessRequestForOwner ship-wide grants use ship scope", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  let capturedGrantScope = ""

  globalAny.prisma = {
    agentDeployment: {
      findFirst: async () => ({ id: "ship-1", name: "USS Test", userId: "user-1" }),
    },
    bridgeCrew: {
      findFirst: async () => {
        throw new Error("bridgeCrew lookup should not be used for ship-wide approvals")
      },
    },
    shipToolAccessRequest: {
      findFirst: async () => ({
        id: "request-ship",
        ownerUserId: "user-1",
        shipDeploymentId: "ship-1",
        catalogEntryId: "tool-entry-2",
        requesterBridgeCrewId: null,
        requestedByUserId: "user-1",
        scopePreference: "ship",
        status: "pending",
        rationale: null,
        metadata: null,
        approvedGrantId: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: date("2026-02-11T10:00:00.000Z"),
        updatedAt: date("2026-02-11T10:00:00.000Z"),
        catalogEntry: {
          id: "tool-entry-2",
          slug: "camoufox",
          name: "Camoufox",
          description: null,
          source: "curated",
          sourceKey: "curated|repo|.|main|camoufox",
          repo: "daijro/camoufox",
          sourcePath: ".",
          sourceRef: "main",
          sourceUrl: null,
          isInstalled: true,
          isSystem: false,
          installedPath: "/tmp/tools/camoufox",
          metadata: null,
          ownerUserId: "user-1",
          lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
          createdAt: date("2026-02-11T09:00:00.000Z"),
          updatedAt: date("2026-02-11T09:00:00.000Z"),
        },
        requesterBridgeCrew: null,
      }),
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => callback({
      shipToolGrant: {
        upsert: async (args: any) => {
          capturedGrantScope = args.create.scope
          return {
            id: "grant-ship",
            ownerUserId: "user-1",
            shipDeploymentId: "ship-1",
            catalogEntryId: "tool-entry-2",
            scope: "ship",
            scopeKey: "ship",
            bridgeCrewId: null,
            grantedByUserId: "user-1",
            createdAt: date("2026-02-11T10:07:00.000Z"),
            updatedAt: date("2026-02-11T10:07:00.000Z"),
            catalogEntry: {
              id: "tool-entry-2",
              slug: "camoufox",
              name: "Camoufox",
              description: null,
              source: "curated",
              sourceKey: "curated|repo|.|main|camoufox",
              repo: "daijro/camoufox",
              sourcePath: ".",
              sourceRef: "main",
              sourceUrl: null,
              isInstalled: true,
              isSystem: false,
              installedPath: "/tmp/tools/camoufox",
              metadata: null,
              ownerUserId: "user-1",
              lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
              createdAt: date("2026-02-11T09:00:00.000Z"),
              updatedAt: date("2026-02-11T09:00:00.000Z"),
            },
            bridgeCrew: null,
          }
        },
      },
      shipToolAccessRequest: {
        update: async () => ({
          id: "request-ship",
          ownerUserId: "user-1",
          shipDeploymentId: "ship-1",
          catalogEntryId: "tool-entry-2",
          requesterBridgeCrewId: null,
          requestedByUserId: "user-1",
          scopePreference: "ship",
          status: "approved",
          rationale: null,
          metadata: { grantMode: "ship" },
          approvedGrantId: "grant-ship",
          reviewedByUserId: "user-1",
          reviewedAt: date("2026-02-11T10:07:00.000Z"),
          createdAt: date("2026-02-11T10:00:00.000Z"),
          updatedAt: date("2026-02-11T10:07:00.000Z"),
          catalogEntry: {
            id: "tool-entry-2",
            slug: "camoufox",
            name: "Camoufox",
            description: null,
            source: "curated",
            sourceKey: "curated|repo|.|main|camoufox",
            repo: "daijro/camoufox",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: null,
            isInstalled: true,
            isSystem: false,
            installedPath: "/tmp/tools/camoufox",
            metadata: null,
            ownerUserId: "user-1",
            lastSyncedAt: date("2026-02-11T09:00:00.000Z"),
            createdAt: date("2026-02-11T09:00:00.000Z"),
            updatedAt: date("2026-02-11T09:00:00.000Z"),
          },
          requesterBridgeCrew: null,
        }),
      },
    }),
  }

  try {
    const result = await reviewShipToolAccessRequestForOwner({
      ownerUserId: "user-1",
      shipDeploymentId: "ship-1",
      requestId: "request-ship",
      decision: "approve",
      grantMode: "ship",
      reviewedByUserId: "user-1",
    })

    assert.equal(capturedGrantScope, "ship")
    assert.equal(result.grant?.scope, "ship")
  } finally {
    globalAny.prisma = previousPrisma
  }
})
