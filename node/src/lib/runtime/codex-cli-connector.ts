import { execFile as execFileCallback, spawn } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFileCallback)
const DEFAULT_TIMEOUT_MS = 12_000
const DEVICE_AUTH_TIMEOUT_MS = 20_000
const DEVICE_AUTH_PROCESS_MAX_MS = 20 * 60_000
const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/g

export type CodexCliAccountProvider = "chatgpt" | "api_key" | "unknown" | null

export interface CodexCliConnectorSnapshot {
  executable: string
  shellExecutable: string
  binaryAvailable: boolean
  version: string | null
  accountConnected: boolean
  accountProvider: CodexCliAccountProvider
  statusMessage: string | null
  setupHints: string[]
}

export interface CodexCliConnectorActionResult {
  ok: boolean
  message: string
  verificationUrl?: string | null
  userCode?: string | null
  expiresInMinutes?: number | null
  awaitingAuthorization?: boolean
}

export interface CodexCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  error: string | null
}

export interface CodexCliAccountStatus {
  connected: boolean
  provider: CodexCliAccountProvider
  statusMessage: string | null
}

export interface CodexCliDeviceAuthDetails {
  verificationUrl: string | null
  userCode: string | null
  expiresInMinutes: number | null
}

interface CodexCliCommandDeps {
  executable?: string
  runCommand?: (
    executable: string,
    args: string[],
    timeoutMs?: number,
  ) => Promise<CodexCommandResult>
  runDeviceAuthCommand?: (
    executable: string,
    args: string[],
    timeoutMs?: number,
  ) => Promise<CodexCommandResult>
  runCommandWithInput?: (
    executable: string,
    args: string[],
    input: string,
    timeoutMs?: number,
  ) => Promise<CodexCommandResult>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveCodexExecutable(): string {
  return asString(process.env.CODEX_CLI_PATH) || "codex"
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) {
    return value
  }

  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "")
}

function normalizeText(value: string): string {
  return stripAnsiSequences(value).replace(/\r/g, "").trim()
}

function normalizeOutput(result: CodexCommandResult): string {
  return normalizeText([result.stdout, result.stderr].filter(Boolean).join("\n"))
}

function parseAccountStatus(result: CodexCommandResult): {
  connected: boolean
  provider: CodexCliAccountProvider
  statusMessage: string | null
} {
  return parseCodexCliAccountStatusText(normalizeOutput(result))
}

export function parseCodexCliAccountStatusText(rawText: string | null | undefined): CodexCliAccountStatus {
  const text = normalizeText(rawText || "")
  const normalized = text.toLowerCase()

  const disconnectedPhrases = [
    "not logged",
    "logged out",
    "not signed in",
    "not authenticated",
  ]
  if (disconnectedPhrases.some((phrase) => normalized.includes(phrase))) {
    return {
      connected: false,
      provider: null,
      statusMessage: text || "Codex CLI account is not connected.",
    }
  }

  const connectedPhrases = ["logged in", "signed in", "authenticated"]
  if (connectedPhrases.some((phrase) => normalized.includes(phrase))) {
    if (normalized.includes("chatgpt")) {
      return {
        connected: true,
        provider: "chatgpt",
        statusMessage: text,
      }
    }

    if (normalized.includes("api key") || normalized.includes("api-key")) {
      return {
        connected: true,
        provider: "api_key",
        statusMessage: text,
      }
    }

    return {
      connected: true,
      provider: "unknown",
      statusMessage: text,
    }
  }

  const uncertainFailurePhrases = ["error", "failed", "unable", "exception"]
  if (text && !uncertainFailurePhrases.some((phrase) => normalized.includes(phrase))) {
    return {
      connected: true,
      provider: "unknown",
      statusMessage: text,
    }
  }

  return {
    connected: false,
    provider: null,
    statusMessage: text || "Unable to determine Codex CLI login state.",
  }
}

