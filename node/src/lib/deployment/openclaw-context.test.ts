import test from "node:test"
import assert from "node:assert/strict"
import {
  buildOpenClawBridgeCrewContextBundle,
  encodeOpenClawContextBundle,
} from "./openclaw-context"

test("buildOpenClawBridgeCrewContextBundle splits section headings into context files", () => {
  const bundle = buildOpenClawBridgeCrewContextBundle({
    deploymentId: "ship-123",
    generatedAt: new Date("2026-02-09T10:11:12.000Z"),
    bridgeCrew: [
      {
        role: "xo",
        callsign: "XO-CB01",
        name: "Executive Officer",
        content: `
# SOUL.md
- Mission-first

# MISSION.md
- Coordinate crew
        `.trim(),
      },
    ],
  })

  assert.equal(bundle.schemaVersion, "orchwiz.openclaw.context.v1")
  assert.equal(bundle.source, "ship-yard-bootstrap")
  assert.equal(bundle.deploymentId, "ship-123")
  assert.equal(bundle.generatedAt, "2026-02-09T10:11:12.000Z")

  const manifest = bundle.files.find((file) => file.path === "bridge-crew/MANIFEST.json")
  assert.ok(manifest)
  assert.equal(manifest.content.includes('"callsign": "XO-CB01"'), true)

  const soul = bundle.files.find((file) => file.path === "bridge-crew/xo-cb01/SOUL.md")
  const mission = bundle.files.find((file) => file.path === "bridge-crew/xo-cb01/MISSION.md")
  assert.ok(soul)
  assert.ok(mission)
  assert.equal(soul.content.includes("Mission-first"), true)
  assert.equal(mission.content.includes("Coordinate crew"), true)
})

test("buildOpenClawBridgeCrewContextBundle falls back to PROMPT.md when no section headings exist", () => {
  const bundle = buildOpenClawBridgeCrewContextBundle({
    deploymentId: "ship-abc",
    bridgeCrew: [
      {
        role: "ops",
        callsign: "OPS-ARX",
        name: "Operations",
        content: "Unstructured prompt body",
      },
    ],
  })

  const prompt = bundle.files.find((file) => file.path === "bridge-crew/ops-arx/PROMPT.md")
  assert.ok(prompt)
  assert.equal(prompt.content, "Unstructured prompt body")
})

test("encodeOpenClawContextBundle returns base64 JSON payload", () => {
  const bundle = buildOpenClawBridgeCrewContextBundle({
    deploymentId: "ship-xyz",
    bridgeCrew: [
      {
        role: "eng",
        callsign: "ENG-GEO",
        name: "Engineering",
        content: "# SOUL.md\n- Reliable",
      },
    ],
  })

  const encoded = encodeOpenClawContextBundle(bundle)
  const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    deploymentId: string
    files: Array<{ path: string }>
  }
  assert.equal(decoded.deploymentId, "ship-xyz")
  assert.equal(decoded.files.some((file) => file.path.endsWith("/SOUL.md")), true)
})
