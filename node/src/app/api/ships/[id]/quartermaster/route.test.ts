import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import {
  handleGetShipQuartermaster,
  handlePostShipQuartermaster,
  type ShipQuartermasterRouteDeps,
} from "./route"
import { QuartermasterApiResponseError } from "@/lib/quartermaster/api"

function requestFor(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/ships/ship-1/quartermaster", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function createDeps(overrides: Partial<ShipQuartermasterRouteDeps> = {}): ShipQuartermasterRouteDeps {
  return {
    getSessionUserId: async () => "user-1",
    loadState: async () =>
      ({
        ship: {
          id: "ship-1",
        },
        interactions: [],
      }) as Awaited<ReturnType<ShipQuartermasterRouteDeps["loadState"]>>,
    runPrompt: async () => ({
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
      autoProvisioned: false,
    }),
    ...overrides,
  }
}

test("ship quartermaster GET requires authenticated session", async () => {
  const response = await handleGetShipQuartermaster(
    { shipDeploymentId: "ship-1" },
    createDeps({
      getSessionUserId: async () => null,
    }),
  )

  assert.equal(response.status, 401)
})

test("ship quartermaster POST returns 409 when quartermaster is not provisioned", async () => {
  const response = await handlePostShipQuartermaster(
    requestFor({ prompt: "status" }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      runPrompt: async () => {
        throw new QuartermasterApiResponseError(409, {
          error: "Quartermaster is not enabled for this ship.",
        })
      },
    }),
  )

  assert.equal(response.status, 409)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Quartermaster is not enabled for this ship.")
})

test("ship quartermaster POST keeps legacy payload shape (no autoProvisioned field)", async () => {
  const response = await handlePostShipQuartermaster(
    requestFor({ prompt: "status" }),
    { shipDeploymentId: "ship-1" },
    createDeps(),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(Object.prototype.hasOwnProperty.call(payload, "autoProvisioned"), false)
  assert.equal(payload.provider, "codex-cli")
})

test("ship quartermaster POST enables auto-provision for missing quartermaster state", async () => {
  let autoProvisionIfMissing: boolean | null = null

  const response = await handlePostShipQuartermaster(
    requestFor({ prompt: "status" }),
    { shipDeploymentId: "ship-1" },
    createDeps({
      runPrompt: async (args) => {
        autoProvisionIfMissing = args.autoProvisionIfMissing
        return {
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
          autoProvisioned: false,
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(autoProvisionIfMissing, true)
})
