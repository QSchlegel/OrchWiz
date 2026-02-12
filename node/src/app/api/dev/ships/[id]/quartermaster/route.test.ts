import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import {
  handleGetDevShipQuartermaster,
  handlePostDevShipQuartermaster,
  type DevShipQuartermasterRouteDeps,
} from "./route"

function withEnv<K extends keyof NodeJS.ProcessEnv>(key: K, value: string | undefined) {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  return () => {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/dev/ships/ship-1/quartermaster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function actor(): ShipyardRequestActor {
  return {
    userId: "user-1",
    email: "captain@example.com",
    role: "captain",
    isAdmin: false,
    authType: "user_api_key",
    keyId: "kid-1",
  }
}

function createDeps(overrides: Partial<DevShipQuartermasterRouteDeps> = {}): DevShipQuartermasterRouteDeps {
  return {
    requireActor: async () => actor(),
    loadState: async () =>
      ({
        ship: {
          id: "ship-1",
        },
        interactions: [],
      }) as Record<string, unknown> as Awaited<ReturnType<DevShipQuartermasterRouteDeps["loadState"]>>,
    runPrompt: async () =>
      ({
        interaction: {
          id: "i-1",
          sessionId: "session-1",
          type: "user_input",
          content: "hello",
          metadata: null,
          timestamp: new Date("2026-02-12T00:00:00.000Z"),
        },
        responseInteraction: {
          id: "i-2",
          sessionId: "session-1",
          type: "ai_response",
          content: "world",
          metadata: null,
          timestamp: new Date("2026-02-12T00:00:00.000Z"),
        },
        provider: "codex-cli",
        fallbackUsed: false,
        sessionId: "session-1",
        interactions: [],
        knowledge: {
          query: "hello",
          mode: "hybrid",
          fallbackUsed: false,
          requestedBackend: "auto",
          effectiveBackend: "vault-local",
          performance: {
            durationMs: 1,
            resultCount: 0,
            fallbackUsed: false,
            status: "success",
          },
          sources: [],
        },
        requestedBackend: "auto",
        effectiveBackend: "vault-local",
        performance: {
          durationMs: 1,
          resultCount: 0,
          fallbackUsed: false,
          status: "success",
        },
        autoProvisioned: true,
      }),
    ...overrides,
  }
}

test("dev quartermaster GET returns 404 in production", async () => {
  const restoreEnv = withEnv("NODE_ENV", "production")
  let requireActorCalled = false
  try {
    const response = await handleGetDevShipQuartermaster(
      requestFor({}),
      { shipDeploymentId: "ship-1" },
      createDeps({
        requireActor: async () => {
          requireActorCalled = true
          return actor()
        },
      }),
    )

    assert.equal(response.status, 404)
    assert.equal(requireActorCalled, false)
  } finally {
    restoreEnv()
  }
})

test("dev quartermaster GET returns 401 when actor auth fails", async () => {
  const restoreEnv = withEnv("NODE_ENV", "development")
  try {
    const response = await handleGetDevShipQuartermaster(
      requestFor({}),
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
  } finally {
    restoreEnv()
  }
})

test("dev quartermaster GET scopes lookup to authenticated actor userId", async () => {
  const restoreEnv = withEnv("NODE_ENV", "development")
  let seenUserId: string | null = null
  try {
    const response = await handleGetDevShipQuartermaster(
      requestFor({}),
      { shipDeploymentId: "ship-1" },
      createDeps({
        loadState: async (args) => {
          seenUserId = args.userId
          return {
            ship: { id: "ship-1" },
            interactions: [],
          } as Record<string, unknown> as Awaited<ReturnType<DevShipQuartermasterRouteDeps["loadState"]>>
        },
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(seenUserId, "user-1")
  } finally {
    restoreEnv()
  }
})

test("dev quartermaster POST rejects missing prompt", async () => {
  const restoreEnv = withEnv("NODE_ENV", "development")
  try {
    const response = await handlePostDevShipQuartermaster(
      requestFor({}),
      { shipDeploymentId: "ship-1" },
      createDeps(),
    )

    assert.equal(response.status, 400)
  } finally {
    restoreEnv()
  }
})

test("dev quartermaster POST returns autoProvisioned=true when prompt flow provisions", async () => {
  const restoreEnv = withEnv("NODE_ENV", "development")
  try {
    const response = await handlePostDevShipQuartermaster(
      requestFor({ prompt: "hello" }),
      { shipDeploymentId: "ship-1" },
      createDeps({
        runPrompt: async () =>
          ({
            ...(await createDeps().runPrompt({
              userId: "user-1",
              shipDeploymentId: "ship-1",
              prompt: "hello",
              requestedBackend: "auto",
              autoProvisionIfMissing: true,
            })),
            autoProvisioned: true,
          }),
      }),
    )

    assert.equal(response.status, 200)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.autoProvisioned, true)
  } finally {
    restoreEnv()
  }
})

test("dev quartermaster POST returns autoProvisioned=false when already provisioned", async () => {
  const restoreEnv = withEnv("NODE_ENV", "development")
  try {
    const response = await handlePostDevShipQuartermaster(
      requestFor({ prompt: "hello" }),
      { shipDeploymentId: "ship-1" },
      createDeps({
        runPrompt: async () =>
          ({
            ...(await createDeps().runPrompt({
              userId: "user-1",
              shipDeploymentId: "ship-1",
              prompt: "hello",
              requestedBackend: "auto",
              autoProvisionIfMissing: true,
            })),
            autoProvisioned: false,
          }),
      }),
    )

    assert.equal(response.status, 200)
    const payload = (await response.json()) as Record<string, unknown>
    assert.equal(payload.autoProvisioned, false)
  } finally {
    restoreEnv()
  }
})

