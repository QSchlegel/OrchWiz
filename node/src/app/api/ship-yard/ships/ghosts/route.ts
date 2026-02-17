import { NextRequest, NextResponse } from "next/server"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { execFile as execFileCallback } from "node:child_process"
import { promisify } from "node:util"
import { prisma } from "@/lib/prisma"
import type { DeploymentProfile } from "@/lib/deployment/profile"
import { defaultInfrastructureConfig } from "@/lib/deployment/profile"
import { AccessControlError } from "@/lib/security/access-control"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DEPLOYMENT_PROFILE_VALUES = new Set<DeploymentProfile>([
  "local_starship_build",
  "cloud_shipyard",
])

const DEFAULT_KUBECTL_COMMAND = "kubectl"
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000
const MAX_OUTPUT_CHARS = 8_000
const execFileAsync = promisify(execFileCallback)

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

interface ShipInfraRecord {
  deploymentProfile: DeploymentProfile
  namespace: string
  kubeContext: string
}

interface GhostNamespace {
  deploymentProfile: DeploymentProfile
  namespace: string
  kubeContext: string
  reason: "no_active_ship_records" | "namespace_not_registered"
}

interface DeleteGhostNamespaceResult {
  namespace: string
  deploymentProfile: DeploymentProfile
  kubeContext: string
  ok: boolean
  error?: string
}

interface GhostDeps {
  requireActor: (request: NextRequest) => Promise<ShipyardRequestActor>
  listActiveShipInfra: (
    profiles: DeploymentProfile[]
  ) => Promise<ShipInfraRecord[]>
  env: NodeJS.ProcessEnv
  commandExists: (command: string) => boolean
  runCommand: (
    command: string,
    args: string[],
    options?: CommandOptions,
  ) => Promise<CommandResult>
}

