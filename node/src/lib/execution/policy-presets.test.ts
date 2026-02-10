import test from "node:test"
import assert from "node:assert/strict"
import { SYSTEM_PERMISSION_POLICY_PRESETS } from "./policy-presets"

test("SYSTEM_PERMISSION_POLICY_PRESETS includes required profile slugs", () => {
  const slugs = SYSTEM_PERMISSION_POLICY_PRESETS.map((preset) => preset.slug)
  assert.deepEqual(slugs, [
    "safe-core",
    "quartermaster-readonly",
    "balanced-devops",
    "power-operator",
    "github-ingest",
  ])
})

test("safe-core, balanced-devops, and github-ingest end with catch-all ask", () => {
  for (const slug of ["safe-core", "balanced-devops", "github-ingest"]) {
    const preset = SYSTEM_PERMISSION_POLICY_PRESETS.find((entry) => entry.slug === slug)
    assert.ok(preset)
    const tail = preset?.rules[preset.rules.length - 1]
    assert.ok(tail)
    assert.equal(tail?.commandPattern, "*")
    assert.equal(tail?.status, "ask")
  }
})

test("power-operator contains catch-all allow", () => {
  const preset = SYSTEM_PERMISSION_POLICY_PRESETS.find((entry) => entry.slug === "power-operator")
  assert.ok(preset)
  assert.equal(
    preset?.rules.some((rule) => rule.commandPattern === "*" && rule.status === "allow"),
    true,
  )
})

test("system presets include hardened deny defaults", () => {
  const safeCore = SYSTEM_PERMISSION_POLICY_PRESETS.find((entry) => entry.slug === "safe-core")
  const balanced = SYSTEM_PERMISSION_POLICY_PRESETS.find((entry) => entry.slug === "balanced-devops")
  const power = SYSTEM_PERMISSION_POLICY_PRESETS.find((entry) => entry.slug === "power-operator")

  assert.ok(safeCore)
  assert.ok(balanced)
  assert.ok(power)

  for (const preset of [safeCore, balanced]) {
    assert.equal(
      preset?.rules.some((rule) => rule.commandPattern === ":(){ :|:& };:" && rule.status === "deny"),
      true,
    )
    assert.equal(
      preset?.rules.some((rule) => rule.commandPattern === "shutdown *" && rule.status === "deny"),
      true,
    )
    assert.equal(
      preset?.rules.some((rule) => rule.commandPattern === "poweroff *" && rule.status === "deny"),
      true,
    )
  }

  assert.equal(
    power?.rules.some((rule) => rule.commandPattern === "dd if=* of=/dev/*" && rule.status === "deny"),
    true,
  )
})

test("github-ingest includes gh allow rules and hardened denies", () => {
  const preset = SYSTEM_PERMISSION_POLICY_PRESETS.find((entry) => entry.slug === "github-ingest")
  assert.ok(preset)

  assert.equal(
    preset?.rules.some((rule) => rule.commandPattern === "gh pr list*" && rule.status === "allow"),
    true,
  )
  assert.equal(
    preset?.rules.some((rule) => rule.commandPattern === "gh api repos/*/pulls*" && rule.status === "allow"),
    true,
  )
  assert.equal(
    preset?.rules.some((rule) => rule.commandPattern === "rm -rf *" && rule.status === "deny"),
    true,
  )
})
