import { execFile as execFileCallback } from "node:child_process"
import { existsSync, lstatSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import { promisify } from "node:util"
import type { CloudProviderConfig } from "@/lib/shipyard/cloud/types"
import {
  ensureManagedTunnel,
  type ManagedTunnelRuntimeMetadata,
} from "@/lib/shipyard/cloud/tunnel-manager"
import { commandExists } from "@/lib/shipyard/cloud/command-runtime"
import type { InfrastructureConfig, ProvisioningMode } from "@/lib/deployment/profile"

const execFileAsync = promisify(execFileCallback)
const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/u
const DEFAULT_TIMEOUT_MS = 900_000

const REQUIRED_COMMANDS = ["terraform", "ansible-playbook", "ssh", "autossh", "ssh-keygen"] as const

export type ShipyardCloudBootstrapErrorCode =
  | "CLOUD_PROVISIONING_BLOCKED"
  | "CLOUD_BOOTSTRAP_TOOLS_MISSING"
  | "CLOUD_BOOTSTRAP_CONFIG_MISSING"
  | "CLOUD_PROVISIONING_FAILED"
  | "CLOUD_CLUSTER_NOT_READY"
  | "CLOUD_TUNNEL_FAILED"

interface ShipyardCloudBootstrapFailureDetails {
  missingCommands?: string[]
  missingFiles?: string[]
  suggestedCommands?: string[]
  outputTail?: string
}

interface ShipyardCloudBootstrapFailure {
  ok: false
  expected: boolean
  code: ShipyardCloudBootstrapErrorCode
  error: string
  details?: ShipyardCloudBootstrapFailureDetails
  metadata?: Record<string, unknown>
}

interface ShipyardCloudBootstrapSuccess {
  ok: true
  metadata: Record<string, unknown>
}

export type ShipyardCloudBootstrapResult =
  | ShipyardCloudBootstrapFailure
  | ShipyardCloudBootstrapSuccess

export interface ShipyardCloudBootstrapInput {
  deploymentId: string
  provisioningMode: ProvisioningMode
  infrastructure: InfrastructureConfig
  cloudProvider: CloudProviderConfig
  sshPrivateKey: string
}

export interface CloudBootstrapCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  exitCode: number | null
}

export interface ShipyardCloudBootstrapRuntime {
  env: NodeJS.ProcessEnv
  cwd: string
  commandExists: (command: string) => boolean
  fileExists: (path: string) => boolean
  isDirectory: (path: string) => boolean
  runCommand: (
    command: string,
    args: string[],
    options?: {
      cwd?: string
      env?: NodeJS.ProcessEnv
      timeoutMs?: number
    },
  ) => Promise<CloudBootstrapCommandResult>
}

interface ResolvedCloudPaths {
  repoRoot: string
  terraformEnvDirRelative: string
  terraformEnvDirAbsolute: string
  terraformTfvarsRelative: string
  terraformTfvarsAbsolute: string
  ansibleInventoryRelative: string
  ansibleInventoryAbsolute: string
  ansiblePlaybookRelative: string
  ansiblePlaybookAbsolute: string
}

interface TerraformOutputShape {
  control_plane_public_ipv4?: {
    value?: unknown
  }
  control_plane_private_ipv4?: {
    value?: unknown
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry))
}

function outputTail(result: { stdout?: string; stderr?: string }): string {
  const combined = [result.stdout || "", result.stderr || ""].filter(Boolean).join("\n").trim()
  if (combined.length <= 8_000) return combined
  return combined.slice(-8_000)
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
  const trimmed = normalizedSlashes.replace(/^\.\/+/, "").replace(/\/+$/u, "")
  const segments = trimmed.split("/")

  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error("Path traversal is not allowed.")
  }

  return segments.join("/")
}

function toFailure(
  code: ShipyardCloudBootstrapErrorCode,
  error: string,
  options: {
    expected?: boolean
    details?: ShipyardCloudBootstrapFailureDetails
    metadata?: Record<string, unknown>
  } = {},
): ShipyardCloudBootstrapFailure {
  return {
    ok: false,
    expected: options.expected ?? true,
    code,
    error,
    ...(options.details ? { details: options.details } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  }
}

function defaultRuntime(): ShipyardCloudBootstrapRuntime {
  return {
    env: process.env,
    cwd: process.cwd(),
    commandExists: (command) => commandExists(command),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory()
      } catch {
        return false
      }
    },
    runCommand: async (command, args, options = {}) => {
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: options.cwd,
          env: options.env || process.env,
          timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
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
    },
  }
}

function repoRootFromRuntime(runtime: ShipyardCloudBootstrapRuntime): string {
  const override = runtime.env.ORCHWIZ_REPO_ROOT?.trim()
  if (override) {
    return resolve(override)
  }

  return resolve(runtime.cwd, "..")
}

