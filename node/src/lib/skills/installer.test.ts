import assert from "node:assert/strict"
import test from "node:test"
import {
  parseInstalledSkillRecords,
  redactSensitiveOutput,
  resolveCodexHomeForUser,
} from "@/lib/skills/installer"

test("resolveCodexHomeForUser derives a user-scoped path", () => {
  const home = resolveCodexHomeForUser("user:alpha/beta")
  assert.equal(home.includes("user_alpha_beta"), true)
})

test("redactSensitiveOutput redacts explicit and pattern-based secrets", () => {
  const output = "token=ghp_abcdefghijklmnopqrstuvwxyz123456 and github_pat_abcdefghijklmnopqrstuvwxyz123456"
  const redacted = redactSensitiveOutput(output, ["ghp_abcdefghijklmnopqrstuvwxyz123456"])

  assert.equal(redacted.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"), false)
  assert.equal(redacted.includes("github_pat_abcdefghijklmnopqrstuvwxyz123456"), false)
  assert.equal(redacted.includes("[REDACTED_TOKEN]"), true)
})

test("parseInstalledSkillRecords extracts installed destination lines", () => {
  const records = parseInstalledSkillRecords(
    [
      "Installed playwright to /tmp/codex-home/skills/playwright",
      "Installed foo to /tmp/codex-home/skills/foo",
      "unrelated",
    ].join("\n"),
  )

  assert.equal(records.length, 2)
  assert.deepEqual(records[0], {
    name: "playwright",
    destination: "/tmp/codex-home/skills/playwright",
  })
})
