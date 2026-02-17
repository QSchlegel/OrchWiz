import { execFile as execFileCallback } from "node:child_process"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import { promisify } from "node:util"
import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import { probeSpacebotWebhookHealth } from "@/lib/runtime/providers/spacebot-webhook"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const execFileAsync = promisify(execFileCallback)
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const MAX_OUTPUT_CHARS = 8_000
const SUPPORTED_STACKS = new Set(["dev-local", "cloudflare-local"])

type SpacebotStack = "dev-local" | "cloudflare-local"
type SpacebotAction = "start" | "stop" | "restart"

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  exitCode: number | null
}

interface CommandOptions {
  timeoutMs?: number
}

export interface SpacebotConnectorDeps {
  requireActor: () => Promise<AccessActor>
  env: NodeJS.ProcessEnv
  commandExists: (command: string) => boolean
  fileExists: (path: string) => boolean
  runCommand: (
    command: string,
    args: string[],
    options?: CommandOptions,
  ) => Promise<CommandResult>
  probeHealth: (baseUrl: string) => Promise<{
    ok: boolean
    status: number | null
    error: string | null
  }>
}

function commandExistsOnPath(command: string): boolean {
  const pathValue = process.env.PATH || ""
  const segments = pathValue
    .split(delimiter)
    .map((segment) => segment.trim())
    .filter(Boolean)

  for (const segment of segments) {
    const candidate = join(segment, command)
    if (!existsSync(candidate)) {
      continue
    }

    try {
      const stats = statSync(candidate)
      if (!stats.isFile()) {
        continue
      }
      accessSync(candidate, constants.X_OK)
      return true
    } catch {
      continue
    }
  }

  return false
}

const defaultDeps: SpacebotConnectorDeps = {
  requireActor: async () => requireAccessActor(),
  env: process.env,
  commandExists: commandExistsOnPath,
  fileExists: (path) => existsSync(path),
  runCommand: async (command, args, options = {}) => {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        timeout: options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        env: process.env,
      })

      return {
        ok: true,
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: 0,
      }
    } catch (error) {
      const commandError = error as {
        stdout?: string
        stderr?: string
        message?: string
        code?: number
      }

      return {
        ok: false,
        stdout: commandError.stdout || "",
        stderr: commandError.stderr || "",
        error: commandError.message || "Command failed.",
        exitCode: typeof commandError.code === "number" ? commandError.code : null,
      }
    }
  },
  probeHealth: (baseUrl) => probeSpacebotWebhookHealth(baseUrl),
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false
  }

  return fallback
}

function parseStack(value: string | null): SpacebotStack | null {
  const normalized = asString(value)?.toLowerCase() || "cloudflare-local"
  if (!SUPPORTED_STACKS.has(normalized)) {
    return null
  }
  return normalized as SpacebotStack
}

function parseAction(value: unknown): SpacebotAction | null {
  const normalized = asString(value)?.toLowerCase()
  if (normalized === "start" || normalized === "stop" || normalized === "restart") {
    return normalized
  }
  return null
}

function resolveRepoRoot(env: NodeJS.ProcessEnv): string {
  const configured = asString(env.ORCHWIZ_REPO_ROOT)
  if (configured) {
    return configured
  }
  return resolve(process.cwd(), "..")
}

function resolveComposeFile(stack: SpacebotStack, repoRoot: string): string {
  return join(repoRoot, stack, "docker-compose.yml")
}

function resolveSpacebotBaseUrl(env: NodeJS.ProcessEnv): string {
  const configured = asString(env.SPACEBOT_WEBHOOK_BASE_URL)
  if (configured) {
    return configured.replace(/\/+$/u, "")
  }
  return "http://spacebot:18789"
}

function outputTail(result: CommandResult): string {
  const combined = [result.stdout, result.stderr, result.error || ""]
    .filter(Boolean)
    .join("\n")
    .trim()

  if (combined.length <= MAX_OUTPUT_CHARS) {
    return combined
  }

  return combined.slice(-MAX_OUTPUT_CHARS)
}

function blockedResponse() {
  return NextResponse.json(
    {
      error:
        "Local command execution is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true to manage Spacebot from the UI.",
      code: "SPACEBOT_CONNECTOR_BLOCKED",
      details: {
        suggestedCommands: [
          "ENABLE_LOCAL_COMMAND_EXECUTION=true",
          "Retry the Spacebot action.",
        ],
      },
    },
    { status: 422 },
  )
}

function commandUnavailableResponse(command: string) {
  return NextResponse.json(
    {
      error: `Required command '${command}' is not available on PATH.`,
      code: "SPACEBOT_CONNECTOR_TOOLS_MISSING",
      details: {
        suggestedCommands: [`Install '${command}' and retry.`],
      },
    },
    { status: 422 },
  )
}

