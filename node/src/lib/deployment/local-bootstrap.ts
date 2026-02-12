import { execFile as execFileCallback } from "node:child_process"
import { accessSync, constants, existsSync, lstatSync, statSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import { promisify } from "node:util"
import { encodeOpenClawContextBundle, type OpenClawContextBundle } from "./openclaw-context"
import type { InfrastructureConfig, ProvisioningMode } from "./profile"
import type {
  LocalBootstrapFailure,
  LocalBootstrapFailureDetails,
  LocalBootstrapResult,
} from "./local-bootstrap.types"

const execFileAsync = promisify(execFileCallback)

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/u

const BASE_REQUIRED_COMMANDS = ["terraform", "kubectl", "ansible-playbook"] as const

const MAX_OUTPUT_CHARS = 8000
const CONTEXT_CHECK_TIMEOUT_MS = 60_000
const DEFAULT_LOCAL_INFRA_TIMEOUT_MS = 600_000
const DEFAULT_LOCAL_SHIPYARD_APP_IMAGE = "orchwiz:local-dev"
const DEFAULT_LOCAL_SHIPYARD_DOCKERFILE = "node/Dockerfile.shipyard"
const DEFAULT_LOCAL_SHIPYARD_DOCKER_CONTEXT = "node"

interface InstallPackageNames {
  brew: string
  apt: string
  dnf: string
  yum: string
}

const COMMAND_PACKAGE_MAP: Record<string, InstallPackageNames> = {
  terraform: {
    brew: "terraform",
    apt: "terraform",
    dnf: "terraform",
    yum: "terraform",
  },
  kubectl: {
    brew: "kubectl",
    apt: "kubectl",
    dnf: "kubectl",
    yum: "kubectl",
  },
  "ansible-playbook": {
    brew: "ansible",
    apt: "ansible",
    dnf: "ansible",
    yum: "ansible",
  },
  kind: {
    brew: "kind",
    apt: "kind",
    dnf: "kind",
    yum: "kind",
  },
  minikube: {
    brew: "minikube",
    apt: "minikube",
    dnf: "minikube",
    yum: "minikube",
  },
}

export interface LocalBootstrapCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export interface LocalBootstrapCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  exitCode: number | null
}

export interface LocalBootstrapRuntime {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  cwd: string
  getUid?: () => number
  fileExists: (path: string) => boolean
  isDirectory: (path: string) => boolean
  commandExists: (command: string) => boolean
  runCommand: (
    command: string,
    args: string[],
    options?: LocalBootstrapCommandOptions,
  ) => Promise<LocalBootstrapCommandResult>
}

interface ResolvedInfrastructurePaths {
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

interface LocalBootstrapInput {
  infrastructure: InfrastructureConfig
  provisioningMode: ProvisioningMode
  saneBootstrap: boolean
  openClawContextBundle?: OpenClawContextBundle
}

interface RunLocalInstallerSuccess {
  ok: true
  installer: string
  commands: string[]
}

type RunLocalInstallerResult = RunLocalInstallerSuccess | LocalBootstrapFailure

interface OpenClawContextInjectionSummary {
  attempted: boolean
  skippedReason?: string
  targetDeployments: string[]
  updatedDeployments: string[]
  missingDeployments: string[]
  encodedBytes?: number
}

type OpenClawContextInjectionResult =
  | { ok: true; summary: OpenClawContextInjectionSummary }
  | LocalBootstrapFailure

interface TerraformOutputEntry {
  value?: unknown
}

interface TerraformOutputShape {
  kubeview_enabled?: TerraformOutputEntry
  kubeview_ingress_enabled?: TerraformOutputEntry
  kubeview_url?: TerraformOutputEntry
}

interface KubeviewBootstrapMetadata {
  enabled: boolean
  ingressEnabled: boolean
  url: string | null
  source: "terraform_output" | "fallback"
}

const DEFAULT_OPENCLAW_TARGET_DEPLOYMENTS = [
  "openclaw-xo",
  "openclaw-ops",
  "openclaw-eng",
  "openclaw-sec",
  "openclaw-med",
  "openclaw-cou",
  "openclaw-gateway",
  "openclaw-worker",
] as const
const OPENCLAW_CONTEXT_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_B64"
const OPENCLAW_CONTEXT_SCHEMA_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_SCHEMA"
const OPENCLAW_CONTEXT_SOURCE_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_SOURCE"
const OPENCLAW_CONTEXT_ENCODING_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_ENCODING"
const OPENCLAW_CONTEXT_ENCODING_VALUE = "base64-json"

function parseTimeoutMs(value: string | undefined, defaultTimeoutMs: number): number {
  const parsed = Number.parseInt(value || String(defaultTimeoutMs), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultTimeoutMs
  }
  return parsed
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "true") {
    return true
  }
  if (normalized === "false") {
    return false
  }

  return fallback
}

function resolvePathFromRepoRoot(repoRoot: string, value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return repoRoot
  }

  if (trimmed.startsWith("/") || WINDOWS_ABSOLUTE_PATH_REGEX.test(trimmed)) {
    return resolve(trimmed)
  }

  return resolve(repoRoot, trimmed)
}