const defaultDeps: GhostDeps = {
  requireActor: async (request) => requireShipyardRequestActor(request),
  listActiveShipInfra: async (profiles) => {
    const where = {
      deploymentType: "ship" as const,
      ...(profiles.length > 0 ? { deploymentProfile: { in: profiles } } : {}),
    }

    const records = await prisma.agentDeployment.findMany({
      where,
      select: {
        deploymentProfile: true,
        config: true,
      },
    })

    return records.map((record) => {
      const defaults = defaultInfrastructureConfig(record.deploymentProfile)
      const parsedConfig = asRecord(record.config)
      const infrastructure = asRecord(parsedConfig.infrastructure)

      return {
        deploymentProfile: record.deploymentProfile,
        namespace:
          asNonEmptyString(infrastructure.namespace)
          || defaults.namespace,
        kubeContext:
          asNonEmptyString(infrastructure.kubeContext)
          || defaults.kubeContext,
      }
    })
  },
  env: process.env,
  commandExists: (command) => {
    const pathValue = process.env.PATH || ""
    const candidates = pathValue
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)

    for (const segment of candidates) {
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
  },
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

function asDeploymentProfile(raw: unknown): DeploymentProfile | null {
  if (typeof raw !== "string") {
    return null
  }
  const trimmed = raw.trim()
  return DEPLOYMENT_PROFILE_VALUES.has(trimmed as DeploymentProfile)
    ? trimmed as DeploymentProfile
    : null
}

function parseProfileFilter(raw: string | null): { ok: true; profiles: DeploymentProfile[] } | { ok: false; error: string } {
  const trimmed = asNonEmptyString(raw)
  if (!trimmed) {
    return {
      ok: true,
      profiles: [...DEPLOYMENT_PROFILE_VALUES],
    }
  }

  const profile = asDeploymentProfile(trimmed)
  if (!profile) {
    return {
      ok: false,
      error: "deploymentProfile must be one of: local_starship_build, cloud_shipyard",
    }
  }

  return {
    ok: true,
    profiles: [profile],
  }
}

function parseConfirmation(url: URL): string | null {
  const confirmation = asNonEmptyString(url.searchParams.get("confirm"))
  if (confirmation === "delete-ghost-ships") {
    return null
  }
  return "Cleanup requires `confirm=delete-ghost-ships` query parameter."
}

function getRequestSearchParams(request: NextRequest): URLSearchParams {
  const nextUrl = (request as { nextUrl?: { searchParams?: URLSearchParams } }).nextUrl
  if (nextUrl?.searchParams) {
    return nextUrl.searchParams
  }
  return new URL(request.url).searchParams
}

function outputTail(result: CommandResult): string {
  const combined = [result.stdout || "", result.stderr || "", result.error || ""].filter(Boolean).join("\n").trim()
  if (combined.length <= MAX_OUTPUT_CHARS) {
    return combined
  }
  return combined.slice(-MAX_OUTPUT_CHARS)
}

function missingKubectlResponse() {
  return NextResponse.json(
    {
      error: "Missing required command for cluster inspection.",
      code: "SHIP_GHOST_CLEANUP_TOOLS_MISSING",
      details: {
        missingCommands: [DEFAULT_KUBECTL_COMMAND],
        suggestedCommands: [
          "Install kubectl and retry ghost ship scan/cleanup.",
        ],
      },
    },
    { status: 422 },
  )
}

function blockedResponse() {
  return NextResponse.json(
    {
      error:
        "Local command execution is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true to run ghost-ship inspection and cleanup.",
      code: "SHIP_GHOST_CLEANUP_BLOCKED",
      details: {
        suggestedCommands: [
          "ENABLE_LOCAL_COMMAND_EXECUTION=true",
          "Retry after enabling command execution.",
        ],
      },
    },
    { status: 422 },
  )
}

function provisionFailureResponse(args: {
  operation: string
  error: string
  commandOutputTail: string
}) {
  return NextResponse.json(
    {
      error: `Failed to ${args.operation} shipyard ghost namespace scan.`,
      code: "SHIP_GHOST_CLEANUP_FAILED",
      details: {
        operation: args.operation,
      },
      metadata: {
        commandOutputTail: args.commandOutputTail,
      },
    },
    { status: 422 },
  )
}

function inferProfileFromNamespaceName(namespace: string): DeploymentProfile | null {
  if (namespace === defaultInfrastructureConfig("local_starship_build").namespace) {
    return "local_starship_build"
  }

  if (namespace === defaultInfrastructureConfig("cloud_shipyard").namespace) {
    return "cloud_shipyard"
  }

  return null
}

function normalizeKubeNamespaceList(raw: string): Array<{ namespace: string; profile: DeploymentProfile }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return []
  }

  const items = Array.isArray((parsed as { items?: unknown }).items)
    ? ((parsed as { items?: unknown }).items as unknown[])
    : []

  const results: Array<{ namespace: string; profile: DeploymentProfile }> = []
  for (const item of items) {
    const metadata = asRecord(asRecord(item).metadata)
    const namespace = asNonEmptyString(metadata.name)
    if (!namespace) {
      continue
    }

    if (asNonEmptyString(metadata.labels && (metadata.labels as Record<string, unknown>)["app.kubernetes.io/part-of"]) !== "orchwiz") {
      continue
    }

    const labels = asRecord(metadata.labels)
    const profileLabel = asDeploymentProfile(labels["orchwiz/profile"])
    const profile = profileLabel || inferProfileFromNamespaceName(namespace)
    if (!profile) {
      continue
    }

    results.push({ namespace, profile })
  }

  return results
}

