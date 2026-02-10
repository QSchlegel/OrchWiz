import assert from "node:assert/strict"
import test from "node:test"
import { resolveXoSlashCommand } from "./xo-commands"

test("docs command returns snippet and deep link", () => {
  const result = resolveXoSlashCommand("/docs passkey")
  assert.ok(result)
  assert.equal(result?.command, "/docs")
  assert.ok((result?.reply || "").includes("/docs#passkey-guard"))
  assert.deepEqual(result?.action, {
    type: "open_docs",
    href: "/docs#passkey-guard",
  })
})

test("go command returns page anchor navigation", () => {
  const result = resolveXoSlashCommand("/go start")
  assert.ok(result)
  assert.equal(result?.command, "/go")
  assert.deepEqual(result?.action, {
    type: "navigate",
    href: "#start-path",
  })
})
