import { execFile as execFileCallback } from "node:child_process"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { rm } from "node:fs/promises"
import { delimiter, join, resolve } from "node:path"
import { promisify } from "node:util"
import {
  isLocalDeploymentProfile,
  normalizeInfrastructureInConfig,
  type DeploymentProfile,
  type InfrastructureKind,
} from "@/lib/deployment/profile"
import type { ManagedTunnelRuntimeMetadata } from "@/lib/shipyard/cloud/tunnel-manager"
import { stopManagedTunnel, tunnelDirectory } from "@/lib/shipyard/cloud/tunnel-manager"
import { prisma } from "@/lib/prisma"

const execFileAsync = promisify(execFileCallback)

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/u
const MAX_OUTPUT_CHARS = 8_000
const DEFAULT_TERRAFORM_TIMEOUT_MS = 20 * 60_000

// Avoid concurrent terraform destroys racing when multiple ship deletions reference the same env dir.
const terraformDestroyLocks = new Map<string, Promise<void>>()

interface CommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  exitCode: number | null
}

export interface ShipyardInfraTeardownTarget {
  shipId: string
  userId: string
  deploymentProfile: DeploymentProfile
  config: unknown
  metadata: unknown
  shipyardSshTunnels?: Array<{
    id: string
    pid: number | null
    pidFile: string | null
  }>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export function isShipyardManagedDeployment(metadata: unknown): boolean {
  const record = asRecord(metadata)
  return record.shipYard === true
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

function commandExecutionEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.ENABLE_LOCAL_COMMAND_EXECUTION?.trim().toLowerCase()
  if (!raw) return false
  return raw === "1" || raw === "true" || raw === "yes"
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

async function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      timeout: options.timeoutMs ?? DEFAULT_TERRAFORM_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
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
      error: commandError.message,
      exitCode: typeof commandError.code === "number" ? commandError.code : null,
    }
  }
}

function repoRootFromCwd(): string {
  const override = process.env.ORCHWIZ_REPO_ROOT?.trim()
  if (override) {
    return resolve(override)
  }

  const cwd = resolve(process.cwd())
  const parent = resolve(cwd, "..")
  const candidates = [cwd, parent]

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "infra/terraform"))) {
      return candidate
    }
  }

  return parent
}

function sanitizeWorkspaceRelativePath(pathValue: string): string {
  const rawPath = pathValue.trim()
  if (!rawPath) {
    throw new Error("Path is required.")
  }

  if (rawPath.includes("\u0000")) {
    throw new Error("Invalid path.")
  }

  if (rawPath.startsWith("/") || rawPath.startsWith("\\") || WINDOWS_ABSOLUTE_PATH_REGEX.test(rawPath)) {
    throw new Error("Absolute paths are not allowed.")
  }

  const normalizedSlashes = rawPath.replaceAll("\\", "/")
  const trimmed = normalizedSlashes.replace(/^\.\/+/u, "").replace(/\/+$/u, "")
  const segments = trimmed.split("/")

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Path traversal is not allowed.")
  }

  return segments.join("/")
}

function extractShipyardTunnelMetadata(metadata: unknown): ManagedTunnelRuntimeMetadata | null {
  const root = asRecord(metadata)
  const tunnel = asRecord(root.tunnel)
  const pid = typeof tunnel.pid === "number" ? tunnel.pid : null
  const pidFile = typeof tunnel.pidFile === "string" ? tunnel.pidFile : null
  const controlSocket = typeof tunnel.controlSocket === "string" ? tunnel.controlSocket : null
  const keyFilePath = typeof tunnel.keyFilePath === "string" ? tunnel.keyFilePath : null

  if (!pid && !pidFile) {
    return null
  }

  return {
    pid: pid || 0,
    pidFile: pidFile || "",
    controlSocket: controlSocket || "",
    keyFilePath: keyFilePath || "",
    tunnelDir: "",
  }
}

const KIND_CLUSTER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u
const DEFAULT_KIND_CLUSTER_NAME = "orchwiz"
const DEFAULT_MINIKUBE_PROFILE = "minikube"

function kindClusterNameFromContext(kubeContext: string): string {
  const trimmed = kubeContext.trim()
  if (trimmed.startsWith("kind-") && trimmed.length > "kind-".length) {
    return trimmed.slice("kind-".length)
  }
  return trimmed || DEFAULT_KIND_CLUSTER_NAME
}

function isValidClusterName(value: string): boolean {
  return KIND_CLUSTER_NAME_REGEX.test(value)
}

function isKindDeleteNoClusterError(result: CommandResult): boolean {
  const raw = [result.stdout, result.stderr, result.error || ""].join("\n").toLowerCase()
  return raw.includes("no kind clusters found")
}

