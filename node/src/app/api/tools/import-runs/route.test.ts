import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetToolsImportRunsRoute } from "./route"

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("/api/tools/import-runs forwards limit param", async () => {
  let receivedLimit: string | null | undefined = undefined

  const response = await handleGetToolsImportRunsRoute(
    requestFor("http://localhost/api/tools/import-runs?limit=33"),
    {
      handleGetToolImportRuns: async ({ limit }) => {
        receivedLimit = limit
        return {
          status: 200,
          body: {
            runs: [],
          },
        }
      },
    },
  )

  assert.equal(receivedLimit, "33")
  assert.equal(response.status, 200)
  const payload = await response.json() as Record<string, unknown>
  assert.deepEqual(payload, { runs: [] })
})
