import test from "node:test"
import assert from "node:assert/strict"
import { splitAgentSyncSuggestionsByRisk } from "./run"

test("splitAgentSyncSuggestionsByRisk keeps low-risk files for auto-apply", () => {
  const suggestions = [
    { id: "a", fileName: "MISSION.md" },
    { id: "b", fileName: "CONTEXT.md" },
    { id: "c", fileName: "SOUL.md" },
    { id: "d", fileName: "VOICE.md" },
  ]

  const result = splitAgentSyncSuggestionsByRisk(suggestions)
  assert.deepEqual(result.lowRiskSuggestions.map((entry) => entry.fileName), ["MISSION.md", "CONTEXT.md"])
  assert.deepEqual(result.highRiskSuggestions.map((entry) => entry.fileName), ["SOUL.md", "VOICE.md"])
})