function resolveCloudPaths(
  infrastructure: InfrastructureConfig,
  runtime: ShipyardCloudBootstrapRuntime,
): ShipyardCloudBootstrapFailure | { ok: true; paths: ResolvedCloudPaths } {
  let terraformEnvDirRelative: string
  let ansibleInventoryRelative: string
  let ansiblePlaybookRelative: string

  try {
    terraformEnvDirRelative = sanitizeWorkspaceRelativePath(infrastructure.terraformEnvDir)
    ansibleInventoryRelative = sanitizeWorkspaceRelativePath(infrastructure.ansibleInventory)
    ansiblePlaybookRelative = sanitizeWorkspaceRelativePath(infrastructure.ansiblePlaybook)
  } catch (error) {
    return toFailure(
      "CLOUD_BOOTSTRAP_CONFIG_MISSING",
      `Cloud infrastructure path configuration is invalid: ${(error as Error).message}`,
    )
  }

  const repoRoot = repoRootFromRuntime(runtime)
  const terraformEnvDirAbsolute = resolve(repoRoot, terraformEnvDirRelative)
  const terraformTfvarsRelative = `${terraformEnvDirRelative}/terraform.tfvars`
  const terraformTfvarsAbsolute = resolve(repoRoot, terraformTfvarsRelative)
  const ansibleInventoryAbsolute = resolve(repoRoot, ansibleInventoryRelative)
  const ansiblePlaybookAbsolute = resolve(repoRoot, ansiblePlaybookRelative)

  return {
    ok: true,
    paths: {
      repoRoot,
      terraformEnvDirRelative,
      terraformEnvDirAbsolute,
      terraformTfvarsRelative,
      terraformTfvarsAbsolute,
      ansibleInventoryRelative,
      ansibleInventoryAbsolute,
      ansiblePlaybookRelative,
      ansiblePlaybookAbsolute,
    },
  }
}

function commandExecutionEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.ENABLE_LOCAL_COMMAND_EXECUTION?.trim().toLowerCase()
  if (!raw) return false
  return raw === "1" || raw === "true" || raw === "yes"
}

function timeoutMs(env: NodeJS.ProcessEnv): number {
  const parsed = Number.parseInt(env.CLOUD_INFRA_COMMAND_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS
  }
  return parsed
}

function validateFiles(
  paths: ResolvedCloudPaths,
  runtime: ShipyardCloudBootstrapRuntime,
): ShipyardCloudBootstrapFailure | { ok: true } {
  const missingFiles: string[] = []

  if (!runtime.isDirectory(paths.terraformEnvDirAbsolute)) {
    missingFiles.push(paths.terraformEnvDirRelative)
  }

  if (!runtime.fileExists(paths.terraformTfvarsAbsolute)) {
    missingFiles.push(paths.terraformTfvarsRelative)
  }

  if (!runtime.fileExists(paths.ansibleInventoryAbsolute)) {
    missingFiles.push(paths.ansibleInventoryRelative)
  }

  if (!runtime.fileExists(paths.ansiblePlaybookAbsolute)) {
    missingFiles.push(paths.ansiblePlaybookRelative)
  }

  if (missingFiles.length === 0) {
    return { ok: true }
  }

  return toFailure(
    "CLOUD_BOOTSTRAP_CONFIG_MISSING",
    "Required cloud infrastructure files are missing.",
    {
      details: {
        missingFiles,
        suggestedCommands: [
          `mkdir -p ${paths.terraformEnvDirRelative}`,
          "Generate Terraform/Ansible files from Ship Yard Cloud Utility and retry launch.",
        ],
      },
      metadata: {
        repoRoot: paths.repoRoot,
      },
    },
  )
}

