import test from "node:test"
import assert from "node:assert/strict"
import {
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