function composeFileMissingResponse(composeFile: string) {
  return NextResponse.json(
    {
      error: "Compose file is missing for selected stack.",
      code: "SPACEBOT_CONNECTOR_COMPOSE_MISSING",
      details: {
        composeFile,
        suggestedCommands: [
          "git submodule update --init --recursive",
          "Use stack=dev-local or stack=cloudflare-local with an existing compose file.",
        ],
      },
    },
    { status: 422 },
  )
}

function isSpacebotRunning(servicesStdout: string): boolean {
  return servicesStdout
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
    .includes("spacebot")
}

async function inspectSpacebotRuntime(args: {
  stack: SpacebotStack
  deps: SpacebotConnectorDeps
}): Promise<{
  stack: SpacebotStack
  baseUrl: string
  connectorEnabled: boolean
  localCommandExecutionEnabled: boolean
  composeFile: string
  composeFileExists: boolean
  dockerAvailable: boolean
  running: boolean
  health: {
    ok: boolean
    status: number | null
    error: string | null
  }
}> {
  const { stack, deps } = args
  const repoRoot = resolveRepoRoot(deps.env)
  const composeFile = resolveComposeFile(stack, repoRoot)
  const composeFileExists = deps.fileExists(composeFile)
  const dockerAvailable = deps.commandExists("docker")
  const localCommandExecutionEnabled = deps.env.ENABLE_LOCAL_COMMAND_EXECUTION === "true"
  const connectorEnabled = asBoolean(deps.env.SPACEBOT_CONNECTOR_ENABLED, false)
  const baseUrl = resolveSpacebotBaseUrl(deps.env)

  let running = false
  if (composeFileExists && dockerAvailable && localCommandExecutionEnabled) {
    const psResult = await deps.runCommand(
      "docker",
      ["compose", "-f", composeFile, "ps", "--services", "--filter", "status=running"],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
    )
    if (psResult.ok) {
      running = isSpacebotRunning(psResult.stdout)
    }
  }

  const health = await deps.probeHealth(baseUrl)

  return {
    stack,
    baseUrl,
    connectorEnabled,
    localCommandExecutionEnabled,
    composeFile,
    composeFileExists,
    dockerAvailable,
    running,
    health,
  }
}

export async function handleGetSpacebotConnector(
  request: NextRequest,
  deps: SpacebotConnectorDeps = defaultDeps,
) {
  try {
    await deps.requireActor()
    const stack = parseStack(new URL(request.url).searchParams.get("stack"))
    if (!stack) {
      return NextResponse.json(
        { error: "stack must be one of: dev-local, cloudflare-local" },
        { status: 400 },
      )
    }

    const snapshot = await inspectSpacebotRuntime({ stack, deps })
    return NextResponse.json(snapshot)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to inspect Spacebot connector:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePostSpacebotConnector(
  request: NextRequest,
  deps: SpacebotConnectorDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    if (!actor.isAdmin) {
      return NextResponse.json(
        { error: "Only admins can manage Spacebot runtime actions." },
        { status: 403 },
      )
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const action = parseAction(body.action)
    if (!action) {
      return NextResponse.json(
        { error: "action must be one of: start, stop, restart" },
        { status: 400 },
      )
    }

    const stack = parseStack(asString(body.stack))
    if (!stack) {
      return NextResponse.json(
        { error: "stack must be one of: dev-local, cloudflare-local" },
        { status: 400 },
      )
    }

    if (deps.env.ENABLE_LOCAL_COMMAND_EXECUTION !== "true") {
      return blockedResponse()
    }

    if (!deps.commandExists("docker")) {
      return commandUnavailableResponse("docker")
    }

    const repoRoot = resolveRepoRoot(deps.env)
    const composeFile = resolveComposeFile(stack, repoRoot)
    if (!deps.fileExists(composeFile)) {
      return composeFileMissingResponse(composeFile)
    }

    const commandByAction: Record<SpacebotAction, string[]> = {
      start: ["compose", "-f", composeFile, "up", "-d", "spacebot"],
      stop: ["compose", "-f", composeFile, "stop", "spacebot"],
      restart: ["compose", "-f", composeFile, "restart", "spacebot"],
    }

    const result = await deps.runCommand("docker", commandByAction[action], {
      timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          error: `Failed to ${action} Spacebot.`,
          code: "SPACEBOT_CONNECTOR_COMMAND_FAILED",
          details: {
            action,
            stack,
            composeFile,
          },
          metadata: {
            commandOutputTail: outputTail(result),
          },
        },
        { status: 422 },
      )
    }

    const snapshot = await inspectSpacebotRuntime({ stack, deps })

    return NextResponse.json({
      ok: true,
      action,
      stack,
      composeFile,
      commandOutputTail: outputTail(result),
      snapshot,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to run Spacebot connector action:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetSpacebotConnector(request)
}

export async function POST(request: NextRequest) {
  return handlePostSpacebotConnector(request)
}

