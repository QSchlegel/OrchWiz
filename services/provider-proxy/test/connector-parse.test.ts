import assert from "node:assert/strict"
import test from "node:test"
import { parseCodexCliAccountStatusText, parseCodexCliDeviceAuthOutput } from "../src/codex-cli-connector.js"

test("parseCodexCliAccountStatusText detects chatgpt provider", () => {
  const status = parseCodexCliAccountStatusText("Logged in with ChatGPT")
  assert.equal(status.connected, true)
  assert.equal(status.provider, "chatgpt")
})

test("parseCodexCliDeviceAuthOutput extracts verification url and user code", () => {
  const details = parseCodexCliDeviceAuthOutput(
    "Visit https://auth.openai.com/codex/device and enter one-time code:\nABCD-1234\nExpires in 15 minutes",
  )
  assert.equal(details.verificationUrl, "https://auth.openai.com/codex/device")
  assert.equal(details.userCode, "ABCD-1234")
  assert.equal(details.expiresInMinutes, 15)
})

