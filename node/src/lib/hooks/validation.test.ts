import assert from "node:assert/strict"
import test from "node:test"
import {
  HookValidationError,
  parseHookCreateInput,
  parseHookUpdateInput,
  parsePostToolUseTriggerBody,
} from "@/lib/hooks/validation"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => T): T {
  const original: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    original[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("parseHookCreateInput supports webhookUrl field for webhook hooks", () => {
  const parsed = withEnv({ HOOK_WEBHOOK_TARGET_ALLOWLIST: "hooks.example.com" }, () =>
    parseHookCreateInput({
      name: "Deploy notifier",
      matcher: "deploy",
      type: "webhook",
      webhookUrl: "https://hooks.example.com/events",
      isActive: false,
    }),
  )

  assert.equal(parsed.type, "webhook")
  assert.equal(parsed.command, "https://hooks.example.com/events")
  assert.equal(parsed.isActive, false)
})

test("parseHookCreateInput accepts command as backward-compatible webhook alias", () => {
  const parsed = withEnv({ HOOK_WEBHOOK_TARGET_ALLOWLIST: "hooks.example.com" }, () =>
    parseHookCreateInput({
      name: "Deploy notifier",
      matcher: "deploy",
      type: "webhook",
      command: "https://hooks.example.com/legacy",
    }),
  )

  assert.equal(parsed.command, "https://hooks.example.com/legacy")
})

test("parseHookCreateInput rejects invalid matcher patterns", () => {
  assert.throws(
    () =>
      parseHookCreateInput({
        name: "Broken matcher",
        matcher: "(unclosed",
        type: "command",
        command: "echo test",
      }),
    HookValidationError,
  )
})

test("parseHookCreateInput rejects non-allowlisted webhook targets", () => {
  assert.throws(
    () =>
      withEnv({ HOOK_WEBHOOK_TARGET_ALLOWLIST: "hooks.example.com" }, () =>
        parseHookCreateInput({
          name: "Bad target",
          matcher: "build",
          type: "webhook",
          webhookUrl: "https://evil.example.net/events",
        }),
      ),
    HookValidationError,
  )
})

test("parseHookCreateInput enforces ngrok opt-in flag", () => {
  assert.throws(
    () =>
      withEnv(
        {
          HOOK_WEBHOOK_TARGET_ALLOWLIST: "localhost",
          HOOK_WEBHOOK_ALLOW_NGROK: "false",
        },
        () =>
          parseHookCreateInput({
            name: "Ngrok disabled",
            matcher: "deploy",
            type: "webhook",
            webhookUrl: "https://demo.ngrok-free.app/events",
          }),
      ),
    HookValidationError,
  )

  const parsed = withEnv(
    {
      HOOK_WEBHOOK_TARGET_ALLOWLIST: "localhost",
      HOOK_WEBHOOK_ALLOW_NGROK: "true",
    },
    () =>
      parseHookCreateInput({
        name: "Ngrok enabled",
        matcher: "deploy",
        type: "webhook",
        webhookUrl: "https://demo.ngrok-free.app/events",
      }),
  )

  assert.equal(parsed.command, "https://demo.ngrok-free.app/events")
})

test("parseHookUpdateInput requires webhook target when switching type to webhook", () => {
  assert.throws(
    () =>
      parseHookUpdateInput(
        {
          type: "webhook",
        },
        {
          type: "command",
          command: "echo noop",
        },
      ),
    HookValidationError,
  )
})

test("parsePostToolUseTriggerBody normalizes trigger body", () => {
  const parsed = parsePostToolUseTriggerBody({
    toolName: "deploy",
    status: "failed",
    sessionId: "  sess-1 ",
    userId: " user-1 ",
    toolUseId: " exec-1 ",
    durationMs: 12.8,
    metadata: {
      source: "test",
    },
    occurredAt: "2026-02-10T10:00:00.000Z",
  })

  assert.equal(parsed.toolName, "deploy")
  assert.equal(parsed.status, "failed")
  assert.equal(parsed.sessionId, "sess-1")
  assert.equal(parsed.userId, "user-1")
  assert.equal(parsed.toolUseId, "exec-1")
  assert.equal(parsed.durationMs, 13)
  assert.equal(parsed.occurredAt.toISOString(), "2026-02-10T10:00:00.000Z")
  assert.deepEqual(parsed.metadata, { source: "test" })
})
