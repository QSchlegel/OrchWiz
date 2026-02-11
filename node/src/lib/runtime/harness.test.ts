import test from "node:test"
import assert from "node:assert/strict"
import { resolveHarnessPodContext } from "./harness"
import { DEFAULT_SUBAGENT_SETTINGS } from "@/lib/subagents/settings"

function sampleSubagent(overrides: Partial<{
  id: string
  name: string
  path: string | null
  content: string
  settings: unknown
}> = {}) {
  return {
    id: overrides.id || "sub-1",
    name: overrides.name || "XO-CB01",
    path: overrides.path === undefined ? ".claude/agents/xo-cb01" : overrides.path,
    content: overrides.content || "# PROMPT.md\nBridge support profile.",
    settings: overrides.settings || DEFAULT_SUBAGENT_SETTINGS,
  }
}

test("resolveHarnessPodContext emits context/tools/skills fragments when enabled", async () => {
  const result = await resolveHarnessPodContext(
    {
      userId: "user-1",
      subagentId: "sub-1",
    },
    {
      enabled: () => true,
      resolveWorkspaceRoot: () => "/tmp/repo",
      loadSubagent: async () =>
        sampleSubagent({
          settings: {
            ...DEFAULT_SUBAGENT_SETTINGS,
            harness: {
              runtimeProfile: "quartermaster",
              autoload: {
                context: true,
                tools: true,
                skills: true,
              },
              applyWhenSubagentPresent: true,
              failureMode: "fail-open",
            },
          },
        }),
      loadContextFiles: async () => ({
        source: "filesystem",
        rootPath: ".claude/agents/xo-cb01",
        files: [
          {
            fileName: "PROMPT.md",
            content: "Mission context here.",
            relativePath: ".claude/agents/xo-cb01/PROMPT.md",
            size: {
              wordCount: 3,
              estimatedTokens: 4,
            },
          },
        ],
        totals: {
          wordCount: 3,
          estimatedTokens: 4,
        },
      }),
      listEnabledToolBindings: async () => ([
        {
          toolCatalogEntry: {
            slug: "wallet-enclave",
            name: "Wallet Enclave",
            description: "Signing connector",
            source: "curated",
          },
        },
      ]),
      listEnabledSkillPolicies: async () => ([
        {
          policyId: "policy-1",
          priority: 10,
          policy: {
            slug: "safe-core",
            name: "Safe Core",
            description: null,
            _count: {
              rules: 8,
            },
          },
        },
      ]),
    },
  )

  assert.equal(result.runtimeProfile, "quartermaster")
  assert.equal(result.warnings.length, 0)
  assert.equal(result.promptFragments.length, 3)
  assert.match(result.promptFragments[0], /Harness Context Pack:/u)
  assert.match(result.promptFragments[1], /Harness Tools \(agent-bound\):/u)
  assert.match(result.promptFragments[2], /Harness Skills \(policy profiles\):/u)
})

test("resolveHarnessPodContext respects autoload toggles", async () => {
  const result = await resolveHarnessPodContext(
    {
      userId: "user-1",
      subagentId: "sub-1",
    },
    {
      enabled: () => true,
      resolveWorkspaceRoot: () => "/tmp/repo",
      loadSubagent: async () =>
        sampleSubagent({
          settings: {
            ...DEFAULT_SUBAGENT_SETTINGS,
            harness: {
              runtimeProfile: "default",
              autoload: {
                context: false,
                tools: false,
                skills: false,
              },
              applyWhenSubagentPresent: true,
              failureMode: "fail-open",
            },
          },
        }),
      loadContextFiles: async () => {
        throw new Error("should not run")
      },
      listEnabledToolBindings: async () => {
        throw new Error("should not run")
      },
      listEnabledSkillPolicies: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(result.runtimeProfile, "default")
  assert.deepEqual(result.promptFragments, [])
  assert.deepEqual(result.warnings, [])
})

test("resolveHarnessPodContext fails open on partial loader failure", async () => {
  const result = await resolveHarnessPodContext(
    {
      userId: "user-1",
      subagentId: "sub-1",
    },
    {
      enabled: () => true,
      resolveWorkspaceRoot: () => "/tmp/repo",
      loadSubagent: async () => sampleSubagent(),
      loadContextFiles: async () => {
        throw new Error("context unavailable")
      },
      listEnabledToolBindings: async () => ([
        {
          toolCatalogEntry: {
            slug: "data-core-connector",
            name: "Data Core Connector",
            description: null,
            source: "curated",
          },
        },
      ]),
      listEnabledSkillPolicies: async () => ([
        {
          policyId: "policy-1",
          priority: 100,
          policy: {
            slug: "safe-core",
            name: "Safe Core",
            description: null,
            _count: {
              rules: 5,
            },
          },
        },
      ]),
    },
  )

  assert.equal(result.runtimeProfile, "default")
  assert.equal(result.promptFragments.length, 2)
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /Harness context autoload failed/u)
})
