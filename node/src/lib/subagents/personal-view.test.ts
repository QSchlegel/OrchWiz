import test from "node:test"
import assert from "node:assert/strict"
import {
  aggregateAdvancedUnreadCount,
  coreTabsForMode,
  enforceCoreTabForMode,
  formatAgentCardStatusLine,
  isAdvancedSectionVisible,
  nextVisibleAdvancedSection,
  type PersonalMode,
} from "./personal-view"
import type { NotificationChannel } from "@/lib/types/notifications"

test("coreTabsForMode returns full core set for personal", () => {
  assert.deepEqual(coreTabsForMode("personal"), ["context", "permissions", "agentsync", "orchestration", "harness", "tools"])
})

test("coreTabsForMode returns context only for shared", () => {
  assert.deepEqual(coreTabsForMode("shared"), ["context"])
})

test("enforceCoreTabForMode forces shared mode to context", () => {
  assert.equal(enforceCoreTabForMode("shared", "permissions"), "context")
  assert.equal(enforceCoreTabForMode("personal", "permissions"), "permissions")
})

test("formatAgentCardStatusLine keeps compact token and path status", () => {
  assert.equal(formatAgentCardStatusLine({ estimatedTokens: 842.2, path: ".claude/agents/x/SOUL.md" }), "~842 tokens · Path set")
  assert.equal(formatAgentCardStatusLine({ estimatedTokens: 0, path: null }), "~0 tokens · No path")
})

test("aggregateAdvancedUnreadCount sums advanced channels by mode", () => {
  const counts: Partial<Record<NotificationChannel, number>> = {
    "personal.personal.workspace": 2,
    "personal.personal.memory": 3,
    "personal.personal.guidelines": 1,
    "personal.personal.capabilities": 4,
    "personal.shared.workspace": 5,
  }

  const getUnread = (channels: NotificationChannel[]) => channels.reduce((sum, channel) => sum + (counts[channel] || 0), 0)

  assert.equal(aggregateAdvancedUnreadCount("personal", getUnread), 10)
  assert.equal(aggregateAdvancedUnreadCount("shared", getUnread), 5)
})

test("capabilities advanced section is visible only for exocomp", () => {
  assert.equal(isAdvancedSectionVisible("capabilities", "exocomp"), true)
  assert.equal(isAdvancedSectionVisible("capabilities", "general"), false)
  assert.equal(isAdvancedSectionVisible("workspace", "general"), true)
})

test("nextVisibleAdvancedSection falls back when requested section is hidden", () => {
  assert.equal(nextVisibleAdvancedSection("capabilities", "general"), "workspace")
  assert.equal(nextVisibleAdvancedSection("memory", "general"), "memory")
})
