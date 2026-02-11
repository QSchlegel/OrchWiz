import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetSubagentToolBindingsRoute, handlePutSubagentToolBindingsRoute } from "./route"
import { SubagentToolBindingError } from "@/lib/tools/agent-bindings"

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

const actor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "captain" as const,
  isAdmin: false,
}

const sampleBindings = [
  {
    id: "binding-1",
    subagentId: "sub-1",
    toolCatalogEntryId: "tool-1",
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    catalogEntry: {
      id: "tool-1",
      slug: "wallet-enclave",
      name: "Wallet Enclave Connector",
      description: "Signing connector",
      source: "curated" as const,
      isInstalled: true,
      isSystem: false,
      sourceUrl: "https://github.com/example/wallet-enclave-tool",
      metadata: {
        source: "curated_manifest",
      },
    },
  },
]

test("/api/subagents/[id]/tool-bindings GET returns bindings for owner", async () => {
  const response = await handleGetSubagentToolBindingsRoute(
    requestFor("http://localhost/api/subagents/sub-1/tool-bindings"),
    {
      params: Promise.resolve({ id: "sub-1" }),
    },
    {
      requireActor: async () => actor,
      loadSubagent: async () => ({
        id: "sub-1",
        ownerUserId: "user-1",
        isShared: false,
      }),
      listSubagentToolBindings: async () => sampleBindings,
      replaceSubagentToolBindings: async () => sampleBindings,
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 200)
  const payload = await response.json() as { bindings: unknown[] }
  assert.equal(Array.isArray(payload.bindings), true)
  assert.equal(payload.bindings.length, 1)
})

test("/api/subagents/[id]/tool-bindings PUT stores bindings for owner", async () => {
  let capturedBindings: unknown = null
  let published = false

  const response = await handlePutSubagentToolBindingsRoute(
    requestFor("http://localhost/api/subagents/sub-1/tool-bindings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bindings: [
          {
            toolCatalogEntryId: "tool-1",
            enabled: true,
          },
        ],
      }),
    }),
    {
      params: Promise.resolve({ id: "sub-1" }),
    },
    {
      requireActor: async () => actor,
      loadSubagent: async () => ({
        id: "sub-1",
        ownerUserId: "user-1",
        isShared: false,
      }),
      listSubagentToolBindings: async () => sampleBindings,
      replaceSubagentToolBindings: async ({ bindings }) => {
        capturedBindings = bindings
        return sampleBindings
      },
      publishNotificationUpdated: () => {
        published = true
        return null
      },
    },
  )

  assert.equal(response.status, 200)
  assert.deepEqual(capturedBindings, [
    {
      toolCatalogEntryId: "tool-1",
      enabled: true,
    },
  ])
  assert.equal(published, true)
})

test("/api/subagents/[id]/tool-bindings PUT rejects non-owned subagent", async () => {
  let calledReplace = false
  const response = await handlePutSubagentToolBindingsRoute(
    requestFor("http://localhost/api/subagents/sub-2/tool-bindings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bindings: [],
      }),
    }),
    {
      params: Promise.resolve({ id: "sub-2" }),
    },
    {
      requireActor: async () => actor,
      loadSubagent: async () => ({
        id: "sub-2",
        ownerUserId: "user-2",
        isShared: false,
      }),
      listSubagentToolBindings: async () => sampleBindings,
      replaceSubagentToolBindings: async () => {
        calledReplace = true
        return sampleBindings
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 404)
  assert.equal(calledReplace, false)
})

test("/api/subagents/[id]/tool-bindings PUT rejects non-imported tool binding", async () => {
  const response = await handlePutSubagentToolBindingsRoute(
    requestFor("http://localhost/api/subagents/sub-1/tool-bindings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bindings: [
          {
            toolCatalogEntryId: "tool-missing",
            enabled: true,
          },
        ],
      }),
    }),
    {
      params: Promise.resolve({ id: "sub-1" }),
    },
    {
      requireActor: async () => actor,
      loadSubagent: async () => ({
        id: "sub-1",
        ownerUserId: "user-1",
        isShared: false,
      }),
      listSubagentToolBindings: async () => sampleBindings,
      replaceSubagentToolBindings: async () => {
        throw new SubagentToolBindingError("toolCatalogEntryId is not imported or not owned: tool-missing", 404)
      },
      publishNotificationUpdated: () => null,
    },
  )

  assert.equal(response.status, 404)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "toolCatalogEntryId is not imported or not owned: tool-missing")
})