function outputTail(result: { stdout?: string; stderr?: string }): string {
  const combined = [result.stdout || "", result.stderr || ""].filter(Boolean).join("\n").trim()
  if (combined.length <= MAX_OUTPUT_CHARS) {
    return combined
  }
  return combined.slice(-MAX_OUTPUT_CHARS)
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function fallbackLocalKubeviewMetadata(): KubeviewBootstrapMetadata {
  return {
    enabled: true,
    ingressEnabled: false,
    url: null,
    source: "fallback",
  }
}

async function resolveLocalKubeviewMetadata(args: {
  runtime: LocalBootstrapRuntime
  terraformEnvDirAbsolute: string
  timeoutMs: number
}): Promise<KubeviewBootstrapMetadata> {
  const fallback = fallbackLocalKubeviewMetadata()
  const outputResult = await args.runtime.runCommand(
    "terraform",
    ["-chdir", args.terraformEnvDirAbsolute, "output", "-json"],
    {
      timeoutMs: args.timeoutMs,
    },
  )

  if (!outputResult.ok) {
    return fallback
  }

  let parsedOutput: TerraformOutputShape = {}
  try {
    parsedOutput = JSON.parse(outputResult.stdout) as TerraformOutputShape
  } catch {
    return fallback
  }

  const hasKubeviewOutputs = (
    parsedOutput.kubeview_enabled !== undefined
    || parsedOutput.kubeview_ingress_enabled !== undefined
    || parsedOutput.kubeview_url !== undefined
  )
  if (!hasKubeviewOutputs) {
    return fallback
  }

  const enabled = asBoolean(parsedOutput.kubeview_enabled?.value) ?? fallback.enabled
  const ingressEnabled = asBoolean(parsedOutput.kubeview_ingress_enabled?.value) ?? fallback.ingressEnabled
  const outputUrl = asNonEmptyString(parsedOutput.kubeview_url?.value)
  const url = ingressEnabled ? outputUrl : null

  return {
    enabled,
    ingressEnabled,
    url,
    source: "terraform_output",
  }
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

function toFailure(
  code: LocalBootstrapFailure["code"],
  error: string,
  options: {
    expected?: boolean
    details?: LocalBootstrapFailureDetails
    metadata?: Record<string, unknown>
  } = {},
): LocalBootstrapFailure {
  return {
    ok: false,
    expected: options.expected ?? true,
    code,
    error,
    ...(options.details ? { details: options.details } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  }
}

function repoRootFromRuntime(runtime: LocalBootstrapRuntime): string {
  const override = runtime.env.ORCHWIZ_REPO_ROOT?.trim()
  if (override) {
    return resolve(override)
  }
  return resolve(runtime.cwd, "..")
}

function defaultRuntime(): LocalBootstrapRuntime {
  const commandExists = (command: string): boolean => {
    const pathValue = process.env.PATH || ""
    const segments = pathValue
      .split(delimiter)
      .map((segment) => segment.trim())
      .filter(Boolean)

    let found = false
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
        found = true
        break
      } catch {
        continue
      }
    }

    return found
  }

  return {
    platform: process.platform,
    env: process.env,
    cwd: process.cwd(),
    getUid: typeof process.getuid === "function" ? process.getuid : undefined,
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory()
      } catch {
        return false
      }
    },
    commandExists,
    runCommand: async (command, args, options = {}) => {
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          cwd: options.cwd,
          env: options.env || process.env,
          timeout: options.timeoutMs || CONTEXT_CHECK_TIMEOUT_MS,
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
          signal?: string
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

function requiredCommandsForKind(kind: InfrastructureConfig["kind"]): string[] {
  const infrastructureCommand = kind === "minikube" ? "minikube" : "kind"
  return [...BASE_REQUIRED_COMMANDS, infrastructureCommand]
}

function buildSuggestedCopyCommands(paths: ResolvedInfrastructurePaths, runtime: LocalBootstrapRuntime): string[] {
  const suggestions: string[] = []

  const tfvarsExample = `${paths.terraformTfvarsAbsolute}.example`
  if (!runtime.fileExists(paths.terraformTfvarsAbsolute) && runtime.fileExists(tfvarsExample)) {
    suggestions.push(`cp ${paths.terraformTfvarsRelative}.example ${paths.terraformTfvarsRelative}`)
  }

  const inventoryExample = `${paths.ansibleInventoryAbsolute}.example`
  if (!runtime.fileExists(paths.ansibleInventoryAbsolute) && runtime.fileExists(inventoryExample)) {
    suggestions.push(`cp ${paths.ansibleInventoryRelative}.example ${paths.ansibleInventoryRelative}`)
  }

  return suggestions
}

function resolveInfrastructurePaths(
  infrastructure: InfrastructureConfig,
  runtime: LocalBootstrapRuntime,
): LocalBootstrapFailure | { ok: true; paths: ResolvedInfrastructurePaths } {
  const repoRoot = repoRootFromRuntime(runtime)

  let terraformEnvDirRelative: string
  let ansibleInventoryRelative: string
  let ansiblePlaybookRelative: string

  try {
    terraformEnvDirRelative = sanitizeWorkspaceRelativePath(infrastructure.terraformEnvDir)
    ansibleInventoryRelative = sanitizeWorkspaceRelativePath(infrastructure.ansibleInventory)
    ansiblePlaybookRelative = sanitizeWorkspaceRelativePath(infrastructure.ansiblePlaybook)
  } catch (error) {
    return toFailure(
      "LOCAL_BOOTSTRAP_CONFIG_MISSING",
      (error as Error).message,
      {
        details: {
          missingFiles: [
            infrastructure.terraformEnvDir,
            infrastructure.ansibleInventory,
            infrastructure.ansiblePlaybook,
          ],
        },
      },
    )
  }

  const terraformEnvDirAbsolute = resolve(repoRoot, terraformEnvDirRelative)
  const terraformTfvarsRelative = `${terraformEnvDirRelative}/terraform.tfvars`
  const terraformTfvarsAbsolute = join(terraformEnvDirAbsolute, "terraform.tfvars")
  const ansibleInventoryAbsolute = resolve(repoRoot, ansibleInventoryRelative)
  const ansiblePlaybookAbsolute = resolve(repoRoot, ansiblePlaybookRelative)

  const paths: ResolvedInfrastructurePaths = {
    repoRoot,
    terraformEnvDirRelative,
    terraformEnvDirAbsolute,
    terraformTfvarsRelative,
    terraformTfvarsAbsolute,
    ansibleInventoryRelative,
    ansibleInventoryAbsolute,
    ansiblePlaybookRelative,
    ansiblePlaybookAbsolute,
  }

  const missingFiles: string[] = []

  if (!runtime.isDirectory(terraformEnvDirAbsolute)) {
    missingFiles.push(terraformEnvDirRelative)
  }
  if (!runtime.fileExists(terraformTfvarsAbsolute)) {
    missingFiles.push(terraformTfvarsRelative)
  }
  if (!runtime.fileExists(ansibleInventoryAbsolute)) {
    missingFiles.push(ansibleInventoryRelative)
  }
  if (!runtime.fileExists(ansiblePlaybookAbsolute)) {
    missingFiles.push(ansiblePlaybookRelative)
  }

  if (missingFiles.length > 0) {
    const suggestedCommands = buildSuggestedCopyCommands(paths, runtime)
    return toFailure(
      "LOCAL_BOOTSTRAP_CONFIG_MISSING",
      "Missing required local infrastructure files for ship launch.",
      {
        details: {
          missingFiles,
          ...(suggestedCommands.length > 0 ? { suggestedCommands } : {}),
        },
        metadata: {
          repoRoot,
        },
      },
    )
  }

  return { ok: true, paths }
}

function packagesForCommands(commands: string[], manager: keyof InstallPackageNames): string[] {
  const packages = new Set<string>()
  for (const command of commands) {
    const definition = COMMAND_PACKAGE_MAP[command]
    if (!definition) {
      packages.add(command)
      continue
    }
    packages.add(definition[manager])
  }
  return [...packages]
}

function installEnabled(runtime: LocalBootstrapRuntime): boolean {
  return runtime.env.ENABLE_LOCAL_INFRA_AUTO_INSTALL === "true"
}

async function runWithPrefix(
  runtime: LocalBootstrapRuntime,
  prefix: string[],
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<LocalBootstrapCommandResult> {
  if (prefix.length === 0) {
    return runtime.runCommand(command, args, { timeoutMs })
  }

  const [prefixCommand, ...prefixArgs] = prefix
  return runtime.runCommand(prefixCommand, [...prefixArgs, command, ...args], { timeoutMs })
}

async function installOnMacOs(
  runtime: LocalBootstrapRuntime,
  missingCommands: string[],
  timeoutMs: number,
): Promise<RunLocalInstallerResult> {
  if (!runtime.commandExists("brew")) {
    return toFailure(
      "LOCAL_BOOTSTRAP_INSTALL_FAILED",
      "Homebrew is required for automatic tool installation on macOS.",
      {
        details: {
          missingCommands,
          suggestedCommands: [
            "Install Homebrew from https://brew.sh",
            `brew install ${packagesForCommands(missingCommands, "brew").join(" ")}`,
          ],
        },
      },
    )
  }

  const packages = packagesForCommands(missingCommands, "brew")
  const result = await runtime.runCommand("brew", ["install", ...packages], {
    timeoutMs,
  })

  if (!result.ok) {
    return toFailure("LOCAL_BOOTSTRAP_INSTALL_FAILED", "Failed to install missing local CLIs via Homebrew.", {
      details: {
        missingCommands,
        suggestedCommands: [`brew install ${packages.join(" ")}`],
      },
      metadata: {
        installOutputTail: outputTail(result),
      },
    })
  }

  return {
    ok: true,
    installer: "brew",
    commands: [`brew install ${packages.join(" ")}`],
  }
}

async function installOnLinux(
  runtime: LocalBootstrapRuntime,
  missingCommands: string[],
  timeoutMs: number,
): Promise<RunLocalInstallerResult> {
  const isRoot = typeof runtime.getUid === "function" ? runtime.getUid() === 0 : false
  const hasSudo = runtime.commandExists("sudo")
  const prefix = isRoot ? [] : hasSudo ? ["sudo", "-n"] : []

  if (!isRoot) {
    if (!hasSudo) {
      return toFailure(
        "LOCAL_BOOTSTRAP_INSTALL_FAILED",
        "Automatic install on Linux requires root or sudo access.",
        {
          details: {
            missingCommands,
            suggestedCommands: [
              "Run as root, or configure passwordless sudo for install commands.",
            ],
          },
        },
      )
    }

    const sudoCheck = await runtime.runCommand("sudo", ["-n", "true"], { timeoutMs: 10_000 })
    if (!sudoCheck.ok) {
      return toFailure(
        "LOCAL_BOOTSTRAP_INSTALL_FAILED",
        "Non-interactive sudo is required for Linux automatic install.",
        {
          details: {
            missingCommands,
            suggestedCommands: [
              "Grant passwordless sudo for package installation or run the server as root.",
            ],
          },
          metadata: {
            sudoCheckOutputTail: outputTail(sudoCheck),
          },
        },
      )
    }
  }

  const hasApt = runtime.commandExists("apt-get")
  const hasDnf = runtime.commandExists("dnf")
  const hasYum = runtime.commandExists("yum")

  if (!hasApt && !hasDnf && !hasYum) {
    return toFailure(
      "LOCAL_BOOTSTRAP_UNSUPPORTED_PLATFORM",
      "Automatic install is unsupported on this Linux host (no apt-get, dnf, or yum found).",
      {
        details: {
          missingCommands,
          suggestedCommands: missingCommands.map((command) => `Install '${command}' manually and retry launch.`),
        },
      },
    )
  }

  if (hasApt) {
    const packages = packagesForCommands(missingCommands, "apt")
    const updateResult = await runWithPrefix(runtime, prefix, "apt-get", ["update"], timeoutMs)
    if (!updateResult.ok) {
      return toFailure("LOCAL_BOOTSTRAP_INSTALL_FAILED", "apt-get update failed during local bootstrap install.", {
        details: {
          missingCommands,
          suggestedCommands: [
            `${prefix.join(" ")} apt-get update`.trim(),
            `${prefix.join(" ")} apt-get install -y ${packages.join(" ")}`.trim(),
          ],
        },
        metadata: {
          installOutputTail: outputTail(updateResult),
        },
      })
    }

    const installResult = await runWithPrefix(
      runtime,
      prefix,
      "apt-get",
      ["install", "-y", ...packages],
      timeoutMs,
    )
    if (!installResult.ok) {
      return toFailure("LOCAL_BOOTSTRAP_INSTALL_FAILED", "apt-get install failed during local bootstrap install.", {
        details: {
          missingCommands,
          suggestedCommands: [`${prefix.join(" ")} apt-get install -y ${packages.join(" ")}`.trim()],
        },
        metadata: {
          installOutputTail: outputTail(installResult),
        },
      })
    }

    return {
      ok: true,
      installer: "apt-get",
      commands: [`${prefix.join(" ")} apt-get install -y ${packages.join(" ")}`.trim()],
    }
  }

  if (hasDnf) {
    const packages = packagesForCommands(missingCommands, "dnf")
    const installResult = await runWithPrefix(
      runtime,
      prefix,
      "dnf",
      ["install", "-y", ...packages],
      timeoutMs,
    )

    if (!installResult.ok) {
      return toFailure("LOCAL_BOOTSTRAP_INSTALL_FAILED", "dnf install failed during local bootstrap install.", {
        details: {
          missingCommands,
          suggestedCommands: [`${prefix.join(" ")} dnf install -y ${packages.join(" ")}`.trim()],
        },
        metadata: {
          installOutputTail: outputTail(installResult),
        },
      })
    }

    return {
      ok: true,
      installer: "dnf",
      commands: [`${prefix.join(" ")} dnf install -y ${packages.join(" ")}`.trim()],
    }
  }

  const packages = packagesForCommands(missingCommands, "yum")
  const installResult = await runWithPrefix(
    runtime,
    prefix,
    "yum",
    ["install", "-y", ...packages],
    timeoutMs,
  )

  if (!installResult.ok) {
    return toFailure("LOCAL_BOOTSTRAP_INSTALL_FAILED", "yum install failed during local bootstrap install.", {
      details: {
        missingCommands,
        suggestedCommands: [`${prefix.join(" ")} yum install -y ${packages.join(" ")}`.trim()],
      },
      metadata: {
        installOutputTail: outputTail(installResult),
      },
    })
  }

  return {
    ok: true,
    installer: "yum",
    commands: [`${prefix.join(" ")} yum install -y ${packages.join(" ")}`.trim()],
  }
}

async function installMissingCommands(
  runtime: LocalBootstrapRuntime,
  missingCommands: string[],
): Promise<RunLocalInstallerResult> {
  const timeoutMs = parseTimeoutMs(runtime.env.LOCAL_INFRA_COMMAND_TIMEOUT_MS, DEFAULT_LOCAL_INFRA_TIMEOUT_MS)

  if (runtime.platform === "darwin") {
    return installOnMacOs(runtime, missingCommands, timeoutMs)
  }

  if (runtime.platform === "linux") {
    return installOnLinux(runtime, missingCommands, timeoutMs)
  }

  return toFailure(
    "LOCAL_BOOTSTRAP_UNSUPPORTED_PLATFORM",
    `Automatic install is unsupported on platform '${runtime.platform}'.`,
    {
      details: {
        missingCommands,
        suggestedCommands: missingCommands.map((command) => `Install '${command}' manually and retry launch.`),
      },
    },
  )
}

function suggestedContextCommands(kind: InfrastructureConfig["kind"], context: string): string[] {
  if (kind === "minikube") {
    return [
      "kubectl config get-contexts -o name",
      "minikube start -p minikube",
      `kubectl config use-context ${context}`,
    ]
  }

  return [
    "kubectl config get-contexts -o name",
    "kind create cluster --name orchwiz",
    `kubectl config use-context ${context}`,
  ]
}

function parseOpenClawTargetDeployments(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) {
    return [...DEFAULT_OPENCLAW_TARGET_DEPLOYMENTS]
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function kubectlArgs(
  infrastructure: InfrastructureConfig,
  args: string[],
): string[] {
  return [
    "--context",
    infrastructure.kubeContext,
    "-n",
    infrastructure.namespace,
    ...args,
  ]
}

async function injectOpenClawContextBundle(
  input: LocalBootstrapInput,
  runtime: LocalBootstrapRuntime,
  timeoutMs: number,
): Promise<OpenClawContextInjectionResult> {
  if (runtime.env.OPENCLAW_CONTEXT_INJECTION_ENABLED === "false") {
    return {
      ok: true,
      summary: {
        attempted: false,
        skippedReason: "disabled",
        targetDeployments: [],
        updatedDeployments: [],
        missingDeployments: [],
      },
    }
  }

  if (!input.openClawContextBundle) {
    return {
      ok: true,
      summary: {
        attempted: false,
        skippedReason: "no_context_bundle",
        targetDeployments: [],
        updatedDeployments: [],
        missingDeployments: [],
      },
    }
  }

  const targetDeployments = parseOpenClawTargetDeployments(runtime.env.OPENCLAW_TARGET_DEPLOYMENTS)
  if (targetDeployments.length === 0) {
    return {
      ok: true,
      summary: {
        attempted: false,
        skippedReason: "no_target_deployments",
        targetDeployments: [],
        updatedDeployments: [],
        missingDeployments: [],
      },
    }
  }

  const encodedBundle = encodeOpenClawContextBundle(input.openClawContextBundle)
  const updatedDeployments: string[] = []
  const missingDeployments: string[] = []

  for (const deploymentName of targetDeployments) {
    const existsResult = await runtime.runCommand(
      "kubectl",
      kubectlArgs(input.infrastructure, ["get", "deployment", deploymentName, "-o", "name"]),
      { timeoutMs },
    )

    if (!existsResult.ok) {
      missingDeployments.push(deploymentName)
      continue
    }

    const setEnvArgs = kubectlArgs(input.infrastructure, [
      "set",
      "env",
      `deployment/${deploymentName}`,
      `${OPENCLAW_CONTEXT_ENV_KEY}=${encodedBundle}`,
      `${OPENCLAW_CONTEXT_SCHEMA_ENV_KEY}=${input.openClawContextBundle.schemaVersion}`,
      `${OPENCLAW_CONTEXT_SOURCE_ENV_KEY}=${input.openClawContextBundle.source}`,
      `${OPENCLAW_CONTEXT_ENCODING_ENV_KEY}=${OPENCLAW_CONTEXT_ENCODING_VALUE}`,
    ])
    const setEnvResult = await runtime.runCommand("kubectl", setEnvArgs, { timeoutMs })
    if (!setEnvResult.ok) {
      return toFailure(
        "LOCAL_PROVISIONING_FAILED",
        `Failed to inject bridge context into OpenClaw deployment '${deploymentName}'.`,
        {
          details: {
            suggestedCommands: [
              `kubectl --context ${input.infrastructure.kubeContext} -n ${input.infrastructure.namespace} set env deployment/${deploymentName} ${OPENCLAW_CONTEXT_ENV_KEY}=<base64-bundle>`,
            ],
          },
          metadata: {
            openClawDeployment: deploymentName,
            openClawInjectionOutputTail: outputTail(setEnvResult),
          },
        },
      )
    }

    const rolloutResult = await runtime.runCommand(
      "kubectl",
      kubectlArgs(input.infrastructure, [
        "rollout",
        "status",
        `deployment/${deploymentName}`,
        "--timeout=300s",
      ]),
      { timeoutMs },
    )
    if (!rolloutResult.ok) {
      return toFailure(
        "LOCAL_PROVISIONING_FAILED",
        `OpenClaw deployment '${deploymentName}' did not become ready after context injection.`,
        {
          metadata: {
            openClawDeployment: deploymentName,
            openClawRolloutOutputTail: outputTail(rolloutResult),
          },
        },
      )
    }

    updatedDeployments.push(deploymentName)
  }

  return {
    ok: true,
    summary: {
      attempted: true,
      targetDeployments,
      updatedDeployments,
      missingDeployments,
      encodedBytes: encodedBundle.length,
    },
  }
}

function localShipyardAutoBuildEnabled(input: LocalBootstrapInput, runtime: LocalBootstrapRuntime): boolean {
  if (input.infrastructure.kind !== "kind") {
    return false
  }

  if (!input.saneBootstrap) {
    return false
  }

  return parseBooleanEnv(runtime.env.LOCAL_SHIPYARD_AUTO_BUILD_APP_IMAGE, true)
}

function localShipyardForceRebuildEnabled(runtime: LocalBootstrapRuntime): boolean {
  return parseBooleanEnv(runtime.env.LOCAL_SHIPYARD_FORCE_REBUILD_APP_IMAGE, false)
}

function kindClusterNameFromContext(kubeContext: string): string {
  const trimmed = kubeContext.trim()
  if (trimmed.startsWith("kind-") && trimmed.length > "kind-".length) {
    return trimmed.slice("kind-".length)
  }
  return trimmed || "orchwiz"
}

async function prepareLocalKindAppImage(args: {
  input: LocalBootstrapInput
  paths: ResolvedInfrastructurePaths
  runtime: LocalBootstrapRuntime
  timeoutMs: number
}): Promise<{ ok: true; image: string; metadata: Record<string, unknown> } | LocalBootstrapFailure> {
  const imageTag = args.runtime.env.LOCAL_SHIPYARD_APP_IMAGE?.trim() || DEFAULT_LOCAL_SHIPYARD_APP_IMAGE
  const dockerfilePath = resolvePathFromRepoRoot(
    args.paths.repoRoot,
    args.runtime.env.LOCAL_SHIPYARD_DOCKERFILE || DEFAULT_LOCAL_SHIPYARD_DOCKERFILE,
  )
  const dockerContextPath = resolvePathFromRepoRoot(
    args.paths.repoRoot,
    args.runtime.env.LOCAL_SHIPYARD_DOCKER_CONTEXT || DEFAULT_LOCAL_SHIPYARD_DOCKER_CONTEXT,
  )

  if (!args.runtime.commandExists("docker")) {
    return toFailure(
      "LOCAL_BOOTSTRAP_TOOLS_MISSING",
      "Docker CLI is required to build the local Ship Yard app image.",
      {
        details: {
          missingCommands: ["docker"],
          suggestedCommands: ["Install 'docker' and retry launch."],
        },
      },
    )
  }

  if (!args.runtime.fileExists(dockerfilePath) || !args.runtime.isDirectory(dockerContextPath)) {
    return toFailure(
      "LOCAL_BOOTSTRAP_CONFIG_MISSING",
      "Local Ship Yard docker build configuration is missing.",
      {
        details: {
          missingFiles: [
            ...(args.runtime.fileExists(dockerfilePath) ? [] : [dockerfilePath]),
            ...(args.runtime.isDirectory(dockerContextPath) ? [] : [dockerContextPath]),
          ],
          suggestedCommands: [
            "Ensure node/Dockerfile.shipyard exists and LOCAL_SHIPYARD_DOCKER_CONTEXT points to a valid directory.",
          ],
        },
      },
    )
  }

  const forceRebuild = localShipyardForceRebuildEnabled(args.runtime)
  let buildPerformed = false

  if (forceRebuild) {
    const buildResult = await args.runtime.runCommand(
      "docker",
      ["build", "-f", dockerfilePath, "-t", imageTag, dockerContextPath],
      {
        cwd: args.paths.repoRoot,
        timeoutMs: args.timeoutMs,
      },
    )

    if (!buildResult.ok) {
      return toFailure(
        "LOCAL_PROVISIONING_FAILED",
        "Failed to build local app image for kind launch.",
        {
          details: {
            suggestedCommands: [
              `docker build -f ${dockerfilePath} -t ${imageTag} ${dockerContextPath}`,
            ],
          },
          metadata: {
            appImageBuildOutputTail: outputTail(buildResult),
          },
        },
      )
    }

    buildPerformed = true
  } else {
    const inspectResult = await args.runtime.runCommand("docker", ["image", "inspect", imageTag], {
      timeoutMs: CONTEXT_CHECK_TIMEOUT_MS,
    })
    if (!inspectResult.ok) {
      const buildResult = await args.runtime.runCommand(
        "docker",
        ["build", "-f", dockerfilePath, "-t", imageTag, dockerContextPath],
        {
          cwd: args.paths.repoRoot,
          timeoutMs: args.timeoutMs,
        },
      )
      if (!buildResult.ok) {
        return toFailure(
          "LOCAL_PROVISIONING_FAILED",
          "Failed to build local app image for kind launch.",
          {
            details: {
              suggestedCommands: [
                `docker build -f ${dockerfilePath} -t ${imageTag} ${dockerContextPath}`,
              ],
            },
            metadata: {
              appImageBuildOutputTail: outputTail(buildResult),
            },
          },
        )
      }
      buildPerformed = true
    }
  }

  const clusterName = args.runtime.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim()
    || kindClusterNameFromContext(args.input.infrastructure.kubeContext)

  const loadResult = await args.runtime.runCommand(
    "kind",
    ["load", "docker-image", imageTag, "--name", clusterName],
    {
      timeoutMs: args.timeoutMs,
    },
  )

  if (!loadResult.ok) {
    return toFailure(
      "LOCAL_PROVISIONING_FAILED",
      "Failed to load local app image into kind cluster.",
      {
        details: {
          suggestedCommands: [
            `kind load docker-image ${imageTag} --name ${clusterName}`,
          ],
        },
        metadata: {
          appImageLoadOutputTail: outputTail(loadResult),
        },
      },
    )
  }

  return {
    ok: true,
    image: imageTag,
    metadata: {
      imageTag,
      dockerfilePath,
      dockerContextPath,
      clusterName,
      buildPerformed,
      forceRebuild,
    },
  }
}

function derivedProvisioningSuggestions(args: {
  baseCommand: string
  infrastructure: InfrastructureConfig
  output: string
}): string[] {
  const suggestions = [args.baseCommand]
  const lower = args.output.toLowerCase()

  if (
    lower.includes("connect: connection refused")
    && args.infrastructure.kind === "kind"
    && args.infrastructure.kubeContext === "kind-orchwiz"
  ) {
    suggestions.unshift("kind create cluster --name orchwiz")
    suggestions.unshift("kubectl config use-context kind-orchwiz")
  }

  if (lower.includes("bitnami/postgresql") && lower.includes("not found")) {
    suggestions.unshift(
      "terraform -chdir=infra/terraform/environments/starship-local init -upgrade -backend=false",
    )
    suggestions.unshift(
      "Update infra/terraform/modules/starship-minikube/variables.tf postgres_chart_version to a current release.",
    )
  }

  if (lower.includes("could not download chart") && lower.includes("invalid_reference: invalid tag")) {
    suggestions.unshift(
      "Set PostgreSQL Helm repository to OCI: repository = \"oci://registry-1.docker.io/bitnamicharts\" in infra/terraform/modules/starship-minikube/main.tf.",
    )
    suggestions.unshift(
      "terraform -chdir=infra/terraform/environments/starship-local init -upgrade -backend=false",
    )
  }

  if (lower.includes("imagepullbackoff") || lower.includes("errimagepull")) {
    suggestions.unshift("kubectl --context kind-orchwiz -n orchwiz-starship get pods")
    suggestions.unshift("kubectl --context kind-orchwiz -n orchwiz-starship describe pod <pod-name>")
  }

  return suggestions
}

export function requiredCommandsForInfrastructureKind(kind: InfrastructureConfig["kind"]): string[] {
  return requiredCommandsForKind(kind)
}

export async function runLocalBootstrap(
  input: LocalBootstrapInput,
  runtime: LocalBootstrapRuntime = defaultRuntime(),
): Promise<LocalBootstrapResult> {
  if (input.provisioningMode !== "terraform_ansible") {
    return toFailure(
      "LOCAL_PROVISIONING_FAILED",
      "Only provisioning mode 'terraform_ansible' is supported for local Ship Yard launches.",
    )
  }

  const resolved = resolveInfrastructurePaths(input.infrastructure, runtime)
  if (!resolved.ok) {
    return resolved
  }

  const { paths } = resolved
  const requiredCommands = requiredCommandsForKind(input.infrastructure.kind)
  let missingCommands = requiredCommands.filter((command) => !runtime.commandExists(command))

  const installMetadata: Record<string, unknown> = {
    requiredCommands,
    saneBootstrap: input.saneBootstrap,
  }

  if (missingCommands.length > 0) {
    if (!input.saneBootstrap) {
      return toFailure(
        "LOCAL_BOOTSTRAP_TOOLS_MISSING",
        "Missing required local CLIs for Ship Yard launch.",
        {
          details: {
            missingCommands,
            suggestedCommands: missingCommands.map((command) => `Install '${command}' and retry launch.`),
          },
          metadata: {
            ...installMetadata,
          },
        },
      )
    }

    if (!installEnabled(runtime)) {
      return toFailure(
        "LOCAL_BOOTSTRAP_INSTALL_DISABLED",
        "Automatic local CLI install is disabled. Set ENABLE_LOCAL_INFRA_AUTO_INSTALL=true to enable it.",
        {
          details: {
            missingCommands,
            suggestedCommands: [
              "Set ENABLE_LOCAL_INFRA_AUTO_INSTALL=true and retry launch.",
              ...missingCommands.map((command) => `Install '${command}' manually and retry launch.`),
            ],
          },
          metadata: {
            ...installMetadata,
          },
        },
      )
    }

    const installResult = await installMissingCommands(runtime, missingCommands)
    if (!installResult.ok) {
      return {
        ...installResult,
        metadata: {
          ...(installResult.metadata || {}),
          ...installMetadata,
        },
      }
    }

    installMetadata.installer = installResult.installer
    installMetadata.installCommands = installResult.commands
    missingCommands = requiredCommands.filter((command) => !runtime.commandExists(command))
    if (missingCommands.length > 0) {
      return toFailure(
        "LOCAL_BOOTSTRAP_INSTALL_FAILED",
        "Automatic install completed, but required commands are still missing.",
        {
          details: {
            missingCommands,
            suggestedCommands: missingCommands.map((command) => `Verify '${command}' is installed and on PATH.`),
          },
          metadata: {
            ...installMetadata,
          },
        },
      )
    }
  }

  const contextResult = await runtime.runCommand("kubectl", ["config", "get-contexts", "-o", "name"], {
    timeoutMs: CONTEXT_CHECK_TIMEOUT_MS,
  })

  if (!contextResult.ok) {
    return toFailure(
      "LOCAL_BOOTSTRAP_CONTEXT_MISSING",
      "Unable to read kube contexts from kubectl.",
      {
        details: {
          missingContext: input.infrastructure.kubeContext,
          suggestedCommands: suggestedContextCommands(
            input.infrastructure.kind,
            input.infrastructure.kubeContext,
          ),
        },
        metadata: {
          ...installMetadata,
          contextCheckOutputTail: outputTail(contextResult),
        },
      },
    )
  }

  const contexts = contextResult.stdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
  const contextSet = new Set(contexts)

  if (!contextSet.has(input.infrastructure.kubeContext)) {
    return toFailure(
      "LOCAL_BOOTSTRAP_CONTEXT_MISSING",
      `Kubernetes context '${input.infrastructure.kubeContext}' was not found in kubeconfig.`,
      {
        details: {
          missingContext: input.infrastructure.kubeContext,
          suggestedCommands: suggestedContextCommands(
            input.infrastructure.kind,
            input.infrastructure.kubeContext,
          ),
        },
        metadata: {
          ...installMetadata,
          discoveredContexts: contexts,
        },
      },
    )
  }

  if (runtime.env.ENABLE_LOCAL_COMMAND_EXECUTION !== "true") {
    return toFailure(
      "LOCAL_PROVISIONING_BLOCKED",
      "Local command execution is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true to enable local Ship Yard provisioning.",
      {
        metadata: {
          ...installMetadata,
          localExecutionEnabled: false,
        },
      },
    )
  }

  const timeoutMs = parseTimeoutMs(runtime.env.LOCAL_INFRA_COMMAND_TIMEOUT_MS, DEFAULT_LOCAL_INFRA_TIMEOUT_MS)
  if (localShipyardAutoBuildEnabled(input, runtime)) {
    const imagePreparation = await prepareLocalKindAppImage({
      input,
      paths,
      runtime,
      timeoutMs,
    })
    if (!imagePreparation.ok) {
      return {
        ...imagePreparation,
        metadata: {
          ...(imagePreparation.metadata || {}),
          ...installMetadata,
        },
      }
    }
    installMetadata.localAppImage = imagePreparation.metadata
  }

  const provisionEnv: NodeJS.ProcessEnv = {
    ...runtime.env,
    TF_DIR: paths.terraformEnvDirAbsolute,
    INFRASTRUCTURE_KIND: input.infrastructure.kind,
    KUBE_CONTEXT: input.infrastructure.kubeContext,
    ORCHWIZ_NAMESPACE: input.infrastructure.namespace,
    ORCHWIZ_APP_NAME: runtime.env.ORCHWIZ_APP_NAME || "orchwiz",
    ...(installMetadata.localAppImage
      ? {
          TF_VAR_app_image: (installMetadata.localAppImage as { imageTag?: string }).imageTag || "",
        }
      : {}),
  }

  const provisionCommand = [
    "ansible-playbook",
    "-i",
    paths.ansibleInventoryAbsolute,
    paths.ansiblePlaybookAbsolute,
  ]

  const provisionResult = await runtime.runCommand(
    provisionCommand[0],
    provisionCommand.slice(1),
    {
      cwd: paths.repoRoot,
      env: provisionEnv,
      timeoutMs,
    },
  )

  if (!provisionResult.ok) {
    const provisionOutput = outputTail(provisionResult)
    const baseCommand = `TF_DIR=${paths.terraformEnvDirAbsolute} INFRASTRUCTURE_KIND=${input.infrastructure.kind} KUBE_CONTEXT=${input.infrastructure.kubeContext} ORCHWIZ_NAMESPACE=${input.infrastructure.namespace} ORCHWIZ_APP_NAME=${runtime.env.ORCHWIZ_APP_NAME || "orchwiz"}${provisionEnv.TF_VAR_app_image ? ` TF_VAR_app_image=${provisionEnv.TF_VAR_app_image}` : ""} ansible-playbook -i ${paths.ansibleInventoryAbsolute} ${paths.ansiblePlaybookAbsolute}`
    return toFailure(
      "LOCAL_PROVISIONING_FAILED",
      "Local provisioning failed while running ansible playbook.",
      {
        details: {
          suggestedCommands: derivedProvisioningSuggestions({
            baseCommand,
            infrastructure: input.infrastructure,
            output: provisionOutput,
          }),
        },
        metadata: {
          ...installMetadata,
          provisionOutputTail: provisionOutput,
          provisionCommand: provisionCommand.join(" "),
          provisionTimeoutMs: timeoutMs,
        },
      },
    )
  }

  const openClawContextInjection = await injectOpenClawContextBundle(input, runtime, timeoutMs)
  if (!openClawContextInjection.ok) {
    return openClawContextInjection
  }

  const kubeview = await resolveLocalKubeviewMetadata({
    runtime,
    terraformEnvDirAbsolute: paths.terraformEnvDirAbsolute,
    timeoutMs,
  })

  return {
    ok: true,
    metadata: {
      ...installMetadata,
      localProvisioning: {
        repoRoot: paths.repoRoot,
        terraformEnvDir: paths.terraformEnvDirRelative,
        ansibleInventory: paths.ansibleInventoryRelative,
        ansiblePlaybook: paths.ansiblePlaybookRelative,
        kubeContext: input.infrastructure.kubeContext,
        namespace: input.infrastructure.namespace,
        timeoutMs,
      },
      provisionOutputTail: outputTail(provisionResult),
      openClawContextInjection: openClawContextInjection.summary,
      kubeview,
    },
  }
}
