import test from "node:test"
import assert from "node:assert/strict"
import {
  appendExocompCapabilityInstructions,
  appendShipToolInstructions,
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

test("appendShipToolInstructions injects tool block for quartermaster channel", async () => {
  const result = await appendShipToolInstructions(
    {
      userId: "user-1",
      metadata: {
        quartermaster: {
          channel: "ship-quartermaster",
          shipDeploymentId: "ship-1",
        },
      },
      runtimePrompt: "Base prompt",
    },
    {
      getRuntimeContext: async () => ({
        shipName: "USS Example",
        grantedTools: [
          {
            slug: "camoufox",
            name: "Camoufox",
            description: "Stealth browser automation",
            scope: "ship",
          },
        ],
        requestableTools: [
          {
            slug: "another-tool",
            name: "Another Tool",
            description: "Some description",
          },
        ],
      }),
    },
  )

  assert.match(result, /^Base prompt\n\nAvailable Tools:/u)
  assert.match(result, /Ship: USS Example/u)
  assert.match(result, /Granted:\n- camoufox \(ship-wide\): Stealth browser automation/u)
  assert.match(result, /Requestable:\n- another-tool: Some description/u)
  assert.match(result, /File Tool Request/u)
})

test("appendShipToolInstructions injects bridge request protocol for bridge-agent channel", async () => {
  const result = await appendShipToolInstructions(
    {
      userId: "user-1",
      metadata: {
        bridge: {
          channel: "bridge-agent",
          shipDeploymentId: "ship-1",
          bridgeCrewId: "crew-1",
        },
      },
      runtimePrompt: "Bridge base prompt",
    },
    {
      getRuntimeContext: async () => ({
        shipName: "USS Example",
        grantedTools: [
          {
            slug: "camoufox",
            name: "Camoufox",
            description: null,
            scope: "bridge_crew",
            bridgeCrewCallsign: "OPS-ARX",
          },
        ],
        requestableTools: [],
      }),
    },
  )

  assert.match(result, /- camoufox \(bridge-crew:OPS-ARX\)/u)
  assert.match(result, /Ask quartermaster to file a tool request/u)
})

test("appendShipToolInstructions trims oversized tool blocks", async () => {
  const largeDescription = "x".repeat(700)
  const result = await appendShipToolInstructions(
    {
      userId: "user-1",
      metadata: {
        quartermaster: {
          channel: "ship-quartermaster",
          shipDeploymentId: "ship-1",
        },
      },
      runtimePrompt: "Base prompt",
    },
    {
      getRuntimeContext: async () => ({
        shipName: "USS Example",
        grantedTools: Array.from({ length: 10 }).map((_, index) => ({
          slug: `granted-${index}`,
          name: `Granted ${index}`,
          description: largeDescription,
          scope: "ship" as const,
        })),
        requestableTools: Array.from({ length: 12 }).map((_, index) => ({
          slug: `requestable-${index}`,
          name: `Requestable ${index}`,
          description: largeDescription,
        })),
      }),
    },
  )

  assert.match(result, /\.\.\.\[tools block trimmed\]$/u)
})