export function parseCodexCliDeviceAuthOutput(rawOutput: string | null | undefined): CodexCliDeviceAuthDetails {
  const text = normalizeText(rawOutput || "")
  const verificationUrlMatch = text.match(/https?:\/\/[^\s)]+/i)
  const contextualCodeMatch = text.match(/one-time code[^\n]*\n\s*([A-Z0-9]{4,}(?:-[A-Z0-9]{3,})+)/i)
  const fallbackCandidates = text.match(/[A-Z0-9]{4,}(?:-[A-Z0-9]{3,})+/g) || []
  const fallbackUserCode = fallbackCandidates.find((candidate) => /\d/.test(candidate)) || null
  const userCode = contextualCodeMatch?.[1] || fallbackUserCode
  const expiresInMatch = text.toLowerCase().match(/expires in\s+(\d+)\s+minute/)
  const expiresInMinutes = expiresInMatch ? Number.parseInt(expiresInMatch[1], 10) : null

  return {
    verificationUrl: verificationUrlMatch ? verificationUrlMatch[0] : null,
    userCode: userCode ? userCode.toUpperCase() : null,
    expiresInMinutes: Number.isFinite(expiresInMinutes) ? expiresInMinutes : null,
  }
}

function setupHints(args: {
  shellExecutable: string
  binaryAvailable: boolean
  accountConnected: boolean
}): string[] {
  if (!args.binaryAvailable) {
    return [
      "Install Codex CLI (or the Codex desktop app) and verify the binary is on PATH.",
      "Set CODEX_CLI_PATH in .env if you need an explicit binary path.",
    ]
  }

  if (args.accountConnected) {
    return [
      "Codex CLI is connected and ready for Quartermaster runtime prompts.",
    ]
  }

  return [
    `Run ${args.shellExecutable} login --device-auth to connect your ChatGPT account.`,
    `Or use API key setup: printenv OPENAI_API_KEY | ${args.shellExecutable} login --with-api-key`,
  ]
}

async function runCodexCommand(
  executable: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CodexCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    })

    return {
      ok: true,
      stdout: (stdout || "").trim(),
      stderr: (stderr || "").trim(),
      exitCode: 0,
      error: null,
    }
  } catch (error) {
    const commandError = error as {
      stdout?: string
      stderr?: string
      message?: string
      code?: number | string
      signal?: string
      killed?: boolean
    }

    const timedOut = commandError.killed || commandError.signal === "SIGTERM"
    return {
      ok: false,
      stdout: (commandError.stdout || "").trim(),
      stderr: (commandError.stderr || "").trim(),
      exitCode: typeof commandError.code === "number" ? commandError.code : null,
      error: timedOut ? "Command timed out." : commandError.message || "Command failed.",
    }
  }
}

async function runCodexCommandWithInput(
  executable: string,
  args: string[],
  input: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CodexCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeoutMs)

    const finalize = (result: CodexCommandResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", (error) => {
      finalize({
        ok: false,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: null,
        error: error.message,
      })
    })

    child.on("close", (code) => {
      finalize({
        ok: !timedOut && code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
        error: timedOut ? "Command timed out." : null,
      })
    })

    child.stdin.write(input)
    child.stdin.end()
  })
}

async function runCodexDeviceAuthCommand(
  executable: string,
  args: string[],
  timeoutMs = DEVICE_AUTH_TIMEOUT_MS,
): Promise<CodexCommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false

    const finalize = (result: CodexCommandResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const maybeFinalizeFromOutput = () => {
      const combined = normalizeText([stdout, stderr].filter(Boolean).join("\n"))
      const details = parseCodexCliDeviceAuthOutput(combined)
      if (details.verificationUrl && details.userCode) {
        // Keep the process running so device auth can complete after browser approval.
        const killTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGTERM")
          }
        }, DEVICE_AUTH_PROCESS_MAX_MS)
        killTimer.unref()

        finalize({
          ok: true,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: null,
          error: null,
        })
      }
    }

    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGTERM")
      }
      finalize({
        ok: false,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: null,
        error: "Timed out waiting for device authorization instructions.",
      })
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
      maybeFinalizeFromOutput()
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
      maybeFinalizeFromOutput()
    })

    child.on("error", (error) => {
      finalize({
        ok: false,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: null,
        error: error.message,
      })
    })

    child.on("close", (code) => {
      finalize({
        ok: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
        error: code === 0 ? null : `Codex CLI device auth exited with status ${code}.`,
      })
    })
  })
}

