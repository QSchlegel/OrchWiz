import assert from "node:assert/strict"
import test from "node:test"
import {
  parseCodexCliAccountStatusText,
  parseCodexCliDeviceAuthOutput,
  startCodexCliDeviceAuth,
  type CodexCommandResult,
} from "./codex-cli-connector"

const plainDeviceAuthOutput = `
Follow these steps to sign in with ChatGPT using device code authorization:
1. Open this link in your browser and sign in to your account
   https://auth.openai.com/codex/device

2. Enter this one-time code (expires in 15 minutes)
   CGA9-ZPX2W
`

const bannerDeviceAuthOutput = `
Welcome to Codex [v0.99.0-alpha.23]
OpenAI's command-line coding agent

Follow these steps to sign in with ChatGPT using device code authorization:
1. Open this link in your browser and sign in to your account
   https://auth.openai.com/codex/device

2. Enter this one-time code (expires in 15 minutes)
   CGA9-ZPX2W
`

test("parseCodexCliAccountStatusText identifies ChatGPT account login", () => {
  const status = parseCodexCliAccountStatusText("Logged in using ChatGPT")

  assert.equal(status.connected, true)
  assert.equal(status.provider, "chatgpt")
  assert.equal(status.statusMessage, "Logged in using ChatGPT")
})

test("parseCodexCliAccountStatusText identifies logged out states", () => {
  const status = parseCodexCliAccountStatusText("Logged out")

  assert.equal(status.connected, false)
  assert.equal(status.provider, null)
  assert.equal(status.statusMessage, "Logged out")
})

test("parseCodexCliAccountStatusText handles signed-in wording", () => {
  const status = parseCodexCliAccountStatusText("Signed in to Codex")

  assert.equal(status.connected, true)
  assert.equal(status.provider, "unknown")
})

test("parseCodexCliAccountStatusText treats unknown non-empty status text as connected", () => {
  const status = parseCodexCliAccountStatusText("Connection ready for your account.")

  assert.equal(status.connected, true)
  assert.equal(status.provider, "unknown")
  assert.equal(status.statusMessage, "Connection ready for your account.")
})

test("parseCodexCliAccountStatusText keeps disconnected phrase precedence", () => {
  const status = parseCodexCliAccountStatusText("Authenticated before, but now not authenticated.")

  assert.equal(status.connected, false)
  assert.equal(status.provider, null)
})

test("parseCodexCliAccountStatusText does not treat obvious failures as connected", () => {
  const status = parseCodexCliAccountStatusText("Error: unable to verify login state")

  assert.equal(status.connected, false)
  assert.equal(status.provider, null)
})

test("parseCodexCliDeviceAuthOutput extracts verification URL, code, and expiry", () => {
  const details = parseCodexCliDeviceAuthOutput(plainDeviceAuthOutput)

  assert.equal(details.verificationUrl, "https://auth.openai.com/codex/device")
  assert.equal(details.userCode, "CGA9-ZPX2W")
  assert.equal(details.expiresInMinutes, 15)
})

test("parseCodexCliDeviceAuthOutput does not confuse banner text with the auth code", () => {
  const details = parseCodexCliDeviceAuthOutput(bannerDeviceAuthOutput)

  assert.equal(details.verificationUrl, "https://auth.openai.com/codex/device")
  assert.equal(details.userCode, "CGA9-ZPX2W")
  assert.notEqual(details.userCode, "COMMAND-LINE")
})

test("parseCodexCliDeviceAuthOutput handles ANSI-colored output", () => {
  const ansiOutput = `
\u001b[90mOpen this link\u001b[0m
\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m
\u001b[90mEnter this one-time code (expires in 15 minutes)\u001b[0m
\u001b[94mCGA9-ZPX2W\u001b[0m
`
  const details = parseCodexCliDeviceAuthOutput(ansiOutput)

  assert.equal(details.verificationUrl, "https://auth.openai.com/codex/device")
  assert.equal(details.userCode, "CGA9-ZPX2W")
  assert.equal(details.expiresInMinutes, 15)
})

test("startCodexCliDeviceAuth treats timeout as success when URL and code are present", async () => {
  const runCommand = async (): Promise<CodexCommandResult> => ({
    ok: false,
    stdout: plainDeviceAuthOutput,
    stderr: "",
    exitCode: null,
    error: "Command timed out.",
  })

  const result = await startCodexCliDeviceAuth({
    executable: "codex",
    runCommand: async () => runCommand(),
  })

  assert.equal(result.ok, true)
  assert.equal(result.verificationUrl, "https://auth.openai.com/codex/device")
  assert.equal(result.userCode, "CGA9-ZPX2W")
  assert.equal(result.expiresInMinutes, 15)
  assert.equal(result.awaitingAuthorization, true)
})

test("startCodexCliDeviceAuth returns ok=false when output lacks URL and code", async () => {
  const result = await startCodexCliDeviceAuth({
    executable: "codex",
    runCommand: async () => ({
      ok: false,
      stdout: "login attempt failed",
      stderr: "",
      exitCode: 1,
      error: "Command failed.",
    }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.verificationUrl, null)
  assert.equal(result.userCode, null)
})
