import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostChat, type LandingChatRouteDeps } from "./route"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/landing/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("landing chat returns feature-disabled when env gate is off", async () => {
  const response = await handlePostChat(
    buildRequest({ prompt: "hello" }),
    {
      env: env({ LANDING_XO_ENABLED: "false" }),
      getSession: async () => null,
      hasPasskey: async () => false,
      emitTrace: async () => {},
      createTraceId: () => "trace-disabled",
    },
  )

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "LANDING_XO_DISABLED")
})

test("landing chat emits trace and resolves docs command", async () => {
  const emitted: string[] = []
  const deps: LandingChatRouteDeps = {
    env: env({ LANDING_XO_ENABLED: "true" }),
    getSession: async () => ({
      session: { id: "sess-1" },
      user: { id: "user-1", email: "user@example.com" },
    }),
    hasPasskey: async () => true,
    emitTrace: async () => {
      emitted.push("trace")
    },
    createTraceId: () => "trace-1",
  }

  const response = await handlePostChat(
    buildRequest({ prompt: "/docs cloud", history: [] }),
    deps,
  )

  assert.equal(response.status, 200)
  assert.equal(emitted.length, 1)
  const payload = (await response.json()) as Record<string, unknown>
  assert.ok(String(payload.reply || "").includes("/docs#cloud-toggle"))
  assert.deepEqual(payload.action, {
    type: "open_docs",
    href: "/docs#cloud-toggle",
  })
})

test("landing chat remains successful when telemetry emission fails", async () => {
  const response = await handlePostChat(
    buildRequest({ prompt: "status report" }),
    {
      env: env({ LANDING_XO_ENABLED: "true" }),
      getSession: async () => ({
        session: { id: "sess-2" },
        user: { id: "user-2", email: "user2@example.com" },
      }),
      hasPasskey: async () => true,
      emitTrace: async () => {
        throw new Error("trace down")
      },
      createTraceId: () => "trace-2",
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.provider, "xo-scripted")
})