function connectorActionMessage(result: CodexCommandResult, fallback: string): string {
  const text = normalizeOutput(result)
  if (text) {
    return text
  }

  if (result.error) {
    return result.error
  }

  return fallback
}

function isCommandTimedOut(result: CodexCommandResult): boolean {
  return Boolean(result.error && result.error.toLowerCase().includes("timed out"))
}

export async function inspectCodexCliConnector(
  deps: CodexCliCommandDeps = {},
): Promise<CodexCliConnectorSnapshot> {
  const executable = deps.executable || resolveCodexExecutable()
  const runCommand = deps.runCommand || runCodexCommand
  const shellExecutable = shellQuote(executable)
  const versionResult = await runCommand(executable, ["--version"])
  const binaryAvailable = versionResult.ok
  const version = versionResult.ok ? normalizeOutput(versionResult) : null

  if (!binaryAvailable) {
    return {
      executable,
      shellExecutable,
      binaryAvailable: false,
      version: null,
      accountConnected: false,
      accountProvider: null,
      statusMessage: connectorActionMessage(versionResult, "Codex CLI binary is not available."),
      setupHints: setupHints({
        shellExecutable,
        binaryAvailable: false,
        accountConnected: false,
      }),
    }
  }

  const loginStatus = await runCommand(executable, ["login", "status"])
  const account = parseAccountStatus(loginStatus)

  return {
    executable,
    shellExecutable,
    binaryAvailable: true,
    version,
    accountConnected: account.connected,
    accountProvider: account.provider,
    statusMessage: account.statusMessage,
    setupHints: setupHints({
      shellExecutable,
      binaryAvailable: true,
      accountConnected: account.connected,
    }),
  }
}

export async function connectCodexCliWithApiKey(
  apiKey: string,
  deps: CodexCliCommandDeps = {},
): Promise<CodexCliConnectorActionResult> {
  const executable = deps.executable || resolveCodexExecutable()
  const runCommandWithInput = deps.runCommandWithInput || runCodexCommandWithInput
  const trimmed = apiKey.trim()

  if (!trimmed) {
    return {
      ok: false,
      message: "API key is required.",
    }
  }

  const result = await runCommandWithInput(
    executable,
    ["login", "--with-api-key"],
    `${trimmed}\n`,
  )

  return {
    ok: result.ok,
    message: connectorActionMessage(
      result,
      result.ok ? "Codex CLI API key login completed." : "Codex CLI API key login failed.",
    ),
  }
}

export async function startCodexCliDeviceAuth(
  deps: CodexCliCommandDeps = {},
): Promise<CodexCliConnectorActionResult> {
  const executable = deps.executable || resolveCodexExecutable()
  const runDeviceAuthCommand =
    deps.runDeviceAuthCommand || (deps.runCommand ? deps.runCommand : runCodexDeviceAuthCommand)
  const result = await runDeviceAuthCommand(executable, ["login", "--device-auth"], DEVICE_AUTH_TIMEOUT_MS)
  const output = normalizeOutput(result)
  const details = parseCodexCliDeviceAuthOutput(output)
  const hasDeviceAuthData = Boolean(details.verificationUrl && details.userCode)
  const timedOut = isCommandTimedOut(result)

  if (!hasDeviceAuthData) {
    return {
      ok: false,
      message: output || connectorActionMessage(result, "Codex CLI device authorization failed."),
      verificationUrl: details.verificationUrl,
      userCode: details.userCode,
      expiresInMinutes: details.expiresInMinutes,
    }
  }

  return {
    ok: result.ok || timedOut,
    message: output || "Codex CLI device authorization started.",
    verificationUrl: details.verificationUrl,
    userCode: details.userCode,
    expiresInMinutes: details.expiresInMinutes,
    awaitingAuthorization: true,
  }
}

export async function logoutCodexCliAccount(
  deps: CodexCliCommandDeps = {},
): Promise<CodexCliConnectorActionResult> {
  const executable = deps.executable || resolveCodexExecutable()
  const runCommand = deps.runCommand || runCodexCommand
  const result = await runCommand(executable, ["logout"])

  return {
    ok: result.ok,
    message: connectorActionMessage(
      result,
      result.ok ? "Codex CLI account logged out." : "Codex CLI logout failed.",
    ),
  }
}