async function runProvisioning(args: {
  input: ShipyardCloudBootstrapInput
  paths: ResolvedCloudPaths
  runtime: ShipyardCloudBootstrapRuntime
}): Promise<ShipyardCloudBootstrapFailure | { ok: true; metadata: Record<string, unknown> }> {
  const commandTimeoutMs = timeoutMs(args.runtime.env)
  const metadata: Record<string, unknown> = {
    mode: "shipyard_cloud",
    cloudProvider: args.input.cloudProvider.provider,
    commands: [] as string[],
  }

  const runAndCheck = async (
    command: string,
    commandArgs: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
  ): Promise<ShipyardCloudBootstrapFailure | { ok: true; result: CloudBootstrapCommandResult }> => {
    const commandString = `${command} ${commandArgs.join(" ")}`
    ;(metadata.commands as string[]).push(commandString)

    const result = await args.runtime.runCommand(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: commandTimeoutMs,
    })

    if (!result.ok) {
      return toFailure(
        "CLOUD_PROVISIONING_FAILED",
        `Cloud provisioning command failed: ${commandString}`,
        {
          details: {
            outputTail: outputTail(result),
            suggestedCommands: [
              commandString,
              `terraform -chdir=${args.paths.terraformEnvDirRelative} plan -var-file=terraform.tfvars`,
              `ansible-playbook -i ${args.paths.ansibleInventoryRelative} ${args.paths.ansiblePlaybookRelative}`,
            ],
          },
        },
      )
    }

    return {
      ok: true,
      result,
    }
  }

  if (args.input.provisioningMode === "terraform_ansible" || args.input.provisioningMode === "terraform_only") {
    const terraformSteps: string[][] = [
      ["-chdir", args.paths.terraformEnvDirAbsolute, "init", "-backend=false"],
      [
        "-chdir",
        args.paths.terraformEnvDirAbsolute,
        "plan",
        "-out=tfplan",
        "-var-file=terraform.tfvars",
      ],
      ["-chdir", args.paths.terraformEnvDirAbsolute, "apply", "-auto-approve", "tfplan"],
    ]

    for (const stepArgs of terraformSteps) {
      const runResult = await runAndCheck("terraform", stepArgs)
      if (!runResult.ok) {
        return runResult
      }
    }
  }

  if (args.input.provisioningMode === "terraform_ansible" || args.input.provisioningMode === "ansible_only") {
    const env = {
      ...args.runtime.env,
      TF_DIR: args.paths.terraformEnvDirAbsolute,
      ORCHWIZ_NAMESPACE: args.input.infrastructure.namespace,
      KUBE_CONTEXT: args.input.infrastructure.kubeContext,
      INFRASTRUCTURE_KIND: args.input.infrastructure.kind,
      ORCHWIZ_APP_NAME: args.runtime.env.ORCHWIZ_APP_NAME || "orchwiz",
    }

    const runResult = await runAndCheck(
      "ansible-playbook",
      ["-i", args.paths.ansibleInventoryAbsolute, args.paths.ansiblePlaybookAbsolute],
      {
        env,
      },
    )
    if (!runResult.ok) {
      return runResult
    }
  }

  const clusterCheckResult = await args.runtime.runCommand(
    "kubectl",
    [
      "--context",
      args.input.infrastructure.kubeContext,
      "-n",
      args.input.infrastructure.namespace,
      "get",
      "pods",
      "--no-headers",
    ],
    {
      timeoutMs: commandTimeoutMs,
    },
  )

  if (!clusterCheckResult.ok) {
    return toFailure("CLOUD_CLUSTER_NOT_READY", "Kubernetes cluster readiness check failed.", {
      details: {
        outputTail: outputTail(clusterCheckResult),
        suggestedCommands: [
          `kubectl --context ${args.input.infrastructure.kubeContext} -n ${args.input.infrastructure.namespace} get pods`,
        ],
      },
    })
  }

  metadata.clusterReadyCheck = outputTail(clusterCheckResult)

  return {
    ok: true,
    metadata,
  }
}

async function ensureKubernetesApiTunnel(args: {
  input: ShipyardCloudBootstrapInput
  paths: ResolvedCloudPaths
  runtime: ShipyardCloudBootstrapRuntime
}): Promise<ShipyardCloudBootstrapFailure | { ok: true; metadata: ManagedTunnelRuntimeMetadata }> {
  if (!args.input.cloudProvider.tunnelPolicy.manage) {
    return toFailure("CLOUD_TUNNEL_FAILED", "Tunnel policy disabled unexpectedly for managed flow.", {
      expected: false,
    })
  }

  const outputResult = await args.runtime.runCommand(
    "terraform",
    ["-chdir", args.paths.terraformEnvDirAbsolute, "output", "-json"],
    {
      timeoutMs: timeoutMs(args.runtime.env),
    },
  )

  if (!outputResult.ok) {
    return toFailure("CLOUD_TUNNEL_FAILED", "Failed to read Terraform outputs for tunnel bootstrap.", {
      details: {
        outputTail: outputTail(outputResult),
        suggestedCommands: [`terraform -chdir=${args.paths.terraformEnvDirRelative} output -json`],
      },
    })
  }

  let parsedOutput: TerraformOutputShape = {}
  try {
    parsedOutput = JSON.parse(outputResult.stdout) as TerraformOutputShape
  } catch {
    return toFailure("CLOUD_TUNNEL_FAILED", "Terraform output is not valid JSON.", {
      details: {
        outputTail: outputTail(outputResult),
      },
    })
  }

  const controlPlanePublicIp = asStringArray(parsedOutput.control_plane_public_ipv4?.value)[0]
  const controlPlanePrivateIp = asStringArray(parsedOutput.control_plane_private_ipv4?.value)[0]

  if (!controlPlanePublicIp || !controlPlanePrivateIp) {
    return toFailure("CLOUD_TUNNEL_FAILED", "Terraform outputs do not include control-plane addresses.", {
      details: {
        suggestedCommands: [
          `terraform -chdir=${args.paths.terraformEnvDirRelative} output control_plane_public_ipv4`,
          `terraform -chdir=${args.paths.terraformEnvDirRelative} output control_plane_private_ipv4`,
        ],
      },
    })
  }

  const ensured = await ensureManagedTunnel({
    definition: {
      tunnelId: `shipyard-${args.input.deploymentId}`,
      localHost: "127.0.0.1",
      localPort: args.input.cloudProvider.tunnelPolicy.localPort,
      remoteHost: controlPlanePrivateIp,
      remotePort: 6443,
      sshHost: controlPlanePublicIp,
      sshPort: 22,
      sshUser: "root",
      privateKeyPem: args.input.sshPrivateKey,
    },
    metadata: {},
  })

  if (!ensured.health.healthy) {
    return toFailure("CLOUD_TUNNEL_FAILED", "Managed Kubernetes API tunnel is unhealthy after ensure.", {
      details: {
        suggestedCommands: [
          `autossh -M 0 -N -L 127.0.0.1:${args.input.cloudProvider.tunnelPolicy.localPort}:${controlPlanePrivateIp}:6443 root@${controlPlanePublicIp}`,
        ],
      },
      metadata: {
        health: ensured.health,
      },
    })
  }

  return {
    ok: true,
    metadata: ensured.metadata,
  }
}

