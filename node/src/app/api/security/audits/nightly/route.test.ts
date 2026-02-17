import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostNightly } from "./route"

function requestFor(args?: { token?: string; body?: unknown }): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  }
  if (args?.token) {
    headers.authorization = `Bearer ${args.token}`
  }

  const request = new Request("http://localhost:3000/api/security/audits/nightly", {
    method: "POST",
    headers,
    body: JSON.stringify(args?.body ?? {}),
  })

  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL("http://localhost:3000/api/security/audits/nightly"),
    json: request.json.bind(request),
  } as unknown as NextRequest
}

test("handlePostNightly returns 503 when SECURITY_AUDIT_CRON_TOKEN is not configured", async () => {
  const response = await handlePostNightly(requestFor(), {
    expectedToken: () => null,
    now: () => new Date("2026-02-13T00:00:00.000Z"),
    runDueAudits: async () => ({ ok: true }),
  })

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "SECURITY_AUDIT_CRON_TOKEN is not configured")
})

test("handlePostNightly returns 401 when bearer token is missing/invalid", async () => {
  const response = await handlePostNightly(requestFor({ token: "wrong" }), {
    expectedToken: () => "expected",
    now: () => new Date("2026-02-13T00:00:00.000Z"),
    runDueAudits: async () => ({ ok: true }),
  })

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
})

test("handlePostNightly passes flags through to runner when authorized", async () => {
  let received: any = null

  const response = await handlePostNightly(
    requestFor({
      token: "expected",
      body: {
        includeQuartermasterReview: false,
        dryRun: true,
        force: true,
      },
    }),
    {
      expectedToken: () => "expected",
      now: () => new Date("2026-02-13T01:23:00.000Z"),
      runDueAudits: async (args) => {
        received = args
        return { ok: true, dayKey: "2026-02-13" }
      },
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(received, {
    now: new Date("2026-02-13T01:23:00.000Z"),
    includeQuartermasterReview: false,
    dryRun: true,
    force: true,
  })
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, true)
  assert.equal(payload.dayKey, "2026-02-13")
})

