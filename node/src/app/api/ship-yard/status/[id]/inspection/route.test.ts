import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import {
  handleGetShipyardStatusInspection,
  type ShipyardInspectionBridgeConnectionRecord,
  type ShipyardInspectionBridgeCrewRecord,
  type ShipyardInspectionBridgeDeliveryRecord,
  type ShipyardInspectionDeploymentRecord,
  type ShipyardStatusInspectionRouteDeps,
} from "./route"

const actor: ShipyardRequestActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
  authType: "session",
}

function requestFor(url: string): NextRequest {
  const request = new Request(url, { method: "GET" })
  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(url),
    json: request.json.bind(request),
  } as unknown as NextRequest
}

function deployment(overrides: Partial<ShipyardInspectionDeploymentRecord> = {}): ShipyardInspectionDeploymentRecord {
  return {
    id: "ship-1",
    name: "USS Inspect",
    status: "failed",
    nodeId: "node-1",
    nodeType: "local",
    deploymentProfile: "local_starship_build",
    provisioningMode: "terraform_ansible",
    healthStatus: "unhealthy",
    deployedAt: null,
    lastHealthCheck: new Date("2026-02-12T13:00:00.000Z"),
    shipVersion: "v2",
    shipVersionUpdatedAt: new Date("2026-02-12T12:45:00.000Z"),
    updatedAt: new Date("2026-02-12T13:01:00.000Z"),
    metadata: {
      deploymentError: "Local provisioning failed",
      deploymentErrorCode: "LOCAL_PROVISIONING_FAILED",
      deploymentErrorDetails: {
        suggestedCommands: [
          "kind create cluster --name orchwiz",
          "kubectl config use-context kind-orchwiz",
        ],
      },
      provisionOutputTail: `prefix-${"x".repeat(1700)}`,
      localProvisioning: {
        namespace: "orchwiz-starship",
      },
      openClawContextInjection: {
        attempted: true,
      },
      shipUpgrade: {
        status: "failed",
      },
      superSecret: "super-secret",
    },
    ...overrides,
  }
}

function bridgeCrewRecords(): ShipyardInspectionBridgeCrewRecord[] {
  return [
    {
      id: "crew-ops",
      role: "ops",
      callsign: "OPS-ARX",
      name: "Operations",
      status: "active",
    },
    {
      id: "crew-xo",
      role: "xo",
      callsign: "XO-CB01",
      name: "Executive",
      status: "active",
    },
  ]
}

function bridgeConnectionsRecords(): ShipyardInspectionBridgeConnectionRecord[] {
  return [
    {
      id: "conn-1",
      provider: "telegram",
      enabled: true,
      autoRelay: true,
    },
    {
      id: "conn-2",
      provider: "discord",
      enabled: true,
      autoRelay: false,
    },
    {
      id: "conn-3",
      provider: "whatsapp",
      enabled: false,
      autoRelay: false,
    },
  ]
}

function bridgeDeliveriesRecords(): ShipyardInspectionBridgeDeliveryRecord[] {
  return [
    {
      id: "delivery-1",
      connectionId: "conn-1",
      source: "manual",
      status: "failed",
      message: "  Dispatch failed   due to timeout   ",
      attempts: 2,
      lastError: "timeout",
      deliveredAt: null,
      createdAt: new Date("2026-02-12T13:02:00.000Z"),
      connection: {
        id: "conn-1",
        name: "Telegram Ops",
        provider: "telegram",
        destination: "-1001234",
      },
    },
    {
      id: "delivery-2",
      connectionId: "conn-2",
      source: "test",
      status: "completed",
      message: "Bridge connection test",
      attempts: 1,
      lastError: null,
      deliveredAt: new Date("2026-02-12T13:00:00.000Z"),
      createdAt: new Date("2026-02-12T13:03:00.000Z"),
      connection: {
        id: "conn-2",
        name: "Discord Relay",
        provider: "discord",
        destination: "#bridge",
      },
    },
  ]
}

function createDeps(
  overrides: Partial<ShipyardStatusInspectionRouteDeps> = {},
): ShipyardStatusInspectionRouteDeps {
  return {
    requireActor: async () => actor,
    findShip: async () => deployment(),
    listBridgeCrew: async () => bridgeCrewRecords(),
    listBridgeConnections: async () =>
      [
        ...bridgeConnectionsRecords(),
        {
          id: "conn-secret",
          provider: "telegram",
          enabled: false,
          autoRelay: false,
          credentials: "credential-secret",
        } as unknown as ShipyardInspectionBridgeConnectionRecord,
      ],
    listBridgeDeliveries: async () => bridgeDeliveriesRecords(),
    inspectRuntime: async () => ({
      checkedAt: "2026-02-12T13:05:00.000Z",
      docker: {
        available: true,
        currentContext: "desktop-linux",
        contexts: [],
      },
      kubernetes: {
        available: true,
        currentContext: "kind-orchwiz",
        contexts: ["kind-orchwiz"],
      },
      kind: {
        available: true,
        clusters: [],
      },
    }),
    now: () => new Date("2026-02-12T13:06:00.000Z"),
    ...overrides,
  }
}

