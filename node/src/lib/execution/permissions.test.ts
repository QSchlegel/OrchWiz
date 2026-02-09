import test from "node:test"
import assert from "node:assert/strict"
import { evaluateCommandPermissionFromRules, matchesCommandPattern } from "./permissions"

test("matches wildcard command patterns", () => {
  assert.equal(matchesCommandPattern("bun run build:*", "bun run build:web"), true)
  assert.equal(matchesCommandPattern("git *", "git status"), true)
  assert.equal(matchesCommandPattern("npm test", "npm run test"), false)
})

test("evaluateCommandPermissionFromRules prioritizes subagent scope over global", () => {
  const decision = evaluateCommandPermissionFromRules(
    ["bun run deploy:prod"],
    [
      {
        commandPattern: "bun run deploy:*",
        status: "deny",
        scope: "global",
        subagentId: null,
      },
      {
        commandPattern: "bun run deploy:*",
        status: "allow",
        scope: "subagent",
        subagentId: "agent-xo",
      },
    ],
    { subagentId: "agent-xo" },
  )

  assert.equal(decision.allowed, true)
  assert.equal(decision.status, "allow")
  assert.equal(decision.matchedScope, "subagent")
})

test("evaluateCommandPermissionFromRules falls back to non-subagent scopes", () => {
  const decision = evaluateCommandPermissionFromRules(
    ["bun run test"],
    [
      {
        commandPattern: "bun run test",
        status: "allow",
        scope: "global",
        subagentId: null,
      },
      {
        commandPattern: "bun run test",
        status: "deny",
        scope: "subagent",
        subagentId: "agent-other",
      },
    ],
    { subagentId: "agent-xo" },
  )

  assert.equal(decision.allowed, true)
  assert.equal(decision.status, "allow")
  assert.equal(decision.matchedScope, "global")
})

test("evaluateCommandPermissionFromRules preserves ask/deny semantics", () => {
  const askDecision = evaluateCommandPermissionFromRules(
    ["terraform apply"],
    [
      {
        commandPattern: "terraform *",
        status: "ask",
        scope: "global",
        subagentId: null,
      },
    ],
  )

  assert.equal(askDecision.allowed, false)
  assert.equal(askDecision.status, "ask")

  const denyDecision = evaluateCommandPermissionFromRules(
    ["rm -rf /tmp/test"],
    [
      {
        commandPattern: "rm -rf *",
        status: "deny",
        scope: "global",
        subagentId: null,
      },
    ],
  )

  assert.equal(denyDecision.allowed, false)
  assert.equal(denyDecision.status, "deny")
})
