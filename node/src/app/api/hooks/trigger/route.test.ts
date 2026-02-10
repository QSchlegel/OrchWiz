import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostTrigger, type HookTriggerRouteDeps } from "./route"
import type { PostToolUseEventInput } from "@/lib/hooks/types"

function triggerRequest(body: Record<string, unknown>, token?: string): NextRequest {
  return new Request("http://localhost/api/hooks/trigger", {
    method: "POST",
    headers: token
      ? {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        }
      : {
          "content-type": "application/json",
        },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function deps(overrides: Partial<HookTriggerRouteDeps> = {}): HookTriggerRouteDeps {
  return {
    expectedBearerToken: () => "machine-token",
    resolveSessionOwnerUserId: async () => "user-session",
    resolveActor: async () => ({
      userId: "user-session",
      email: "captain@example.com",
      role: "captain",
      isAdmin: false,
    }),
    runHooks: async () => ({
      matchedHooks: 2,
      delivered: 1,
      failed: 1,
      executions: [],
    }),
    ...overrides,
  }
}

test("handlePostTrigger supports session-authenticated trigger requests", async () => {
  let capturedInput: PostToolUseEventInput | null = null
  const response = await handlePostTrigger(
    triggerRequest({
      toolName: "deploy",
      status: "completed",
      sessionId: "sess-1",
    }),
    deps({
      resolveSessionOwnerUserId: async () => "user-session",
      runHooks: async (input) => {
        capturedInput = input
        return {
          matchedHooks: 1,
          delivered: 1,
          failed: 0,
          executions: [],
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.received, true)
  assert.equal(payload.matchedHooks, 1)
  assert.equal(payload.delivered, 1)
  assert.equal(payload.failed, 0)
  assert.equal(capturedInput?.ownerUserId, "user-session")
  assert.equal(capturedInput?.toolName, "deploy")
})

test("handlePostTrigger supports bearer-token trigger requests", async () => {
  let capturedInput: PostToolUseEventInput | null = null
  const response = await handlePostTrigger(
    triggerRequest(
      {
        toolName: "build",
        status: "failed",
        sessionId: "sess-2",
      },
      "machine-token",
    ),
    deps({
      resolveSessionOwnerUserId: async () => "machine-user",
      runHooks: async (input) => {
        capturedInput = input
        return {
          matchedHooks: 0,
          delivered: 0,
          failed: 0,
          executions: [],
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(capturedInput?.ownerUserId, "machine-user")
})

test("handlePostTrigger rejects missing machine-mode user resolution", async () => {
  const response = await handlePostTrigger(
    triggerRequest(
      {
        toolName: "build",
        status: "failed",
      },
      "machine-token",
    ),
    deps(),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "userId is required when sessionId is not provided in machine mode")
})

test("handlePostTrigger rejects invalid bearer token", async () => {
  const response = await handlePostTrigger(
    triggerRequest(
      {
        toolName: "build",
        status: "failed",
      },
      "wrong-token",
    ),
    deps(),
  )

  assert.equal(response.status, 401)
})

test("handlePostTrigger rejects session/user mismatch in machine mode", async () => {
  const response = await handlePostTrigger(
    triggerRequest(
      {
        toolName: "build",
        status: "failed",
        sessionId: "sess-2",
        userId: "different-user",
      },
      "machine-token",
    ),
    deps({
      resolveSessionOwnerUserId: async () => "machine-user",
    }),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "userId does not match sessionId owner")
})

test("handlePostTrigger rejects session-authenticated user mismatch", async () => {
  const response = await handlePostTrigger(
    triggerRequest({
      toolName: "lint",
      status: "blocked",
      userId: "other-user",
    }),
    deps(),
  )

  assert.equal(response.status, 403)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "userId does not match authenticated user")
})

test("handlePostTrigger rejects session ownership mismatch for non-admin session users", async () => {
  const response = await handlePostTrigger(
    triggerRequest({
      toolName: "lint",
      status: "blocked",
      sessionId: "sess-9",
    }),
    deps({
      resolveSessionOwnerUserId: async () => "different-owner",
    }),
  )

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "sessionId does not belong to authenticated user")
})
