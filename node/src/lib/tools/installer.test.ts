import assert from "node:assert/strict"
import test from "node:test"
import {
  parseInstalledToolRecords,
  redactSensitiveOutput,
  resolveCodexHomeForUser,
  resolveToolRootForUser,
} from "@/lib/tools/installer"

test("resolveCodexHomeForUser derives a user-scoped path", () => {
  const home = resolveCodexHomeForUser("user:alpha/beta")
  assert.equal(home.includes("user_alpha_beta"), true)
})

test("resolveToolRootForUser appends tools directory", () => {
  const root = resolveToolRootForUser("user-1")
  assert.equal(root.endsWith("/tools"), true)
})

test("redactSensitiveOutput redacts explicit and pattern-based secrets", () => {
  const output = "token=ghp_abcdefghijklmnopqrstuvwxyz123456 and github_pat_abcdefghijklmnopqrstuvwxyz123456"
  const redacted = redactSensitiveOutput(output, ["ghp_abcdefghijklmnopqrstuvwxyz123456"])

  assert.equal(redacted.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"), false)
  assert.equal(redacted.includes("github_pat_abcdefghijklmnopqrstuvwxyz123456"), false)
  assert.equal(redacted.includes("[REDACTED_TOKEN]"), true)
})

test("parseInstalledToolRecords extracts installed destination lines", () => {
  const records = parseInstalledToolRecords([
    "Installed camoufox to /tmp/codex-home/tools/camoufox",
    "Installed my-tool to /tmp/codex-home/tools/my-tool",
    "unrelated",
  ].join("\n"))

  assert.equal(records.length, 2)
  assert.deepEqual(records[0], {
    name: "camoufox",
    destination: "/tmp/codex-home/tools/camoufox",
  })
})
