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
  assert.equal(decision.matchedSource, "subagent-rule")
  assert.equal(decision.matchedScope, "subagent")
})

test("evaluateCommandPermissionFromRules evaluates policy profiles after direct subagent rules", () => {
  const decision = evaluateCommandPermissionFromRules(
    ["terraform apply"],
    [
      {
        commandPattern: "terraform *",
        status: "deny",
        scope: "global",
        subagentId: null,
      },
    ],
    {
      subagentId: "agent-xo",
      profileRules: [
        {
          commandPattern: "terraform *",
          status: "allow",
          policyId: "policy-balanced",
          policyName: "Balanced DevOps",
        },
      ],
    },
  )

  assert.equal(decision.allowed, true)
  assert.equal(decision.status, "allow")
  assert.equal(decision.matchedSource, "policy-profile")
  assert.equal(decision.matchedPolicyId, "policy-balanced")
  assert.equal(decision.matchedPolicyName, "Balanced DevOps")
})

test("evaluateCommandPermissionFromRules keeps direct subagent override ahead of policy profiles", () => {
  const decision = evaluateCommandPermissionFromRules(
    ["kubectl apply -f deploy.yaml"],
    [
      {
        commandPattern: "kubectl *",
        status: "allow",
        scope: "subagent",
        subagentId: "agent-ops",
      },
    ],
    {
      subagentId: "agent-ops",
      profileRules: [
        {
          commandPattern: "kubectl *",
          status: "deny",
          policyId: "policy-safe",
          policyName: "Safe Core",
        },
      ],
    },
  )

  assert.equal(decision.allowed, true)
  assert.equal(decision.matchedSource, "subagent-rule")
})

test("evaluateCommandPermissionFromRules respects profile rule ordering", () => {
  const decision = evaluateCommandPermissionFromRules(
    ["docker push registry.local/app"],
    [],
    {
      subagentId: "agent-eng",
      profileRules: [
        {
          commandPattern: "docker *",
          status: "ask",
          policyId: "policy-safe",
          policyName: "Safe Core",
        },
        {
          commandPattern: "docker push *",
          status: "allow",
          policyId: "policy-balanced",
          policyName: "Balanced DevOps",
        },
      ],
    },
  )

  assert.equal(decision.allowed, false)
  assert.equal(decision.status, "ask")
  assert.equal(decision.matchedSource, "policy-profile")
  assert.equal(decision.matchedPolicyId, "policy-safe")
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
  assert.equal(decision.matchedSource, "fallback-rule")
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
  assert.equal(askDecision.matchedSource, "fallback-rule")

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
  assert.equal(denyDecision.matchedSource, "fallback-rule")
})