test("ship-yard status inspection returns unauthorized when actor resolution fails", async () => {
  const response = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-1/inspection"),
    { shipDeploymentId: "ship-1" },
    createDeps({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("ship-yard status inspection returns 404 when ship is not found", async () => {
  const response = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-404/inspection"),
    { shipDeploymentId: "ship-404" },
    createDeps({
      findShip: async () => null,
    }),
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Ship not found")
})

test("ship-yard status inspection returns curated payload without runtime by default", async () => {
  let runtimeCalls = 0
  const response = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-1/inspection"),
    { shipDeploymentId: "ship-1" },
    createDeps({
      inspectRuntime: async () => {
        runtimeCalls += 1
        return {
          checkedAt: "2026-02-12T13:05:00.000Z",
          docker: { available: true, currentContext: "desktop-linux", contexts: [] },
          kubernetes: { available: true, currentContext: "kind-orchwiz", contexts: ["kind-orchwiz"] },
          kind: { available: true, clusters: [] },
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(runtimeCalls, 0)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.checkedAt, "2026-02-12T13:06:00.000Z")

  const deploymentPayload = payload.deployment as Record<string, unknown>
  assert.equal(deploymentPayload.id, "ship-1")
  assert.equal(deploymentPayload.metadata, undefined)

  const failurePayload = payload.failure as Record<string, unknown>
  assert.equal(failurePayload.code, "LOCAL_PROVISIONING_FAILED")
  assert.equal(failurePayload.message, "Local provisioning failed")
  assert.deepEqual(failurePayload.suggestedCommands, [
    "kind create cluster --name orchwiz",
    "kubectl config use-context kind-orchwiz",
  ])

  const logsPayload = payload.logs as Record<string, unknown>
  const tails = logsPayload.tails as Array<{ key: string; value: string }>
  assert.equal(Array.isArray(tails), true)
  assert.equal(tails[0]?.key, "provisionOutputTail")
  assert.equal(tails[0]?.value.length, 1500)
  assert.equal(logsPayload.saneBootstrap, null)
  assert.deepEqual(logsPayload.localProvisioning, { namespace: "orchwiz-starship" })

  const bridgeReadout = payload.bridgeReadout as Record<string, unknown>
  const summary = bridgeReadout.summary as Record<string, unknown>
  assert.equal(summary.total, 4)
  assert.equal(summary.enabled, 2)
  assert.equal(summary.autoRelay, 1)

  const deliveries = bridgeReadout.deliveries as Array<Record<string, unknown>>
  assert.equal(deliveries.length, 2)
  assert.equal(deliveries[0]?.messagePreview, "Dispatch failed due to timeout")

  const responseString = JSON.stringify(payload)
  assert.equal(responseString.includes("super-secret"), false)
  assert.equal(responseString.includes("credential-secret"), false)
  assert.equal(Object.hasOwn(payload, "runtime"), false)
})

test("ship-yard status inspection includes runtime when includeRuntime=true", async () => {
  let runtimeCalls = 0

  const response = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-1/inspection?includeRuntime=true"),
    { shipDeploymentId: "ship-1" },
    createDeps({
      inspectRuntime: async () => {
        runtimeCalls += 1
        return {
          checkedAt: "2026-02-12T13:05:00.000Z",
          docker: { available: true, currentContext: "desktop-linux", contexts: [] },
          kubernetes: { available: true, currentContext: "kind-orchwiz", contexts: ["kind-orchwiz"] },
          kind: { available: true, clusters: [] },
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(runtimeCalls, 1)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(Object.hasOwn(payload, "runtime"), true)
})

test("ship-yard status inspection parses and clamps deliveriesTake", async () => {
  const capturedTakes: number[] = []

  const deps = createDeps({
    listBridgeDeliveries: async ({ take }) => {
      capturedTakes.push(take)
      return []
    },
  })

  const high = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-1/inspection?deliveriesTake=999"),
    { shipDeploymentId: "ship-1" },
    deps,
  )
  assert.equal(high.status, 200)

  const low = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-1/inspection?deliveriesTake=-4"),
    { shipDeploymentId: "ship-1" },
    deps,
  )
  assert.equal(low.status, 200)

  const invalid = await handleGetShipyardStatusInspection(
    requestFor("http://localhost/api/ship-yard/status/ship-1/inspection?deliveriesTake=abc"),
    { shipDeploymentId: "ship-1" },
    deps,
  )
  assert.equal(invalid.status, 200)

  assert.deepEqual(capturedTakes, [50, 1, 10])
})