async function destroyLocalClusterBestEffort(args: {
  userId: string
  shipId: string
  deploymentProfile: DeploymentProfile
  config: unknown
}): Promise<void> {
  if (!commandExecutionEnabled(process.env)) {
    return
  }
  if (!isLocalDeploymentProfile(args.deploymentProfile)) {
    return
  }

  let infrastructure: { kind: InfrastructureKind; kubeContext: string; terraformEnvDir: string }
  try {
    const normalized = normalizeInfrastructureInConfig(args.deploymentProfile, args.config)
    infrastructure = normalized.infrastructure
  } catch {
    return
  }

  if (infrastructure.kind !== "kind" && infrastructure.kind !== "minikube") {
    return
  }

  // Do not delete the cluster if other ships still use the same terraform env (same cluster).
  try {
    const otherShips = await prisma.agentDeployment.count({
      where: {
        userId: args.userId,
        deploymentType: "ship",
        id: { not: args.shipId },
        deploymentProfile: args.deploymentProfile,
        config: {
          path: ["infrastructure", "terraformEnvDir"],
          equals: infrastructure.terraformEnvDir,
        },
      },
    })
    if (otherShips > 0) {
      console.info("[shipyard] local cluster teardown skipped: other ships still use this cluster", {
        shipId: args.shipId,
        userId: args.userId,
        terraformEnvDir: infrastructure.terraformEnvDir,
        otherShips,
      })
      return
    }
  } catch (error) {
    console.warn("[shipyard] local cluster teardown skipped: could not check other ships", {
      shipId: args.shipId,
      userId: args.userId,
      error: (error as Error).message,
    })
    return
  }

  if (infrastructure.kind === "kind") {
    if (!commandExistsOnPath("kind")) {
      return
    }
    const clusterName =
      process.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim()
      || kindClusterNameFromContext(infrastructure.kubeContext)
    if (!isValidClusterName(clusterName)) {
      console.warn("[shipyard] local cluster teardown skipped: invalid kind cluster name", {
        shipId: args.shipId,
        clusterName,
      })
      return
    }
    const deleteResult = await runCommand(
      "kind",
      ["delete", "cluster", "--name", clusterName],
      { timeoutMs: 120_000 },
    )
    if (!deleteResult.ok && !isKindDeleteNoClusterError(deleteResult)) {
      console.error("[shipyard] kind delete cluster failed during ship teardown", {
        shipId: args.shipId,
        userId: args.userId,
        clusterName,
        outputTail: outputTail(deleteResult),
      })
      return
    }
    console.info("[shipyard] kind cluster deleted during ship teardown", {
      shipId: args.shipId,
      userId: args.userId,
      clusterName,
    })
    return
  }

  // minikube
  if (!commandExistsOnPath("minikube")) {
    return
  }
  const profile =
    infrastructure.kubeContext?.trim() && infrastructure.kubeContext !== "minikube"
      ? infrastructure.kubeContext
      : DEFAULT_MINIKUBE_PROFILE
  const deleteResult = await runCommand(
    "minikube",
    ["delete", "--profile", profile],
    { timeoutMs: 120_000 },
  )
  if (!deleteResult.ok) {
    console.error("[shipyard] minikube delete failed during ship teardown", {
      shipId: args.shipId,
      userId: args.userId,
      profile,
      outputTail: outputTail(deleteResult),
    })
    return
  }
  console.info("[shipyard] minikube cluster deleted during ship teardown", {
    shipId: args.shipId,
    userId: args.userId,
    profile,
  })
}