function buildProfileContextMap(records: ShipInfraRecord[], profiles: DeploymentProfile[]): {
  activeNamespacesByProfile: Map<DeploymentProfile, Set<string>>
  contextsByProfile: Map<DeploymentProfile, Set<string>>
} {
  const activeNamespacesByProfile = new Map<DeploymentProfile, Set<string>>()
  const contextsByProfile = new Map<DeploymentProfile, Set<string>>()

  for (const profile of profiles) {
    const defaults = defaultInfrastructureConfig(profile)
    activeNamespacesByProfile.set(profile, new Set<string>())
    contextsByProfile.set(profile, new Set([defaults.kubeContext]))
  }

  for (const record of records) {
    if (!profiles.includes(record.deploymentProfile)) {
      continue
    }

    const activeNamespaces = activeNamespacesByProfile.get(record.deploymentProfile)
    const contexts = contextsByProfile.get(record.deploymentProfile)
    if (!activeNamespaces || !contexts) {
      continue
    }

    activeNamespaces.add(record.namespace)
    contexts.add(record.kubeContext)
  }

  return { activeNamespacesByProfile, contextsByProfile }
}

async function listGhostNamespaces(args: {
  profiles: DeploymentProfile[]
  activeShipInfra: ShipInfraRecord[]
  listCommand: (kubeContext: string) => Promise<Array<{ namespace: string; profile: DeploymentProfile }>>
}): Promise<GhostNamespace[]> {
  const { profiles, activeShipInfra, listCommand } = args
  const { activeNamespacesByProfile, contextsByProfile } = buildProfileContextMap(
    activeShipInfra,
    profiles,
  )

  const ghostNamespaces: GhostNamespace[] = []

  for (const profile of profiles) {
    const activeNamespaces = activeNamespacesByProfile.get(profile) || new Set<string>()
    const contexts = contextsByProfile.get(profile)
    if (!contexts || contexts.size === 0) {
      continue
    }

    for (const context of contexts) {
      const listed = await listCommand(context)
      for (const entry of listed) {
        if (entry.profile !== profile) {
          continue
        }

        if (activeNamespaces.has(entry.namespace)) {
          continue
        }

        ghostNamespaces.push({
          deploymentProfile: profile,
          namespace: entry.namespace,
          kubeContext: context,
          reason: activeNamespaces.size === 0 ? "no_active_ship_records" : "namespace_not_registered",
        })
      }
    }
  }

  const deduped = new Map<string, GhostNamespace>()
  for (const ghost of ghostNamespaces) {
    deduped.set(`${ghost.kubeContext}::${ghost.deploymentProfile}::${ghost.namespace}`, ghost)
  }

  return [...deduped.values()]
}

