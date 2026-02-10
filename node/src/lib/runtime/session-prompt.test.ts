import test from "node:test"
import assert from "node:assert/strict"
import {
  appendExocompCapabilityInstructions,
  buildQuartermasterCitationFooter,
  enforceQuartermasterCitationFooter,
} from "./session-prompt"

test("buildQuartermasterCitationFooter renders source list", () => {
  const footer = buildQuartermasterCitationFooter([
    {
      id: "S1",
      path: "ship/kb/ships/ship-123/startup.md",
      title: "Startup",
    },
    {
      id: "S2",
      path: "ship/kb/fleet/comms.md",
      title: "Fleet Comms",
    },
  ])

  assert.match(footer, /^Sources:/)
  assert.match(footer, /\[S1\]/)
  assert.match(footer, /\[S2\]/)
})

test("enforceQuartermasterCitationFooter appends citations when missing", () => {
  const content = "Situation Summary\\n- Engines are ready."
  const enforced = enforceQuartermasterCitationFooter(content, [
    {
      id: "S1",
      path: "ship/kb/ships/ship-123/engines.md",
      title: "Engines",
    },
  ])

  assert.match(enforced, /Citations: \[S1\]/)
  assert.match(enforced, /Sources:/)
  assert.match(enforced, /\[S1\] Engines/)
})

test("enforceQuartermasterCitationFooter keeps existing source sections", () => {
  const content = "Situation Summary [S1]\n\nSources:\n[S1] Existing - path.md"
  const enforced = enforceQuartermasterCitationFooter(content, [
    {
      id: "S1",
      path: "path.md",
      title: "Existing",
    },
  ])

  assert.equal(enforced, content)
})

test("enforceQuartermasterCitationFooter emits fallback S0 with no sources", () => {
  const enforced = enforceQuartermasterCitationFooter("No evidence available.", [])
  assert.match(enforced, /\[S0\]/)
})

test("appendExocompCapabilityInstructions injects capability block for exocomp metadata.subagentId", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma

  let capturedWhere: unknown = null
  globalAny.prisma = {
    subagent: {
      findFirst: async (args: any) => {
        capturedWhere = args.where
        return {
          subagentType: "exocomp",
          settings: {
            capabilities: {
              preset: "core_maintenance",
              diagnostics: true,
              microRepairPlanning: false,
              hazardChecks: true,
              safeShutdownGuidance: false,
              statusRelay: true,
            },
          },
        }
      },
    },
  }

  try {
    const result = await appendExocompCapabilityInstructions({
      userId: "user-1",
      metadata: { subagentId: "sub-1" },
      runtimePrompt: "Base prompt",
    })

    assert.deepEqual(capturedWhere, {
      id: "sub-1",
      OR: [{ ownerUserId: "user-1" }, { isShared: true }],
    })
    assert.match(result, /^Base prompt\n\nExocomp abilities \(system constraints\):/u)
    assert.match(result, /Run concise system diagnostics first/u)
    assert.match(result, /Perform hazard checks before action/u)
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("appendExocompCapabilityInstructions leaves prompt unchanged for non-exocomp subagent", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma
  globalAny.prisma = {
    subagent: {
      findFirst: async () => ({
        subagentType: "general",
        settings: {},
      }),
    },
  }

  try {
    const result = await appendExocompCapabilityInstructions({
      userId: "user-1",
      metadata: { subagentId: "sub-2" },
      runtimePrompt: "Base prompt",
    })

    assert.equal(result, "Base prompt")
  } finally {
    globalAny.prisma = previousPrisma
  }
})

test("appendExocompCapabilityInstructions fails open for unknown subagent", async () => {
  const globalAny = globalThis as any
  const previousPrisma = globalAny.prisma
  globalAny.prisma = {
    subagent: {
      findFirst: async () => null,
    },
  }

  try {
    const result = await appendExocompCapabilityInstructions({
      userId: "user-1",
      metadata: { subagentId: "missing" },
      runtimePrompt: "Base prompt",
    })

    assert.equal(result, "Base prompt")
  } finally {
    globalAny.prisma = previousPrisma
  }
})