async function destroyTerraformBestEffort(args: {
  userId: string
  shipId: string
  deploymentProfile: DeploymentProfile
  config: unknown
}): Promise<void> {
  if (!commandExecutionEnabled(process.env)) {
    console.info("[shipyard] infra teardown skipped: ENABLE_LOCAL_COMMAND_EXECUTION is disabled", {
      shipId: args.shipId,
      userId: args.userId,
      deploymentProfile: args.deploymentProfile,
    })
    return
  }

  const normalized = normalizeInfrastructureInConfig(args.deploymentProfile, args.config)
  const infrastructure = normalized.infrastructure

  let terraformEnvDirRelative: string
  try {
    terraformEnvDirRelative = sanitizeWorkspaceRelativePath(infrastructure.terraformEnvDir)
  } catch (error) {
    console.warn("[shipyard] infra teardown skipped: invalid terraformEnvDir", {
      shipId: args.shipId,
      userId: args.userId,
      terraformEnvDir: infrastructure.terraformEnvDir,
      error: (error as Error).message,
    })
    return
  }

  const repoRoot = repoRootFromCwd()
  const terraformEnvDirAbsolute = resolve(repoRoot, terraformEnvDirRelative)
  const terraformTfvarsAbsolute = resolve(terraformEnvDirAbsolute, "terraform.tfvars")

  if (!existsSync(terraformEnvDirAbsolute)) {
    console.warn("[shipyard] infra teardown skipped: terraform env dir missing", {
      shipId: args.shipId,
      userId: args.userId,
      terraformEnvDirRelative,
      repoRoot,
    })
    return
  }

  if (!commandExistsOnPath("terraform")) {
    console.warn("[shipyard] infra teardown skipped: terraform not found on PATH", {
      shipId: args.shipId,
      userId: args.userId,
      terraformEnvDirRelative,
    })
    return
  }

  const destroyKey = `${args.userId}:${args.deploymentProfile}:${terraformEnvDirAbsolute}`
  const existingDestroy = terraformDestroyLocks.get(destroyKey)
  if (existingDestroy) {
    await existingDestroy.catch(() => undefined)
    return
  }

  const destroyTask = (async () => {
    let otherShips = 0
    try {
      otherShips = await prisma.agentDeployment.count({
        where: {
          userId: args.userId,
          deploymentType: "ship",
          id: {
            not: args.shipId,
          },
          deploymentProfile: args.deploymentProfile,
          config: {
            path: ["infrastructure", "terraformEnvDir"],
            equals: infrastructure.terraformEnvDir,
          },
        },
      })
    } catch (error) {
      // Fail closed: if we can't determine sharing risk, don't destroy potentially shared infra.
      console.warn("[shipyard] infra teardown skipped: unable to check terraform env dir references", {
        shipId: args.shipId,
        userId: args.userId,
        terraformEnvDirRelative,
        error: (error as Error).message,
      })
      return
    }

    if (otherShips > 0) {
      console.info("[shipyard] infra teardown skipped: terraform env dir still referenced by other ships", {
        shipId: args.shipId,
        userId: args.userId,
        terraformEnvDirRelative,
        otherShips,
      })
      return
    }

    const initResult = await runCommand(
      "terraform",
      [`-chdir=${terraformEnvDirAbsolute}`, "init", "-backend=false"],
      { timeoutMs: DEFAULT_TERRAFORM_TIMEOUT_MS },
    )
    if (!initResult.ok) {
      console.warn("[shipyard] terraform init failed during infra teardown", {
        shipId: args.shipId,
        userId: args.userId,
        terraformEnvDirRelative,
        outputTail: outputTail(initResult),
      })
      // Continue to destroy anyway; init failures can be non-fatal if already initialized.
    }

    const destroyArgs = [`-chdir=${terraformEnvDirAbsolute}`, "destroy", "-auto-approve"]
    if (existsSync(terraformTfvarsAbsolute)) {
      destroyArgs.push("-var-file=terraform.tfvars")
    }

    const destroyResult = await runCommand("terraform", destroyArgs, { timeoutMs: DEFAULT_TERRAFORM_TIMEOUT_MS })
    if (!destroyResult.ok) {
      console.error("[shipyard] terraform destroy failed during infra teardown", {
        shipId: args.shipId,
        userId: args.userId,
        terraformEnvDirRelative,
        outputTail: outputTail(destroyResult),
      })
      return
    }

    console.info("[shipyard] infra teardown terraform destroy complete", {
      shipId: args.shipId,
      userId: args.userId,
      terraformEnvDirRelative,
      outputTail: outputTail(destroyResult),
    })
  })()

  terraformDestroyLocks.set(destroyKey, destroyTask)
  try {
    await destroyTask
  } finally {
    terraformDestroyLocks.delete(destroyKey)
  }
}

async function cleanupManagedTunnelBestEffort(args: { shipId: string; userId: string; metadata: unknown }): Promise<void> {
  const tunnel = extractShipyardTunnelMetadata(args.metadata)
  if (!tunnel) {
    return
  }

  const pid = tunnel.pid && tunnel.pid > 0 ? tunnel.pid : null
  const pidFile = tunnel.pidFile || null

  await stopManagedTunnel({ pid, pidFile }).catch((error) => {
    console.warn("[shipyard] tunnel stop failed during ship teardown", {
      shipId: args.shipId,
      userId: args.userId,
      error: (error as Error).message,
    })
  })

  // Best-effort remove tunnel runtime files.
  const dir = tunnelDirectory(`shipyard-${args.shipId}`)
  await rm(dir, { recursive: true, force: true }).catch(() => undefined)
}

