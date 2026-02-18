import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import type { ShipyardRequestActor } from "@/lib/shipyard/request-actor"
import {
  handlePostAgentSyncOpenClawControl,
  type AgentSyncOpenClawControlRouteDeps,
} from "./route"

const actor: ShipyardRequestActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain",
  isAdmin: false,
  authType: "user_api_key",
  keyId: "kid-1",
}

function controlRequest(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/agentsync/openclaw/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function deps(overrides: Partial<AgentSyncOpenClawControlRouteDeps> = {}): AgentSyncOpenClawControlRouteDeps {
  return {
    requireActor: async () => actor,
    listShipsForUser: async () => [
      {
        id: "ship-1",
        status: "active",
        deploymentProfile: "local_starship_build",
        config: {
          infrastructure: {
            namespace: "orchwiz-starship",
          },
        },
      },
    ],
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, accepted: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    now: () => new Date("2026-02-17T12:00:00.000Z"),
    getControlTokenSecret: () => "control-secret",
    controlTimeoutMs: () => 4_000,
    ejectPath: () => "/v1/eject",
    mintToken: () => ({
      token: "minted-control-token",
      issuedAt: "2026-02-17T12:00:00.000Z",
      expiresAt: "2026-02-17T12:05:00.000Z",
      expiresInSeconds: 300,
      issuer: "orchwiz",
      audience: "secure-enclave-control",
      scope: ["secure-enclave.control", "openclaw.action.eject"],
      jti: "jti-1",
    }),
    ...overrides,
  }
}

test("AgentSync OpenClaw control returns unauthorized when actor resolution fails", async () => {
  const response = await handlePostAgentSyncOpenClawControl(
    controlRequest({
      action: "mint_control_token",
      stationKey: "xo",
    }),
    deps({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("AgentSync OpenClaw control mints control token without dispatch when requested", async () => {
  const response = await handlePostAgentSyncOpenClawControl(
    controlRequest({
      action: "mint_control_token",
      stationKey: "xo",
    }),
    deps(),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, true)
  assert.equal(payload.action, "mint_control_token")
  assert.equal((payload.controlToken as Record<string, unknown>).token, "minted-control-token")
})

test("AgentSync OpenClaw control eject action dispatches with secure enclave token", async () => {
  let capturedUrl = ""
  let capturedMethod = ""
  let capturedHeaders: Headers | null = null
  let capturedBody = ""

  const response = await handlePostAgentSyncOpenClawControl(
    controlRequest({
      action: "eject",
      stationKey: "ops",
      persistMemory: true,
      reason: "agentsync-persist",
    }),
    deps({
      fetchImpl: async (url, init) => {
        capturedUrl = url
        capturedMethod = init.method || ""
        capturedHeaders = new Headers(init.headers || {})
        capturedBody = typeof init.body === "string" ? init.body : ""
        return new Response(JSON.stringify({ ok: true, accepted: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(capturedUrl.includes("/v1/eject"), true)
  assert.equal(capturedMethod, "POST")
  assert.equal(capturedHeaders?.get("x-orchwiz-control-token"), "minted-control-token")

  const body = JSON.parse(capturedBody) as Record<string, unknown>
  assert.equal(body.persistMemory, true)
  assert.equal(body.reason, "agentsync-persist")
  assert.equal((body.secureEnclave as Record<string, unknown>).controlToken, "minted-control-token")
})

test("AgentSync OpenClaw control request action validates control path", async () => {
  const response = await handlePostAgentSyncOpenClawControl(
    controlRequest({
      action: "request",
      stationKey: "xo",
      path: "http://malicious.example/v1/control",
      method: "POST",
      payload: { hello: "world" },
    }),
    deps(),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "request action requires path starting with '/' and without protocol.")
})

test("AgentSync OpenClaw control request action proxies method/path for full remote control", async () => {
  let capturedUrl = ""
  let capturedMethod = ""
  let capturedBody = ""

  const response = await handlePostAgentSyncOpenClawControl(
    controlRequest({
      action: "request",
      stationKey: "sec",
      path: "/v1/control/pause",
      method: "PATCH",
      payload: {
        pause: true,
      },
    }),
    deps({
      fetchImpl: async (url, init) => {
        capturedUrl = url
        capturedMethod = init.method || ""
        capturedBody = typeof init.body === "string" ? init.body : ""
        return new Response(JSON.stringify({ ok: true, paused: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        })
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(capturedUrl.includes("/v1/control/pause"), true)
  assert.equal(capturedMethod, "PATCH")
  assert.deepEqual(JSON.parse(capturedBody), { pause: true })
})
