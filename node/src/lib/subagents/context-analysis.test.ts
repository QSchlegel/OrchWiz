import test from "node:test"
import assert from "node:assert/strict"
import { analyzeSubagentContexts } from "./context-analysis"

test("analyzeSubagentContexts parses structured markdown sections and dependencies", () => {
  const analyses = analyzeSubagentContexts([
    {
      id: "agent-alpha",
      name: "alpha",
      content: `
# Role
You are the implementation specialist for production-grade fixes.

## Goals
Deliver actionable code changes with tests.

## Constraints
Never edit secrets and never skip validation.

## Output Format
Return bullet points with file paths and test proof.

## Handoff
When blocked, handoff to beta.
      `,
    },
    {
      id: "agent-beta",
      name: "beta",
      content: "Role: unblock complex integration work quickly.",
    },
  ])

  const alpha = analyses.find((entry) => entry.subagentId === "agent-alpha")
  assert.ok(alpha)
  assert.equal(alpha.sections.length >= 4, true)
  assert.equal(alpha.dependencies.includes("agent-beta"), true)
  assert.equal(alpha.compositionScore > 60, true)

  const outputSection = alpha.sections.find((section) => section.type === "output")
  assert.ok(outputSection)
})

test("analyzeSubagentContexts flags missing structure and output contract", () => {
  const analyses = analyzeSubagentContexts([
    {
      id: "agent-min",
      name: "minimalist",
      content: "Do the task fast.",
    },
    {
      id: "agent-peer",
      name: "peer",
      content: "Handle escalation when asked.",
    },
  ])

  const minimalist = analyses.find((entry) => entry.subagentId === "agent-min")
  assert.ok(minimalist)
  assert.equal(minimalist.compositionScore < 50, true)
  assert.equal(
    minimalist.risks.some((risk) => risk.id === "missing-output-contract"),
    true
  )
  assert.equal(
    minimalist.risks.some((risk) => risk.id === "no-handoff-paths"),
    true
  )
})
