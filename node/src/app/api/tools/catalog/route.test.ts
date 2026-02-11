import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetToolsCatalogRoute } from "./route"

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("/api/tools/catalog forwards refresh param and status", async () => {
  let receivedRefresh: string | null | undefined = undefined

  const response = await handleGetToolsCatalogRoute(
    requestFor("http://localhost/api/tools/catalog?refresh=force"),
    {
      handleGetToolsCatalog: async ({ refresh }) => {
        receivedRefresh = refresh
        return {
          status: 200,
          body: {
            entries: [],
          },
        }
      },
    },
  )

  assert.equal(receivedRefresh, "force")
  assert.equal(response.status, 200)

  const payload = await response.json() as Record<string, unknown>
  assert.deepEqual(payload, { entries: [] })
})

test("/api/tools/catalog surfaces dependency errors as provided payload", async () => {
  const response = await handleGetToolsCatalogRoute(
    requestFor("http://localhost/api/tools/catalog"),
    {
      handleGetToolsCatalog: async () => ({
        status: 500,
        body: {
          error: "Internal server error",
        },
      }),
    },
  )

  assert.equal(response.status, 500)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "Internal server error")
})
