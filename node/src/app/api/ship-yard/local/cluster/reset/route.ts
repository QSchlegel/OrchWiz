import { execFile as execFileCallback } from "node:child_process"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"
import { NextRequest, NextResponse } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const execFileAsync = promisify(execFileCallback)
const DEFAULT_CLUSTER_NAME = "orchwiz"
const DEFAULT_COMMAND_TIMEOUT_MS = 180_000
const MAX_OUTPUT_CHARS = 8_000

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

export interface ShipyardLocalClusterResetDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  env: NodeJS.ProcessEnv
  commandExists: (command: string) => boolean
  runCommand: (
    command: string,
    args: string[],
    options?: CommandOptions,
  ) => Promise<CommandResult>
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

const defaultDeps: ShipyardLocalClusterResetDeps = {
  requireActor: async (request) => requireShipyardRequestActor(request),
  env: process.env,
  commandExists: commandExistsOnPath,
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
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isValidClusterName(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value)
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

function parseConfirmation(body: Record<string, unknown>): boolean {
  return body.confirm === "reset-cluster"
}

function isKindDeleteNoClusterError(result: CommandResult): boolean {
  const raw = [result.stdout, result.stderr, result.error || ""].join("\n").toLowerCase()
  return raw.includes("no kind clusters found")
}

function provisioningBlockedResponse() {
  return NextResponse.json(
    {
      error:
        "Local command execution is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true to enable local Ship Yard cluster reset.",
      code: "LOCAL_PROVISIONING_BLOCKED",
      details: {
        suggestedCommands: [
          "ENABLE_LOCAL_COMMAND_EXECUTION=true",
          "Retry the reset request after enabling command execution.",
        ],
      },
    },
    { status: 422 },
  )
}

function toolsMissingResponse(missingCommands: string[]) {
  return NextResponse.json(
    {
      error: "Missing required local CLIs for Ship Yard cluster reset.",
      code: "LOCAL_BOOTSTRAP_TOOLS_MISSING",
      details: {
        missingCommands,
        suggestedCommands: missingCommands.map((command) => `Install '${command}' and retry reset.`),
      },
    },
    { status: 422 },
  )
}

function provisioningFailedResponse(args: {
  error: string
  suggestedCommands: string[]
  commandOutputTail: string
}) {
  return NextResponse.json(
    {
      error: args.error,
      code: "LOCAL_PROVISIONING_FAILED",
      details: {
        suggestedCommands: args.suggestedCommands,
      },
      metadata: {
        commandOutputTail: args.commandOutputTail,
      },
    },
    { status: 422 },
  )
}

export async function handlePostShipyardLocalClusterReset(
  request: NextRequest,
  deps: ShipyardLocalClusterResetDeps = defaultDeps,
) {
  try {
    await deps.requireActor(request)

    if (deps.env.ENABLE_LOCAL_COMMAND_EXECUTION !== "true") {
      return provisioningBlockedResponse()
    }

    const body = asRecord(await request.json().catch(() => ({})))
    if (!parseConfirmation(body)) {
      return NextResponse.json(
        { error: "Cluster reset requires body.confirm=\"reset-cluster\"." },
        { status: 400 },
      )
    }

    const clusterName =
      asNonEmptyString(body.clusterName)
      || asNonEmptyString(deps.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME)
      || DEFAULT_CLUSTER_NAME

    if (!isValidClusterName(clusterName)) {
      return NextResponse.json(
        {
          error:
            "clusterName is invalid. Use letters, numbers, dots, underscores, or hyphens.",
        },
        { status: 400 },
      )
    }

    const missingCommands = ["kind", "kubectl"].filter((command) => !deps.commandExists(command))
    if (missingCommands.length > 0) {
      return toolsMissingResponse(missingCommands)
    }

    const kubeContext = `kind-${clusterName}`
    const commands = [
      `kind delete cluster --name ${clusterName}`,
      `kind create cluster --name ${clusterName}`,
      `kubectl config use-context ${kubeContext}`,
      `kubectl --context ${kubeContext} get nodes`,
    ]

    const deleteResult = await deps.runCommand(
      "kind",
      ["delete", "cluster", "--name", clusterName],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
    )
    const deletedCluster = deleteResult.ok
    if (!deleteResult.ok && !isKindDeleteNoClusterError(deleteResult)) {
      return provisioningFailedResponse({
        error: "Failed to delete existing kind cluster.",
        suggestedCommands: commands,
        commandOutputTail: outputTail(deleteResult),
      })
    }

    const createResult = await deps.runCommand(
      "kind",
      ["create", "cluster", "--name", clusterName],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
    )
    if (!createResult.ok) {
      return provisioningFailedResponse({
        error: "Failed to create kind cluster.",
        suggestedCommands: commands,
        commandOutputTail: outputTail(createResult),
      })
    }

    const useContextResult = await deps.runCommand(
      "kubectl",
      ["config", "use-context", kubeContext],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
    )
    if (!useContextResult.ok) {
      return provisioningFailedResponse({
        error: "Failed to switch kubectl context to reset cluster.",
        suggestedCommands: commands,
        commandOutputTail: outputTail(useContextResult),
      })
    }

    const nodesResult = await deps.runCommand(
      "kubectl",
      ["--context", kubeContext, "get", "nodes"],
      { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
    )
    if (!nodesResult.ok) {
      return provisioningFailedResponse({
        error: "Cluster reset completed, but node readiness check failed.",
        suggestedCommands: commands,
        commandOutputTail: outputTail(nodesResult),
      })
    }

    return NextResponse.json({
      clusterName,
      kubeContext,
      deletedCluster,
      createdCluster: true,
      commands,
      checks: {
        contextSelected: true,
        nodesListed: true,
      },
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error resetting Ship Yard local cluster:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostShipyardLocalClusterReset(request)
}
