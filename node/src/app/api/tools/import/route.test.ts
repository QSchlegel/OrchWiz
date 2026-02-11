import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostToolsImportRoute } from "./route"

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("/api/tools/import forwards parsed body", async () => {
  let receivedBody: unknown = null

  const response = await handlePostToolsImportRoute(
    requestFor("http://localhost/api/tools/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "curated", toolSlug: "camoufox" }),
    }),
    {
      handlePostToolImport: async ({ body }) => {
        receivedBody = body
        return {
          status: 200,
          body: {
            ok: true,
          },
        }
      },
    },
  )

  assert.deepEqual(receivedBody, { mode: "curated", toolSlug: "camoufox" })
  assert.equal(response.status, 200)
})

test("/api/tools/import sends empty body for invalid JSON", async () => {
  let receivedBody: unknown = null

  const response = await handlePostToolsImportRoute(
    requestFor("http://localhost/api/tools/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{",
    }),
    {
      handlePostToolImport: async ({ body }) => {
        receivedBody = body
        return {
          status: 400,
          body: {
            error: "mode is required",
          },
        }
      },
    },
  )

  assert.deepEqual(receivedBody, {})
  assert.equal(response.status, 400)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "mode is required")
})