export async function handleGetShipyardGhostShips(
  request: NextRequest,
  deps: GhostDeps = defaultDeps,
) {
  try {
    await deps.requireActor(request)

    if (deps.env.ENABLE_LOCAL_COMMAND_EXECUTION !== "true") {
      return blockedResponse()
    }

    const profileFilter = parseProfileFilter(
      getRequestSearchParams(request).get("deploymentProfile"),
    )
    if (!profileFilter.ok) {
      return NextResponse.json({ error: profileFilter.error }, { status: 400 })
    }

    if (!deps.commandExists(DEFAULT_KUBECTL_COMMAND)) {
      return missingKubectlResponse()
    }

    const shipInfra = await deps.listActiveShipInfra(profileFilter.profiles)

    const listCommand = async (kubeContext: string): Promise<Array<{ namespace: string; profile: DeploymentProfile }>> => {
      const listResult = await deps.runCommand(
        DEFAULT_KUBECTL_COMMAND,
        [
          "get",
          "namespaces",
          "-l",
          "app.kubernetes.io/part-of=orchwiz",
          "--context",
          kubeContext,
          "-o",
          "json",
        ],
        { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
      )

      if (!listResult.ok) {
        throw new Error(listResult.error || listResult.stderr || "Failed to list namespaces")
      }

      return normalizeKubeNamespaceList(listResult.stdout)
    }

    const ghosts = await listGhostNamespaces({
      profiles: profileFilter.profiles,
      activeShipInfra: shipInfra,
      listCommand,
    })

    return NextResponse.json({
      profiles: profileFilter.profiles,
      ghosts,
      ghostCount: ghosts.length,
      matchedCount: profileFilter.profiles.length,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof Error && error.message.includes("Failed to list namespaces")) {
      return provisionFailureResponse({
        operation: "inspect",
        error: error.message,
        commandOutputTail: outputTail({
          ok: false,
          stdout: "",
          stderr: error.message,
          exitCode: null,
          error: error.message,
        }),
      })
    }

    console.error("Error scanning shipyard ghost namespaces:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handleDeleteShipyardGhostShips(
  request: NextRequest,
  deps: GhostDeps = defaultDeps,
) {
  try {
    const url = new URL(request.url)
    await deps.requireActor(request)

    const confirmationError = parseConfirmation(url)
    if (confirmationError) {
      return NextResponse.json({ error: confirmationError }, { status: 400 })
    }

    if (deps.env.ENABLE_LOCAL_COMMAND_EXECUTION !== "true") {
      return blockedResponse()
    }

    const profileFilter = parseProfileFilter(url.searchParams.get("deploymentProfile"))
    if (!profileFilter.ok) {
      return NextResponse.json({ error: profileFilter.error }, { status: 400 })
    }

    if (!deps.commandExists(DEFAULT_KUBECTL_COMMAND)) {
      return missingKubectlResponse()
    }

    const shipInfra = await deps.listActiveShipInfra(profileFilter.profiles)

    const listCommand = async (kubeContext: string): Promise<Array<{ namespace: string; profile: DeploymentProfile }>> => {
      const listResult = await deps.runCommand(
        DEFAULT_KUBECTL_COMMAND,
        [
          "get",
          "namespaces",
          "-l",
          "app.kubernetes.io/part-of=orchwiz",
          "--context",
          kubeContext,
          "-o",
          "json",
        ],
        { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
      )
      if (!listResult.ok) {
        throw new Error(listResult.error || listResult.stderr || "Failed to list namespaces")
      }
      return normalizeKubeNamespaceList(listResult.stdout)
    }

    const ghosts = await listGhostNamespaces({
      profiles: profileFilter.profiles,
      activeShipInfra: shipInfra,
      listCommand,
    })

    if (ghosts.length === 0) {
      return NextResponse.json({
        matchedCount: profileFilter.profiles.length,
        ghosts,
        ghostCount: 0,
        deletedCount: 0,
        deletedNamespaces: [],
        failedDeletions: [],
        allDeleted: true,
      })
    }

    const deletedNamespaces: DeleteGhostNamespaceResult[] = []
    const failedDeletions: DeleteGhostNamespaceResult[] = []

    for (const ghost of ghosts) {
      const deleteResult = await deps.runCommand(
        DEFAULT_KUBECTL_COMMAND,
        [
          "delete",
          "namespace",
          ghost.namespace,
          "--context",
          ghost.kubeContext,
          "--ignore-not-found=true",
        ],
        { timeoutMs: DEFAULT_COMMAND_TIMEOUT_MS },
      )

      if (deleteResult.ok) {
        deletedNamespaces.push({
          ...ghost,
          ok: true,
        })
      } else {
        failedDeletions.push({
          ...ghost,
          ok: false,
          error: deleteResult.error || outputTail(deleteResult),
        })
      }
    }

    const allDeleted = failedDeletions.length === 0

    return NextResponse.json({
      matchedCount: profileFilter.profiles.length,
      ghostCount: ghosts.length,
      deletedCount: deletedNamespaces.length,
      deletedNamespaces,
      failedDeletions,
      allDeleted,
    }, { status: allDeleted ? 200 : 422 })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof Error && error.message.includes("Failed to list namespaces")) {
      return provisionFailureResponse({
        operation: "detect",
        error: error.message,
        commandOutputTail: outputTail({
          ok: false,
          stdout: "",
          stderr: error.message,
          exitCode: null,
          error: error.message,
        }),
      })
    }

    console.error("Error cleaning shipyard ghost namespaces:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetShipyardGhostShips(request)
}

export async function DELETE(request: NextRequest) {
  return handleDeleteShipyardGhostShips(request)
}
