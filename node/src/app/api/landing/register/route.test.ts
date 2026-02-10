import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostRegister, type LandingRegisterRouteDeps } from "./route"

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv
}

function buildRequest(body: Record<string, unknown>): NextRequest {
  return new Request("http://localhost/api/landing/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

test("landing register returns feature-disabled when gate is off", async () => {
  const response = await handlePostRegister(
    buildRequest({ email: "captain@example.com" }),
    {
      env: env({ LANDING_XO_ENABLED: "false" }),
      getSession: async () => null,
      hasPasskey: async () => false,
      getUser: async () => null,
      updateUser: async () => {
        throw new Error("should not run")
      },
      emailInUse: async () => false,
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

test("landing register updates profile and newsletter when passkey user is authorized", async () => {
  const upserts: string[] = []
  const traces: string[] = []
  const deps: LandingRegisterRouteDeps = {
    env: env({ LANDING_XO_ENABLED: "true" }),
    getSession: async () => ({
      session: { id: "sess-1" },
      user: { id: "user-1", email: "anon@local" },
    }),
    hasPasskey: async () => true,
    getUser: async () => ({
      id: "user-1",
      email: "anon-1@temp.local",
      name: null,
      isAnonymous: true,
    }),
    updateUser: async () => ({
      id: "user-1",
      email: "captain@example.com",
      name: "Captain",
      isAnonymous: false,
    }),
    emailInUse: async () => false,
    upsertNewsletter: async ({ email }) => {
      upserts.push(email)
    },
    sendWelcome: async () => "sent",
    emitTrace: async () => {
      traces.push("trace")
    },
    createTraceId: () => "trace-1",
  }

  const response = await handlePostRegister(
    buildRequest({
      email: "captain@example.com",
      name: "Captain",
      newsletterOptIn: true,
    }),
    deps,
  )

  assert.equal(response.status, 200)
  assert.equal(upserts.length, 1)
  assert.equal(upserts[0], "captain@example.com")
  assert.equal(traces.length, 1)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal((payload.user as Record<string, unknown>).isAnonymous, false)
  assert.equal((payload.newsletter as Record<string, unknown>).status, "subscribed")
})

test("landing register success path is fail-open if telemetry emitter fails", async () => {
  const response = await handlePostRegister(
    buildRequest({
      email: "captain@example.com",
      newsletterOptIn: false,
    }),
    {
      env: env({ LANDING_XO_ENABLED: "true" }),
      getSession: async () => ({
        session: { id: "sess-2" },
        user: { id: "user-2", email: "captain@example.com" },
      }),
      hasPasskey: async () => true,
      getUser: async () => ({
        id: "user-2",
        email: "captain@example.com",
        name: null,
        isAnonymous: false,
      }),
      updateUser: async () => ({
        id: "user-2",
        email: "captain@example.com",
        name: null,
        isAnonymous: false,
      }),
      emailInUse: async () => false,
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
