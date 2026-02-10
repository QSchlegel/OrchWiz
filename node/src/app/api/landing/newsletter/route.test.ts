import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostNewsletter, type LandingNewsletterRouteDeps } from "./route"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/landing/newsletter", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("landing newsletter returns feature-disabled when gate is off", async () => {
  const response = await handlePostNewsletter(
    buildRequest({ email: "captain@example.com" }),
    {
      env: env({ LANDING_XO_ENABLED: "false" }),
      getSession: async () => null,
      upsertNewsletter: async () => {},
      sendWelcome: async () => "skipped",
      emitTrace: async () => {},
      createTraceId: () => "trace-disabled",
    },
  )

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "LANDING_XO_DISABLED")
})

test("landing newsletter subscribes and emits trace", async () => {
  const upserts: string[] = []
  const traces: string[] = []
  const deps: LandingNewsletterRouteDeps = {
    env: env({ LANDING_XO_ENABLED: "true" }),
    getSession: async () => ({
      session: { id: "sess-1" },
      user: { id: "user-1", email: "captain@example.com" },
    }),
    upsertNewsletter: async ({ email }) => {
      upserts.push(email)
    },
    sendWelcome: async () => "sent",
    emitTrace: async () => {
      traces.push("trace")
    },
    createTraceId: () => "trace-1",
  }

  const response = await handlePostNewsletter(
    buildRequest({
      email: "captain@example.com",
      name: "Captain",
    }),
    deps,
  )

  assert.equal(response.status, 200)
  assert.equal(upserts.length, 1)
  assert.equal(traces.length, 1)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.subscribed, true)
  assert.equal(payload.welcome, "sent")
})

test("landing newsletter success remains fail-open on telemetry error", async () => {
  const response = await handlePostNewsletter(
    buildRequest({ email: "captain@example.com" }),
    {
      env: env({ LANDING_XO_ENABLED: "true" }),
      getSession: async () => null,
      upsertNewsletter: async () => {},
      sendWelcome: async () => "skipped",
      emitTrace: async () => {
        throw new Error("trace down")
      },
      createTraceId: () => "trace-2",
    },
  )

  assert.equal(response.status, 200)
})
