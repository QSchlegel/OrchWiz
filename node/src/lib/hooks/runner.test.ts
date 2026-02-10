import assert from "node:assert/strict"
import test from "node:test"
import { runPostToolUseHooks, type HookExecutionPersistInput, type HookRecord } from "@/lib/hooks/runner"

function createClock(values: number[]): () => number {
  let index = 0
  return () => {
    const value = values[Math.min(index, values.length - 1)]
    index += 1
    return value
  }
}

test("runPostToolUseHooks delivers matching webhooks and persists execution logs", async () => {
  const hooks: HookRecord[] = [
    {
      id: "hook-1",
      name: "Deploy webhook",
      matcher: "deploy",
      type: "webhook",
      command: "https://hooks.example.com/deploy",
    },
    {
      id: "hook-2",
      name: "Failure webhook",
      matcher: "deploy",
      type: "webhook",
      command: "https://hooks.example.com/fail",
    },
    {
      id: "hook-3",
      name: "No match",
      matcher: "lint",
      type: "webhook",
      command: "https://hooks.example.com/lint",
    },
  ]

  const persisted: HookExecutionPersistInput[] = []
  const requests: string[] = []

  const result = await runPostToolUseHooks(
    {
      ownerUserId: "user-1",
      toolName: "deploy",
      status: "completed",
      sessionId: "sess-1",
      toolUseId: "exec-1",
      durationMs: 15,
      input: { commandId: "cmd-1" },
      output: { ok: true },
      error: null,
      metadata: { source: "test" },
      occurredAt: new Date("2026-02-10T10:00:00.000Z"),
    },
    {
      findActiveWebhookHooks: async () => hooks,
      persistExecution: async (input) => {
        persisted.push(input)
      },
      fetchFn: async (input) => {
        requests.push(String(input))
        if (String(input).includes("/fail")) {
          return new Response("bad", { status: 500 })
        }

        return new Response("ok", { status: 200 })
      },
      timeoutMs: () => 5000,
      now: createClock([100, 110, 200, 225]),
    },
  )

  assert.equal(result.matchedHooks, 2)
  assert.equal(result.delivered, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.executions.length, 2)

  assert.deepEqual(requests, [
    "https://hooks.example.com/deploy",
    "https://hooks.example.com/fail",
  ])

  assert.equal(persisted.length, 2)
  assert.equal(persisted[0].status, "completed")
  assert.equal(persisted[1].status, "failed")
  assert.equal(persisted[0].sessionId, "sess-1")
  assert.equal(persisted[0].toolUseId, "exec-1")
})

test("runPostToolUseHooks is fail-open when persisting execution logs fails", async () => {
  const result = await runPostToolUseHooks(
    {
      ownerUserId: "user-1",
      toolName: "build",
      status: "failed",
    },
    {
      findActiveWebhookHooks: async () => [
        {
          id: "hook-1",
          name: "Build hook",
          matcher: "build",
          type: "webhook",
          command: "https://hooks.example.com/build",
        },
      ],
      persistExecution: async () => {
        throw new Error("db unavailable")
      },
      fetchFn: async () => new Response("ok", { status: 200 }),
      timeoutMs: () => 5000,
      now: createClock([10, 20]),
    },
  )

  assert.equal(result.matchedHooks, 1)
  assert.equal(result.delivered, 1)
  assert.equal(result.failed, 0)
})

test("runPostToolUseHooks treats webhook network errors as failed deliveries", async () => {
  const result = await runPostToolUseHooks(
    {
      ownerUserId: "user-1",
      toolName: "test",
      status: "blocked",
    },
    {
      findActiveWebhookHooks: async () => [
        {
          id: "hook-1",
          name: "Test hook",
          matcher: "test",
          type: "webhook",
          command: "https://hooks.example.com/test",
        },
      ],
      persistExecution: async () => {},
      fetchFn: async () => {
        throw new Error("network down")
      },
      timeoutMs: () => 5000,
      now: createClock([10, 12]),
    },
  )

  assert.equal(result.matchedHooks, 1)
  assert.equal(result.delivered, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.executions[0].status, "failed")
  assert.equal(result.executions[0].error, "network down")
})