export async function runShipyardCloudBootstrap(
  input: ShipyardCloudBootstrapInput,
  runtime: ShipyardCloudBootstrapRuntime = defaultRuntime(),
): Promise<ShipyardCloudBootstrapResult> {
  if (!commandExecutionEnabled(runtime.env)) {
    return toFailure(
      "CLOUD_PROVISIONING_BLOCKED",
      "Cloud provisioning is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true to enable Ship Yard cloud launch commands.",
      {
        details: {
          suggestedCommands: [
            "ENABLE_LOCAL_COMMAND_EXECUTION=true",
            "Retry launch from Ship Yard after enabling command execution.",
          ],
        },
      },
    )
  }

  const missingCommands = REQUIRED_COMMANDS.filter((command) => !runtime.commandExists(command))
  if (missingCommands.length > 0) {
    return toFailure("CLOUD_BOOTSTRAP_TOOLS_MISSING", "Required cloud provisioning tools are missing.", {
      details: {
        missingCommands,
        suggestedCommands: [
          "brew install terraform ansible autossh",
          "Ensure ssh and ssh-keygen are available on PATH.",
        ],
      },
    })
  }

  const pathsResult = resolveCloudPaths(input.infrastructure, runtime)
  if (!pathsResult.ok) {
    return pathsResult
  }

  const paths = pathsResult.paths
  const fileValidation = validateFiles(paths, runtime)
  if (!fileValidation.ok) {
    return fileValidation
  }

  const provisioningResult = await runProvisioning({
    input,
    paths,
    runtime,
  })
  if (!provisioningResult.ok) {
    return provisioningResult
  }

  let tunnelMetadata: ManagedTunnelRuntimeMetadata | null = null
  if (input.cloudProvider.tunnelPolicy.manage && input.cloudProvider.tunnelPolicy.target === "kubernetes_api") {
    const tunnelResult = await ensureKubernetesApiTunnel({
      input,
      paths,
      runtime,
    })

    if (!tunnelResult.ok) {
      return tunnelResult
    }

    tunnelMetadata = tunnelResult.metadata
  }

  return {
    ok: true,
    metadata: {
      ...provisioningResult.metadata,
      infrastructure: {
        terraformEnvDir: paths.terraformEnvDirRelative,
        ansibleInventory: paths.ansibleInventoryRelative,
        ansiblePlaybook: paths.ansiblePlaybookRelative,
      },
      ...(tunnelMetadata
        ? {
            tunnel: {
              pid: tunnelMetadata.pid,
              pidFile: tunnelMetadata.pidFile,
              controlSocket: tunnelMetadata.controlSocket,
              keyFilePath: tunnelMetadata.keyFilePath,
            },
          }
        : {}),
    },
  }
}

export function requiredCloudBootstrapCommands(): string[] {
  return [...REQUIRED_COMMANDS]
}

export function cloudBootstrapCommandExists(command: string): boolean {
  const segments = (process.env.PATH || "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  for (const segment of segments) {
    const candidate = join(segment, command)
    if (existsSync(candidate)) {
      return true
    }
  }

  return false
}
