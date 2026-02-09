import test from "node:test"
import assert from "node:assert/strict"
import {
  INITIAL_BRIDGE_CREW_CALLSIGNS,
  buildInitialBridgeCrewSubagents,
} from "./bridge-crew-bootstrap"

test("buildInitialBridgeCrewSubagents returns one personal template per bridge crew role", () => {
  const crew = buildInitialBridgeCrewSubagents()

  assert.equal(crew.length, INITIAL_BRIDGE_CREW_CALLSIGNS.length)
  assert.deepEqual(
    crew.map((entry) => entry.name),
    INITIAL_BRIDGE_CREW_CALLSIGNS
  )
  assert.equal(crew.every((entry) => entry.isShared === false), true)
  assert.equal(
    crew.every((entry) => entry.path.startsWith(".claude/agents/bridge-crew/")),
    true
  )
})

test("bridge crew templates include concise context-file sections and OpenClaw grounding", () => {
  const crew = buildInitialBridgeCrewSubagents()
  const requiredSections = [
    "SOUL.md",
    "MISSION.md",
    "CONTEXT.md",
    "SCOPE.md",
    "AUDIENCE.md",
    "VOICE.md",
    "ETHICS.md",
    "MEMORY.md",
    "DECISIONS.md",
    "FAILURES.md",
  ]

  for (const entry of crew) {
    for (const section of requiredSections) {
      assert.equal(entry.content.includes(section), true, `${entry.name} missing ${section}`)
    }

    assert.equal(entry.content.includes("src/lib/runtime/index.ts"), true)
    assert.equal(entry.content.includes("src/lib/runtime/bridge-prompt.ts"), true)
    assert.equal(entry.content.includes("src/lib/uss-k8s/topology.ts"), true)

    const wordCount = entry.content.trim().split(/\s+/).length
    assert.equal(wordCount < 260, true, `${entry.name} should stay readable in under one minute`)
  }
})
