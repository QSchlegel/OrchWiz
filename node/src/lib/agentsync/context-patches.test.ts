import test from "node:test"
import assert from "node:assert/strict"
import {
  AGENTSYNC_MANAGED_BLOCK_BEGIN,
  AGENTSYNC_MANAGED_BLOCK_END,
} from "./constants"
import { buildAgentSyncFileSuggestion, buildAgentSyncSuggestionsForFiles } from "./context-patches"

const aggregate = {
  signalCount: 5,
  totalReward: 2.4,
  meanReward: 0.48,
  trend: "positive" as const,
  shouldApply: true,
  sourceBreakdown: {
    command: { count: 2, totalReward: 1.4, meanReward: 0.7 },
    verification: { count: 2, totalReward: 0.8, meanReward: 0.4 },
    bridge_call: { count: 1, totalReward: 0.2, meanReward: 0.2 },
  },
}

test("buildAgentSyncFileSuggestion inserts managed block into low-risk files", () => {
  const suggestion = buildAgentSyncFileSuggestion({
    fileName: "MISSION.md",
    existingContent: "# Mission\nKeep ops stable.",
    aggregate,
    subagentName: "XO-CB01",
    generatedAt: new Date("2026-02-10T00:00:00.000Z"),
  })

  assert.ok(suggestion)
  assert.equal(suggestion?.risk, "low")
  assert.match(suggestion?.suggestedContent || "", new RegExp(AGENTSYNC_MANAGED_BLOCK_BEGIN))
  assert.match(suggestion?.suggestedContent || "", new RegExp(AGENTSYNC_MANAGED_BLOCK_END))
})

test("buildAgentSyncFileSuggestion replaces existing managed block in place", () => {
  const existing = [
    "# Mission",
    "Keep current guidance.",
    "",
    AGENTSYNC_MANAGED_BLOCK_BEGIN,
    "legacy managed body",
    AGENTSYNC_MANAGED_BLOCK_END,
    "",
    "Outside block content.",
  ].join("\n")

  const suggestion = buildAgentSyncFileSuggestion({
    fileName: "MISSION.md",
    existingContent: existing,
    aggregate,
    subagentName: "XO-CB01",
  })

  assert.ok(suggestion)
  const content = suggestion?.suggestedContent || ""
  assert.equal(content.includes("legacy managed body"), false)
  assert.equal(content.includes("Outside block content."), true)
})

test("buildAgentSyncSuggestionsForFiles classifies high-risk files", () => {
  const suggestions = buildAgentSyncSuggestionsForFiles({
    files: [
      { fileName: "MISSION.md", content: "base mission" },
      { fileName: "SOUL.md", content: "base soul" },
      { fileName: "NOTES.md", content: "ignored" },
    ],
    aggregate,
    subagentName: "COU-DEA",
  })

  const byFile = new Map(suggestions.map((entry) => [entry.fileName, entry]))
  assert.equal(byFile.get("MISSION.md")?.risk, "low")
  assert.equal(byFile.get("SOUL.md")?.risk, "high")
  assert.equal(byFile.has("NOTES.md"), false)
})

test("buildAgentSyncFileSuggestion renders guidance template variables and still wraps managed block markers", () => {
  const suggestion = buildAgentSyncFileSuggestion({
    fileName: "MISSION.md",
    existingContent: "# Mission\nKeep ops stable.",
    aggregate,
    subagentName: "XO-CB01",
    generatedAt: new Date("2026-02-10T00:00:00.000Z"),
    guidanceTemplate: {
      source: "agent_lightning",
      template: [
        "## AgentSync Guidance (Auto-Managed)",
        "- Agent: {subagent_name}",
        "- Updated: {generated_at_iso}",
        "- Evidence: {signal_count} signals",
        "- Reward: total {total_reward}, mean {mean_reward}, trend {trend}",
        "",
        "Literal braces: {{ok}}",
        "Missing: {does_not_exist}",
        "",
        "### Reinforce",
        "{reinforcement_lines_md}",
        "",
        "### Watchouts",
        "{watchouts_lines_md}",
      ].join("\n"),
    },
  })

  assert.ok(suggestion)
  const content = suggestion?.suggestedContent || ""
  assert.match(content, new RegExp(AGENTSYNC_MANAGED_BLOCK_BEGIN))
  assert.match(content, new RegExp(AGENTSYNC_MANAGED_BLOCK_END))
  assert.match(content, /- Agent: XO-CB01/u)
  assert.match(content, /- Updated: 2026-02-10T00:00:00\.000Z/u)
  assert.equal(content.includes("Literal braces: {ok}"), true)
  assert.match(content, /Missing:\s*\n/u)
})

test("buildAgentSyncFileSuggestion enforces Review Constraint section for high-risk files even when template omits it", () => {
  const suggestion = buildAgentSyncFileSuggestion({
    fileName: "SOUL.md",
    existingContent: "# Soul\nKeep principles aligned.",
    aggregate,
    subagentName: "XO-CB01",
    generatedAt: new Date("2026-02-10T00:00:00.000Z"),
    guidanceTemplate: {
      source: "agent_lightning",
      template: ["# Guidance", "- Risk: {risk}"].join("\n"),
    },
  })

  assert.ok(suggestion)
  const content = suggestion?.suggestedContent || ""
  assert.match(content, /### Review Constraint/u)
  assert.equal(content.includes("High-risk file: requires manual approval before apply."), true)
})

test("buildAgentSyncFileSuggestion falls back to heuristic guidance when template is invalid", () => {
  const generatedAt = new Date("2026-02-10T00:00:00.000Z")

  const heuristic = buildAgentSyncFileSuggestion({
    fileName: "MISSION.md",
    existingContent: "# Mission\nKeep ops stable.",
    aggregate,
    subagentName: "XO-CB01",
    generatedAt,
  })

  const invalidTemplate = buildAgentSyncFileSuggestion({
    fileName: "MISSION.md",
    existingContent: "# Mission\nKeep ops stable.",
    aggregate,
    subagentName: "XO-CB01",
    generatedAt,
    guidanceTemplate: {
      source: "agent_lightning",
      template: "   ",
    },
  })

  assert.ok(heuristic)
  assert.ok(invalidTemplate)
  assert.equal(invalidTemplate?.suggestedContent, heuristic?.suggestedContent)
})