async function cleanupShipyardDbTunnelsBestEffort(args: {
  shipId: string
  userId: string
  tunnels?: Array<{ id: string; pid: number | null; pidFile: string | null }>
}): Promise<void> {
  const tunnels = args.tunnels
    || (await prisma.shipyardSshTunnel.findMany({
      where: {
        userId: args.userId,
        deploymentId: args.shipId,
      },
      select: {
        id: true,
        pid: true,
        pidFile: true,
      },
    }))

  if (tunnels.length === 0) {
    return
  }

  for (const tunnel of tunnels) {
    await stopManagedTunnel({
      pid: tunnel.pid,
      pidFile: tunnel.pidFile,
    }).catch(() => undefined)

    await rm(tunnelDirectory(tunnel.id), { recursive: true, force: true }).catch(() => undefined)

    await prisma.shipyardSshTunnel.delete({
      where: {
        id: tunnel.id,
      },
    }).catch(() => undefined)
  }
}

export async function teardownShipyardInfraBestEffort(target: ShipyardInfraTeardownTarget): Promise<void> {
  if (!isShipyardManagedDeployment(target.metadata)) {
    return
  }

  await destroyTerraformBestEffort({
    userId: target.userId,
    shipId: target.shipId,
    deploymentProfile: target.deploymentProfile,
    config: target.config,
  })

  // For local (kind/minikube), destroy the cluster so the control plane container is discarded.
  await destroyLocalClusterBestEffort({
    userId: target.userId,
    shipId: target.shipId,
    deploymentProfile: target.deploymentProfile,
    config: target.config,
  })

  // Stop tunnels after terraform so destroy can still access the cluster if the tunnel is required.
  await cleanupManagedTunnelBestEffort({
    shipId: target.shipId,
    userId: target.userId,
    metadata: target.metadata,
  })

  await cleanupShipyardDbTunnelsBestEffort({
    shipId: target.shipId,
    userId: target.userId,
    tunnels: target.shipyardSshTunnels,
  })
}

/**
 * Runs infra teardown for a ship (terraform destroy, kind/minikube delete, tunnels).
 * Returns a promise so callers can await to ensure teardown completes before responding.
 * Errors are logged and not rethrown so the request handler is not crashed.
 */
export function queueShipyardInfraTeardown(target: ShipyardInfraTeardownTarget): Promise<void> {
  return teardownShipyardInfraBestEffort(target).catch((error) => {
    console.error("[shipyard] unexpected infra teardown error", {
      shipId: target.shipId,
      userId: target.userId,
      error: (error as Error).message,
    })
  })
}

export interface CleanupFailedLocalLaunchArgs {
  deploymentId: string
  userId: string
  deploymentProfile: DeploymentProfile
  config: unknown
  metadata?: Record<string, unknown>
}

/**
 * Best-effort cleanup after a local ship launch fails (e.g. Ansible/Terraform timeout).
 * Runs Terraform destroy to clear partial apply state, and deletes the Kind cluster
 * only if it was created during this launch (kindClusterAutoCreated).
 */
export async function cleanupFailedLocalLaunch(args: CleanupFailedLocalLaunchArgs): Promise<void> {
  if (!commandExecutionEnabled(process.env)) {
    return
  }
  if (!isLocalDeploymentProfile(args.deploymentProfile)) {
    return
  }

  let infrastructure: { kind: InfrastructureKind; kubeContext: string; terraformEnvDir: string }
  try {
    const normalized = normalizeInfrastructureInConfig(args.deploymentProfile, args.config)
    infrastructure = normalized.infrastructure
  } catch {
    return
  }

  // Terraform destroy (reuses same other-ships check and locking as ship teardown).
  await destroyTerraformBestEffort({
    userId: args.userId,
    shipId: args.deploymentId,
    deploymentProfile: args.deploymentProfile,
    config: args.config,
  })

  // Delete Kind cluster only if we created it during this launch.
  const localAppImage = asRecord(args.metadata?.localAppImage)
  const kindClusterAutoCreated = localAppImage.kindClusterAutoCreated === true
  if (!kindClusterAutoCreated || infrastructure.kind !== "kind") {
    return
  }
  if (!commandExistsOnPath("kind")) {
    return
  }
  const clusterName =
    process.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim()
    || kindClusterNameFromContext(infrastructure.kubeContext)
  if (!isValidClusterName(clusterName)) {
    return
  }
  const deleteResult = await runCommand(
    "kind",
    ["delete", "cluster", "--name", clusterName],
    { timeoutMs: 120_000 },
  )
  if (!deleteResult.ok && !isKindDeleteNoClusterError(deleteResult)) {
    console.error("[shipyard] kind delete cluster failed during launch-failure cleanup", {
      deploymentId: args.deploymentId,
      userId: args.userId,
      clusterName,
      outputTail: outputTail(deleteResult),
    })
    return
  }
  console.info("[shipyard] kind cluster deleted during launch-failure cleanup", {
    deploymentId: args.deploymentId,
    userId: args.userId,
    clusterName,
  })
}
