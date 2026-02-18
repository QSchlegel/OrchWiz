import { execFile as execFileCallback } from "node:child_process"
import { accessSync, constants, existsSync, lstatSync, statSync } from "node:fs"
import { delimiter, join, resolve } from "node:path"
import { promisify } from "node:util"
import { encodeOpenClawContextBundle, type OpenClawContextBundle } from "./openclaw-context"
import {
  isLightweightShuttleProfile,
  isLocalDeploymentProfile,
  type DeploymentProfile,
  type InfrastructureConfig,
  type ProvisioningMode,
} from "./profile"
import type {
  LocalBootstrapFailure,
  LocalBootstrapFailureDetails,
  LocalBootstrapResult,
} from "./local-bootstrap.types"
import { isVerboseOrResourceUsageEnabled } from "./local-bootstrap-resources"

const execFileAsync = promisify(execFileCallback)

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/u

const BASE_REQUIRED_COMMANDS = ["terraform", "kubectl", "ansible-playbook"] as const

const MAX_OUTPUT_CHARS = 8000
const CONTEXT_CHECK_TIMEOUT_MS = 60_000
const KIND_CREATE_CLUSTER_TIMEOUT_MS = 300_000
const DEFAULT_LOCAL_INFRA_TIMEOUT_MS = 1_200_000
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
  /** Optional progress callback for granular launch progress (percent, stage, message). */
  onProgress?: (percent: number, stage: string, message: string) => void
  /** Optional debug log emitter when LOCAL_BOOTSTRAP_VERBOSE_DEBUG or LOCAL_BOOTSTRAP_RESOURCE_USAGE is set. */
  emitLaunchLog?: (entry: { level: "debug" | "info" | "warn" | "error"; source: string; lines: string[] }) => void
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
  deploymentProfile?: DeploymentProfile
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
  runtime_ui_openclaw_urls?: TerraformOutputEntry
  runtime_ui_kubeview_url?: TerraformOutputEntry
  runtime_edge_port_forward_command?: TerraformOutputEntry
  monitoring_namespace?: TerraformOutputEntry
  grafana_enabled?: TerraformOutputEntry
  grafana_url?: TerraformOutputEntry
  prometheus_enabled?: TerraformOutputEntry
  prometheus_url?: TerraformOutputEntry
  loki_enabled?: TerraformOutputEntry
  clickhouse_enabled?: TerraformOutputEntry
  langfuse_enabled?: TerraformOutputEntry
  langfuse_url?: TerraformOutputEntry
}

interface KubeviewBootstrapMetadata {
  enabled: boolean
  ingressEnabled: boolean
  url: string | null
  source: "terraform_output" | "fallback"
}

interface RuntimeUiBootstrapMetadata {
  openclaw: {
    urls: Partial<Record<"xo" | "ops" | "eng" | "sec" | "med" | "cou", string>>
    source: "terraform_output" | "fallback"
  }
  kubeview: {
    url: string | null
    source: "terraform_output" | "fallback"
  }
  portForwardCommand: string | null
}

interface ObservabilityServiceBootstrapMetadata {
  enabled: boolean | null
  url?: string | null
  source: "terraform_output" | "fallback"
}

interface ObservabilityBootstrapMetadata {
  monitoringNamespace: string | null
  grafana: ObservabilityServiceBootstrapMetadata
  prometheus: ObservabilityServiceBootstrapMetadata
  loki: ObservabilityServiceBootstrapMetadata
  clickhouse: ObservabilityServiceBootstrapMetadata
  langfuse: ObservabilityServiceBootstrapMetadata
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
const LIGHTWEIGHT_OPENCLAW_TARGET_DEPLOYMENTS = [
  "openclaw-xo",
  "openclaw-gateway",
  "openclaw-worker",
] as const
const LIGHTWEIGHT_OPENCLAW_STATION_COUNT = "1"
const OPENCLAW_CONTEXT_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_B64"
const OPENCLAW_CONTEXT_SCHEMA_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_SCHEMA"
const OPENCLAW_CONTEXT_SOURCE_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_SOURCE"
const OPENCLAW_CONTEXT_ENCODING_ENV_KEY = "ORCHWIZ_BRIDGE_CONTEXT_ENCODING"
const OPENCLAW_CONTEXT_ENCODING_VALUE = "base64-json"

const LIGHTWEIGHT_APP_ENV_OVERRIDES: Readonly<Record<string, string>> = {
  ORCHWIZ_BOOTSTRAP_PROFILE: "lightweight_shuttle",
  OPENCLAW_GATEWAY_URL: "http://openclaw-xo:18789",
  OPENCLAW_GATEWAY_URL_TEMPLATE: "http://openclaw-xo:18789",
  ENABLE_AGENT_HARNESS_POD: "true",
  RUNTIME_INTELLIGENCE_POLICY_ENABLED: "true",
  WALLET_ENCLAVE_ENABLED: "true",
  WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION: "true",
  WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES: "true",
}

const PROVISIONING_HIGH_SIGNAL_PATTERNS: RegExp[] = [
  /\bfatal:/iu,
  /\berror:\b/iu,
  /failed! =>/iu,
  /waiting for rollout to finish/iu,
  /crashloopbackoff/iu,
  /imagepullbackoff/iu,
  /errimagepull/iu,
  /qschlegel\/orchwiz-provider-proxy/iu,
  /403 forbidden/iu,
  /failed to start orchwiz server/iu,
  /turbo\.createproject/iu,
]

type ProvisioningFailureConfidence = "low" | "medium" | "high"

interface ProvisioningFailureSummary {
  reasonCode: string
  title: string
  summary: string
  confidence: ProvisioningFailureConfidence
  evidence: string[]
  suggestedCommands: string[]
}

interface KubernetesFailurePodDiagnostics {
  name: string
  phase: string
  ready: string
  restartCount: number
  reasons: string[]
}

interface KubernetesFailureDiagnostics {
  checkedAt: string
  context: string
  namespace: string
  appName: string
  rolloutStatus: string | null
  failingPods: KubernetesFailurePodDiagnostics[]
  appLogHighlights: string[]
}

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

function resolveDeploymentProfile(input: LocalBootstrapInput): DeploymentProfile {
  return input.deploymentProfile || "local_starship_build"
}

function isLightweightBootstrapProfile(input: LocalBootstrapInput): boolean {
  return isLightweightShuttleProfile(resolveDeploymentProfile(input))
}

function lightweightAppEnvOverrides(input: LocalBootstrapInput): Record<string, string> | null {
  if (!isLightweightBootstrapProfile(input)) {
    return null
  }
  return { ...LIGHTWEIGHT_APP_ENV_OVERRIDES }
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

function normalizeLogLine(raw: string): string {
  return raw.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "").replace(/\s+/gu, " ").trim()
}

function extractProvisioningHighSignalLines(output: string, maxLines = 8): string[] {
  if (!output.trim()) {
    return []
  }

  const lines = output
    .split("\n")
    .map((line) => normalizeLogLine(line))
    .filter(Boolean)

  const highlights = lines.filter((line) =>
    PROVISIONING_HIGH_SIGNAL_PATTERNS.some((pattern) => pattern.test(line)),
  )

  if (highlights.length > 0) {
    return [...new Set(highlights)].slice(0, maxLines)
  }

  return lines.slice(-Math.min(maxLines, lines.length))
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

function isStationKey(value: unknown): value is "xo" | "ops" | "eng" | "sec" | "med" | "cou" {
  return value === "xo" || value === "ops" || value === "eng" || value === "sec" || value === "med" || value === "cou"
}

function fallbackLocalRuntimeUiMetadata(): RuntimeUiBootstrapMetadata {
  return {
    openclaw: {
      urls: {},
      source: "fallback",
    },
    kubeview: {
      url: null,
      source: "fallback",
    },
    portForwardCommand: null,
  }
}

function fallbackLocalObservabilityMetadata(): ObservabilityBootstrapMetadata {
  return {
    monitoringNamespace: null,
    grafana: {
      enabled: null,
      url: null,
      source: "fallback",
    },
    prometheus: {
      enabled: null,
      url: null,
      source: "fallback",
    },
    loki: {
      enabled: null,
      source: "fallback",
    },
    clickhouse: {
      enabled: null,
      source: "fallback",
    },
    langfuse: {
      enabled: null,
      url: null,
      source: "fallback",
    },
  }
}

function parseStationUrlMap(value: unknown): Partial<Record<"xo" | "ops" | "eng" | "sec" | "med" | "cou", string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  const out: Partial<Record<"xo" | "ops" | "eng" | "sec" | "med" | "cou", string>> = {}
  for (const [key, rawUrl] of Object.entries(value as Record<string, unknown>)) {
    const stationKey = key.trim().toLowerCase()
    if (!isStationKey(stationKey)) continue
    const url = asNonEmptyString(rawUrl)
    if (!url) continue
    out[stationKey] = url
  }
  return out
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

async function resolveLocalRuntimeUiMetadata(args: {
  runtime: LocalBootstrapRuntime
  terraformEnvDirAbsolute: string
  timeoutMs: number
}): Promise<RuntimeUiBootstrapMetadata> {
  const fallback = fallbackLocalRuntimeUiMetadata()

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

  const hasRuntimeUiOutputs = (
    parsedOutput.runtime_ui_openclaw_urls !== undefined
    || parsedOutput.runtime_ui_kubeview_url !== undefined
    || parsedOutput.runtime_edge_port_forward_command !== undefined
  )
  if (!hasRuntimeUiOutputs) {
    return fallback
  }

  const openclawUrls = parseStationUrlMap(parsedOutput.runtime_ui_openclaw_urls?.value)
  const kubeviewUrl = asNonEmptyString(parsedOutput.runtime_ui_kubeview_url?.value)
  const portForwardCommand = asNonEmptyString(parsedOutput.runtime_edge_port_forward_command?.value)

  return {
    openclaw: {
      urls: openclawUrls,
      source: "terraform_output",
    },
    kubeview: {
      url: kubeviewUrl,
      source: "terraform_output",
    },
    portForwardCommand: portForwardCommand || null,
  }
}

async function resolveLocalObservabilityMetadata(args: {
  runtime: LocalBootstrapRuntime
  terraformEnvDirAbsolute: string
  timeoutMs: number
}): Promise<ObservabilityBootstrapMetadata> {
  const fallback = fallbackLocalObservabilityMetadata()

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

  const hasObservabilityOutputs = (
    parsedOutput.monitoring_namespace !== undefined
    || parsedOutput.grafana_enabled !== undefined
    || parsedOutput.grafana_url !== undefined
    || parsedOutput.prometheus_enabled !== undefined
    || parsedOutput.prometheus_url !== undefined
    || parsedOutput.loki_enabled !== undefined
    || parsedOutput.clickhouse_enabled !== undefined
    || parsedOutput.langfuse_enabled !== undefined
    || parsedOutput.langfuse_url !== undefined
  )
  if (!hasObservabilityOutputs) {
    return fallback
  }

  return {
    monitoringNamespace: asNonEmptyString(parsedOutput.monitoring_namespace?.value),
    grafana: {
      enabled: asBoolean(parsedOutput.grafana_enabled?.value),
      url: asNonEmptyString(parsedOutput.grafana_url?.value),
      source: "terraform_output",
    },
    prometheus: {
      enabled: asBoolean(parsedOutput.prometheus_enabled?.value),
      url: asNonEmptyString(parsedOutput.prometheus_url?.value),
      source: "terraform_output",
    },
    loki: {
      enabled: asBoolean(parsedOutput.loki_enabled?.value),
      source: "terraform_output",
    },
    clickhouse: {
      enabled: asBoolean(parsedOutput.clickhouse_enabled?.value),
      source: "terraform_output",
    },
    langfuse: {
      enabled: asBoolean(parsedOutput.langfuse_enabled?.value),
      url: asNonEmptyString(parsedOutput.langfuse_url?.value),
      source: "terraform_output",
    },
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

function parseOpenClawTargetDeployments(args: {
  raw: string | undefined
  input: LocalBootstrapInput
}): string[] {
  if (!args.raw || args.raw.trim().length === 0) {
    return isLightweightBootstrapProfile(args.input)
      ? [...LIGHTWEIGHT_OPENCLAW_TARGET_DEPLOYMENTS]
      : [...DEFAULT_OPENCLAW_TARGET_DEPLOYMENTS]
  }

  return args.raw
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

  const targetDeployments = parseOpenClawTargetDeployments({
    raw: runtime.env.OPENCLAW_TARGET_DEPLOYMENTS,
    input,
  })
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

function localShipyardAutoCreateKindClusterEnabled(
  input: LocalBootstrapInput,
  runtime: LocalBootstrapRuntime,
): boolean {
  if (input.infrastructure.kind !== "kind") {
    return false
  }

  if (!input.saneBootstrap) {
    return false
  }

  return parseBooleanEnv(runtime.env.LOCAL_SHIPYARD_AUTO_CREATE_KIND_CLUSTER, false)
}

function localShipyardObservabilityStackEnabled(
  input: LocalBootstrapInput,
  runtime: LocalBootstrapRuntime,
): boolean {
  const deploymentProfile = resolveDeploymentProfile(input)
  if (!isLocalDeploymentProfile(deploymentProfile)) {
    return true
  }

  return parseBooleanEnv(runtime.env.LOCAL_SHIPYARD_ENABLE_OBSERVABILITY_STACK, false)
}

function localShipyardForceRebuildEnabled(runtime: LocalBootstrapRuntime): boolean {
  return parseBooleanEnv(runtime.env.LOCAL_SHIPYARD_FORCE_REBUILD_APP_IMAGE, false)
}

function isKindMissingClusterError(result: LocalBootstrapCommandResult): boolean {
  const raw = [result.stdout, result.stderr, result.error || ""].join("\n").toLowerCase()
  return raw.includes("no nodes found for cluster")
}

function kindClusterNameFromContext(kubeContext: string): string {
  const trimmed = kubeContext.trim()
  if (trimmed.startsWith("kind-") && trimmed.length > "kind-".length) {
    return trimmed.slice("kind-".length)
  }
  return trimmed || "orchwiz"
}

function asRecordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function asArrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asNumberValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return value
}

function uniqueNonEmptyCommands(commands: string[]): string[] {
  return [...new Set(commands.map((entry) => entry.trim()).filter(Boolean))]
}

async function collectKubernetesFailureDiagnostics(args: {
  runtime: LocalBootstrapRuntime
  infrastructure: InfrastructureConfig
  appName: string
}): Promise<KubernetesFailureDiagnostics | null> {
  if (!args.runtime.commandExists("kubectl")) {
    return null
  }

  const podsResult = await args.runtime.runCommand(
    "kubectl",
    kubectlArgs(args.infrastructure, ["get", "pods", "-o", "json"]),
    { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
  )

  if (!podsResult.ok) {
    return {
      checkedAt: new Date().toISOString(),
      context: args.infrastructure.kubeContext,
      namespace: args.infrastructure.namespace,
      appName: args.appName,
      rolloutStatus: null,
      failingPods: [],
      appLogHighlights: extractProvisioningHighSignalLines(outputTail(podsResult)),
    }
  }

  let podsPayload: Record<string, unknown> | null = null
  try {
    podsPayload = JSON.parse(podsResult.stdout) as Record<string, unknown>
  } catch {
    podsPayload = null
  }

  const podItems = asArrayValue<Record<string, unknown>>(asRecordValue(podsPayload)?.items)
  const podDiagnostics = podItems
    .map((item) => {
      const pod = asRecordValue(item)
      const metadata = asRecordValue(pod?.metadata)
      const status = asRecordValue(pod?.status)
      const podName = asNonEmptyString(metadata?.name)
      if (!podName) {
        return null
      }

      const phase = asNonEmptyString(status?.phase) || "Unknown"
      const podReason = asNonEmptyString(status?.reason)
      const containerStatuses = asArrayValue<Record<string, unknown>>(status?.containerStatuses)
      const readyContainers = containerStatuses.filter((entry) => {
        const record = asRecordValue(entry)
        return record?.ready === true
      }).length
      const totalContainers = containerStatuses.length
      const restartCount = containerStatuses.reduce((sum, entry) => {
        const record = asRecordValue(entry)
        const restart = asNumberValue(record?.restartCount) || 0
        return sum + restart
      }, 0)

      const waitingReasons: string[] = []
      for (const containerStatus of containerStatuses) {
        const statusRecord = asRecordValue(containerStatus)
        const state = asRecordValue(statusRecord?.state)
        const waiting = asRecordValue(state?.waiting)
        const waitingReason = asNonEmptyString(waiting?.reason)
        if (waitingReason) {
          waitingReasons.push(waitingReason)
        }
        const lastState = asRecordValue(statusRecord?.lastState)
        const terminated = asRecordValue(lastState?.terminated)
        const terminatedReason = asNonEmptyString(terminated?.reason)
        if (terminatedReason) {
          waitingReasons.push(terminatedReason)
        }
      }

      if (podReason) {
        waitingReasons.push(podReason)
      }

      const reasons = [...new Set(waitingReasons)]
      const isNotReady =
        phase !== "Running"
        || (totalContainers > 0 && readyContainers < totalContainers)
        || reasons.some((reason) => {
          const normalized = reason.toLowerCase()
          return normalized.includes("crashloop")
            || normalized.includes("imagepull")
            || normalized.includes("errimagepull")
            || normalized.includes("error")
        })

      if (!isNotReady) {
        return null
      }

      return {
        name: podName,
        phase,
        ready: `${readyContainers}/${totalContainers}`,
        restartCount,
        reasons,
      } satisfies KubernetesFailurePodDiagnostics
    })
    .filter((entry): entry is KubernetesFailurePodDiagnostics => entry !== null)
    .sort((left, right) => right.restartCount - left.restartCount)

  const rolloutResult = await args.runtime.runCommand(
    "kubectl",
    kubectlArgs(args.infrastructure, ["rollout", "status", `deployment/${args.appName}`, "--timeout=5s"]),
    { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
  )
  const rolloutStatus = outputTail(rolloutResult)

  const appPod = podDiagnostics.find((pod) => pod.name.startsWith(`${args.appName}-`))
  let appLogHighlights: string[] = []
  if (appPod) {
    const appLogsResult = await args.runtime.runCommand(
      "kubectl",
      kubectlArgs(args.infrastructure, ["logs", appPod.name, "--tail=200"]),
      { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
    )
    appLogHighlights = extractProvisioningHighSignalLines(outputTail(appLogsResult))
  }

  return {
    checkedAt: new Date().toISOString(),
    context: args.infrastructure.kubeContext,
    namespace: args.infrastructure.namespace,
    appName: args.appName,
    rolloutStatus: rolloutResult.ok ? null : rolloutStatus,
    failingPods: podDiagnostics,
    appLogHighlights,
  }
}

function summarizeProvisioningFailure(args: {
  output: string
  infrastructure: InfrastructureConfig
  appName: string
  kubernetesDiagnostics: KubernetesFailureDiagnostics | null
}): ProvisioningFailureSummary {
  const outputLower = args.output.toLowerCase()
  const evidence = extractProvisioningHighSignalLines(args.output)
  const kubeReasons = args.kubernetesDiagnostics
    ? args.kubernetesDiagnostics.failingPods.flatMap((pod) => pod.reasons.map((reason) => reason.toLowerCase()))
    : []
  const appLogLower = (args.kubernetesDiagnostics?.appLogHighlights || []).map((line) => line.toLowerCase())

  const hasImagePull = kubeReasons.some((reason) => reason.includes("imagepull") || reason.includes("errimagepull"))
  const hasCrashLoop = kubeReasons.some((reason) => reason.includes("crashloop"))
  const hasProviderProxyImageForbidden =
    outputLower.includes("qschlegel/orchwiz-provider-proxy") && outputLower.includes("403 forbidden")
  const hasSwcMismatch = (
    evidence.some((line) => /turbo\.createproject|swc-linux-arm64/iu.test(line))
    || appLogLower.some((line) => line.includes("turbo.createproject") || line.includes("swc-linux-arm64"))
  )
  const waitingForRollout = outputLower.includes("waiting for rollout to finish")

  if (hasSwcMismatch) {
    return {
      reasonCode: "orchwiz_startup_swc_mismatch",
      title: "OrchWiz app startup failed inside cluster",
      summary: "The app pod crashed during Next.js startup due to missing native SWC bindings in the container image.",
      confidence: "high",
      evidence,
      suggestedCommands: [
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} logs deploy/${args.appName} --tail=120`,
        "docker build -f node/Dockerfile.shipyard -t orchwiz:local-dev node",
      ],
    }
  }

  if (hasImagePull) {
    if (hasProviderProxyImageForbidden) {
      return {
        reasonCode: "provider_proxy_image_forbidden",
        title: "Provider-proxy image could not be pulled",
        summary: "Kubernetes cannot pull ghcr.io/qschlegel/orchwiz-provider-proxy:latest (403 Forbidden).",
        confidence: "high",
        evidence,
        suggestedCommands: [
          "docker build -f services/provider-proxy/Dockerfile -t orchwiz-provider-proxy:local-dev services/provider-proxy",
          "kind load docker-image orchwiz-provider-proxy:local-dev --name orchwiz",
          "Re-run launch with TF_VAR_provider_proxy_image=orchwiz-provider-proxy:local-dev",
        ],
      }
    }

    return {
      reasonCode: "kubernetes_image_pull_failure",
      title: "Kubernetes failed to pull one or more images",
      summary: "At least one pod is in ImagePullBackOff/ErrImagePull, so rollout cannot complete.",
      confidence: "high",
      evidence,
      suggestedCommands: [
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} get pods`,
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} describe pod <pod-name>`,
      ],
    }
  }

  if (hasCrashLoop || waitingForRollout) {
    return {
      reasonCode: "kubernetes_rollout_not_ready",
      title: "Kubernetes rollout did not become ready",
      summary: "Terraform waited for deployment readiness, but at least one pod failed readiness or restarted.",
      confidence: hasCrashLoop ? "high" : "medium",
      evidence,
      suggestedCommands: [
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} rollout status deployment/${args.appName} --timeout=300s`,
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} get pods`,
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} logs deploy/${args.appName} --tail=120`,
      ],
    }
  }

  return {
    reasonCode: "local_provisioning_failed",
    title: "Local provisioning failed",
    summary: "Ansible/Terraform returned a non-zero exit code.",
    confidence: "low",
    evidence,
    suggestedCommands: [],
  }
}

async function analyzeProvisioningFailure(args: {
  runtime: LocalBootstrapRuntime
  infrastructure: InfrastructureConfig
  appName: string
  output: string
}): Promise<{
  summary: ProvisioningFailureSummary
  kubernetesDiagnostics: KubernetesFailureDiagnostics | null
  suggestedCommands: string[]
}> {
  const kubernetesDiagnostics = await collectKubernetesFailureDiagnostics({
    runtime: args.runtime,
    infrastructure: args.infrastructure,
    appName: args.appName,
  })
  const summary = summarizeProvisioningFailure({
    output: args.output,
    infrastructure: args.infrastructure,
    appName: args.appName,
    kubernetesDiagnostics,
  })

  const diagnosticCommands = kubernetesDiagnostics?.failingPods.length
    ? [
        `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} get pods`,
        ...kubernetesDiagnostics.failingPods.slice(0, 2).map(
          (pod) => `kubectl --context ${args.infrastructure.kubeContext} -n ${args.infrastructure.namespace} describe pod ${pod.name}`,
        ),
      ]
    : []

  return {
    summary,
    kubernetesDiagnostics,
    suggestedCommands: uniqueNonEmptyCommands([
      ...summary.suggestedCommands,
      ...diagnosticCommands,
    ]),
  }
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

  args.runtime.onProgress?.(45, "checking_kind", "Checking for existing Kind cluster")

  const forceRebuild = localShipyardForceRebuildEnabled(args.runtime)
  const imageIdBeforeResult = await args.runtime.runCommand(
    "docker",
    ["image", "inspect", imageTag, "--format", "{{.Id}}"],
    { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
  )
  const imageIdBefore = imageIdBeforeResult.ok ? asNonEmptyString(imageIdBeforeResult.stdout) : null

  // Always run `docker build` when sane bootstrap is enabled. Docker layer caching keeps this fast when
  // nothing changed, and it ensures ship launches don't reuse stale images after code changes.
  args.runtime.onProgress?.(50, "building_image", "Building app image")
  if (isVerboseOrResourceUsageEnabled(args.runtime.env)) {
    args.runtime.emitLaunchLog?.({
      level: "debug",
      source: "local-bootstrap",
      lines: ["[local-bootstrap] Docker build started"],
    })
  }

  const buildStartAt = Date.now()
  const buildArgs = ["build", "-f", dockerfilePath, "-t", imageTag]
  if (forceRebuild) {
    buildArgs.push("--no-cache")
  }
  buildArgs.push(dockerContextPath)

  const buildResult = await args.runtime.runCommand("docker", buildArgs, {
    cwd: args.paths.repoRoot,
    timeoutMs: args.timeoutMs,
  })

  if (isVerboseOrResourceUsageEnabled(args.runtime.env)) {
    const buildElapsedSec = Math.round((Date.now() - buildStartAt) / 1000)
    args.runtime.emitLaunchLog?.({
      level: "debug",
      source: "local-bootstrap",
      lines: [`[local-bootstrap] Docker build completed in ${buildElapsedSec}s`],
    })
  }

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

  const imageIdAfterResult = await args.runtime.runCommand(
    "docker",
    ["image", "inspect", imageTag, "--format", "{{.Id}}"],
    { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
  )
  const imageIdAfter = imageIdAfterResult.ok ? asNonEmptyString(imageIdAfterResult.stdout) : null
  // Be conservative: if we cannot detect the image ID, assume it changed so we can force a rollout.
  const imageChanged = imageIdAfter === null
    ? true
    : imageIdBefore === null
      ? true
      : imageIdBefore !== imageIdAfter

  const clusterName = args.runtime.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim()
    || kindClusterNameFromContext(args.input.infrastructure.kubeContext)

  const autoCreateCluster = localShipyardAutoCreateKindClusterEnabled(args.input, args.runtime)

  let kindClusterAutoCreated = false
  let appImageLoadOutputTailBeforeCreate: string | null = null
  let kindClusterCreateOutputTail: string | null = null

  args.runtime.onProgress?.(58, "loading_image", "Loading image into cluster")

  let loadResult = await args.runtime.runCommand(
    "kind",
    ["load", "docker-image", imageTag, "--name", clusterName],
    { timeoutMs: args.timeoutMs },
  )

  if (!loadResult.ok && autoCreateCluster && isKindMissingClusterError(loadResult)) {
    appImageLoadOutputTailBeforeCreate = outputTail(loadResult)

    args.runtime.onProgress?.(47, "creating_kind_cluster", "Creating Kind cluster (this may take a moment)")

    const createResult = await args.runtime.runCommand(
      "kind",
      ["create", "cluster", "--name", clusterName],
      { timeoutMs: args.timeoutMs },
    )
    if (!createResult.ok) {
      return toFailure(
        "LOCAL_PROVISIONING_FAILED",
        "Failed to create kind cluster for local provisioning.",
        {
          details: {
            suggestedCommands: [
              `kind create cluster --name ${clusterName}`,
              `kubectl config use-context kind-${clusterName}`,
              `kind load docker-image ${imageTag} --name ${clusterName}`,
            ],
          },
          metadata: {
            kindClusterCreateOutputTail: outputTail(createResult),
            appImageLoadOutputTail: appImageLoadOutputTailBeforeCreate,
          },
        },
      )
    }

    kindClusterAutoCreated = true
    kindClusterCreateOutputTail = outputTail(createResult)

    args.runtime.onProgress?.(58, "loading_image", "Loading image into cluster")

    loadResult = await args.runtime.runCommand(
      "kind",
      ["load", "docker-image", imageTag, "--name", clusterName],
      { timeoutMs: args.timeoutMs },
    )
  }

  if (!loadResult.ok) {
    const suggestedCommands = [
      `kind load docker-image ${imageTag} --name ${clusterName}`,
    ]
    if (isKindMissingClusterError(loadResult)) {
      suggestedCommands.unshift(`kubectl config use-context kind-${clusterName}`)
      suggestedCommands.unshift(`kind create cluster --name ${clusterName}`)
    }
    return toFailure(
      "LOCAL_PROVISIONING_FAILED",
      "Failed to load local app image into kind cluster.",
      {
        details: {
          suggestedCommands,
        },
        metadata: {
          appImageLoadOutputTail: outputTail(loadResult),
          appImageLoadOutputTailBeforeCreate,
          kindClusterCreateOutputTail,
        },
      },
    )
  }

  args.runtime.onProgress?.(65, "image_loaded", "App image loaded")

  return {
    ok: true,
    image: imageTag,
    metadata: {
      imageTag,
      imageIdBefore,
      imageIdAfter,
      imageChanged,
      dockerfilePath,
      dockerContextPath,
      clusterName,
      forceRebuild,
      kindClusterAutoCreated,
    },
  }
}

function derivedProvisioningSuggestions(args: {
  baseCommand: string
  infrastructure: InfrastructureConfig
  output: string
}): string[] {
  const suggestions = args.baseCommand.trim().length > 0 ? [args.baseCommand] : []
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

  if (lower.includes("qschlegel/orchwiz-provider-proxy") && lower.includes("403 forbidden")) {
    suggestions.unshift(
      "TF_VAR_provider_proxy_image=orchwiz-provider-proxy:local-dev <your-launch-command>",
    )
    suggestions.unshift(
      "kind load docker-image orchwiz-provider-proxy:local-dev --name orchwiz",
    )
    suggestions.unshift(
      "docker build -f services/provider-proxy/Dockerfile -t orchwiz-provider-proxy:local-dev services/provider-proxy",
    )
  }

  if (lower.includes("waiting for rollout to finish")) {
    suggestions.unshift("kubectl --context kind-orchwiz -n orchwiz-starship get pods")
    suggestions.unshift("kubectl --context kind-orchwiz -n orchwiz-starship logs deploy/orchwiz --tail=120")
    suggestions.unshift("kubectl --context kind-orchwiz -n orchwiz-starship rollout status deployment/orchwiz --timeout=300s")
  }

  if (lower.includes("turbo.createproject") || lower.includes("swc-linux-arm64")) {
    suggestions.unshift("kubectl --context kind-orchwiz -n orchwiz-starship logs deploy/orchwiz --tail=120")
    suggestions.unshift("Rebuild the local image after ensuring node/Dockerfile.shipyard installs the platform-specific @next/swc package.")
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
  const deploymentProfile = resolveDeploymentProfile(input)
  const lightweightAppEnv = lightweightAppEnvOverrides(input)
  const observabilityStackEnabled = localShipyardObservabilityStackEnabled(input, runtime)
  const leanObservabilityDefaultsForced =
    isLocalDeploymentProfile(deploymentProfile) && !observabilityStackEnabled

  const installMetadata: Record<string, unknown> = {
    requiredCommands,
    saneBootstrap: input.saneBootstrap,
    deploymentProfile,
    localObservability: {
      stackEnabled: observabilityStackEnabled,
      leanDefaultsForced: leanObservabilityDefaultsForced,
      forcedTfVars: leanObservabilityDefaultsForced
        ? {
            enable_grafana: false,
            enable_prometheus: false,
            enable_loki: false,
            enable_clickhouse: false,
            enable_langfuse: false,
          }
        : {},
    },
    ...(lightweightAppEnv
      ? {
          lightweightBootstrap: {
            openClawTargetDeployments: runtime.env.OPENCLAW_TARGET_DEPLOYMENTS?.trim().length
              ? runtime.env.OPENCLAW_TARGET_DEPLOYMENTS
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean)
              : [...LIGHTWEIGHT_OPENCLAW_TARGET_DEPLOYMENTS],
            openClawStationCount:
              runtime.env.TF_VAR_openclaw_station_count?.trim() || LIGHTWEIGHT_OPENCLAW_STATION_COUNT,
            appEnvOverrides: lightweightAppEnv,
          },
        }
      : {}),
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
  let contextSet = new Set(contexts)

  if (!contextSet.has(input.infrastructure.kubeContext)) {
    const canAutoCreateKind =
      input.infrastructure.kind === "kind" &&
      localShipyardAutoCreateKindClusterEnabled(input, runtime) &&
      runtime.commandExists("kind")
    const clusterName =
      runtime.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim() ||
      kindClusterNameFromContext(input.infrastructure.kubeContext)

    if (canAutoCreateKind && input.infrastructure.kubeContext === `kind-${clusterName}`) {
      if (isVerboseOrResourceUsageEnabled(runtime.env)) {
        runtime.emitLaunchLog?.({
          level: "info",
          source: "local-bootstrap",
          lines: [`[local-bootstrap] Creating Kind cluster '${clusterName}' (context ${input.infrastructure.kubeContext})`],
        })
      }
      runtime.onProgress?.(66, "creating_kind_cluster", "Creating Kind cluster (this may take a moment)")
      const createResult = await runtime.runCommand(
        "kind",
        ["create", "cluster", "--name", clusterName],
        { timeoutMs: KIND_CREATE_CLUSTER_TIMEOUT_MS },
      )
      if (createResult.ok) {
        const recheckResult = await runtime.runCommand(
          "kubectl",
          ["config", "get-contexts", "-o", "name"],
          { timeoutMs: CONTEXT_CHECK_TIMEOUT_MS },
        )
        if (recheckResult.ok) {
          const newContexts = recheckResult.stdout
            .split("\n")
            .map((entry) => entry.trim())
            .filter(Boolean)
          contextSet = new Set(newContexts)
          installMetadata.kindClusterAutoCreated = true
        }
      }
    }

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
            discoveredContexts: Array.from(contextSet),
          },
        },
      )
    }
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
    ...(asNonEmptyString(runtime.env.ORCHWIZ_RUNTIME_JWT_SECRET)
      ? {
          TF_VAR_runtime_jwt_secret: asNonEmptyString(runtime.env.ORCHWIZ_RUNTIME_JWT_SECRET) || "",
        }
      : {}),
    ...(lightweightAppEnv
      ? {
          TF_VAR_openclaw_station_count:
            runtime.env.TF_VAR_openclaw_station_count?.trim() || LIGHTWEIGHT_OPENCLAW_STATION_COUNT,
        }
      : {}),
    ...(lightweightAppEnv
      ? {
          TF_VAR_app_env: JSON.stringify(lightweightAppEnv),
        }
      : {}),
    ...(leanObservabilityDefaultsForced
      ? {
          TF_VAR_enable_grafana: "false",
          TF_VAR_enable_prometheus: "false",
          TF_VAR_enable_loki: "false",
          TF_VAR_enable_clickhouse: "false",
          TF_VAR_enable_langfuse: "false",
        }
      : {}),
    ...(installMetadata.localAppImage
      ? {
          TF_VAR_app_image: (installMetadata.localAppImage as { imageTag?: string }).imageTag || "",
        }
      : {}),
  }

  runtime.onProgress?.(68, "provisioning_ansible", "Deploying with Ansible")
  if (isVerboseOrResourceUsageEnabled(runtime.env)) {
    runtime.emitLaunchLog?.({
      level: "debug",
      source: "local-bootstrap",
      lines: ["[local-bootstrap] Running Ansible playbook (Terraform init → plan → apply)"],
    })
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
    const appName = runtime.env.ORCHWIZ_APP_NAME || "orchwiz"
    const provisioningFailure = await analyzeProvisioningFailure({
      runtime,
      infrastructure: input.infrastructure,
      appName,
      output: provisionOutput,
    })
    const mergedSuggestedCommands = uniqueNonEmptyCommands([
      ...provisioningFailure.suggestedCommands,
      ...derivedProvisioningSuggestions({
        baseCommand: "",
        infrastructure: input.infrastructure,
        output: provisionOutput,
      }),
    ]).filter((command) => command.length > 0)
    const baseCommand = `TF_DIR=${paths.terraformEnvDirAbsolute} INFRASTRUCTURE_KIND=${input.infrastructure.kind} KUBE_CONTEXT=${input.infrastructure.kubeContext} ORCHWIZ_NAMESPACE=${input.infrastructure.namespace} ORCHWIZ_APP_NAME=${runtime.env.ORCHWIZ_APP_NAME || "orchwiz"}${provisionEnv.TF_VAR_openclaw_station_count ? ` TF_VAR_openclaw_station_count=${provisionEnv.TF_VAR_openclaw_station_count}` : ""}${provisionEnv.TF_VAR_app_image ? ` TF_VAR_app_image=${provisionEnv.TF_VAR_app_image}` : ""}${provisionEnv.TF_VAR_app_env ? ` TF_VAR_app_env='${provisionEnv.TF_VAR_app_env}'` : ""}${provisionEnv.TF_VAR_enable_grafana ? ` TF_VAR_enable_grafana=${provisionEnv.TF_VAR_enable_grafana}` : ""}${provisionEnv.TF_VAR_enable_prometheus ? ` TF_VAR_enable_prometheus=${provisionEnv.TF_VAR_enable_prometheus}` : ""}${provisionEnv.TF_VAR_enable_loki ? ` TF_VAR_enable_loki=${provisionEnv.TF_VAR_enable_loki}` : ""}${provisionEnv.TF_VAR_enable_clickhouse ? ` TF_VAR_enable_clickhouse=${provisionEnv.TF_VAR_enable_clickhouse}` : ""}${provisionEnv.TF_VAR_enable_langfuse ? ` TF_VAR_enable_langfuse=${provisionEnv.TF_VAR_enable_langfuse}` : ""} ansible-playbook -i ${paths.ansibleInventoryAbsolute} ${paths.ansiblePlaybookAbsolute}`
    const suggestedCommands = uniqueNonEmptyCommands([
      ...mergedSuggestedCommands.filter((entry) => entry !== ""),
      baseCommand,
    ])

    runtime.emitLaunchLog?.({
      level: "error",
      source: "local-bootstrap",
      lines: [`[diagnostic] ${provisioningFailure.summary.title}: ${provisioningFailure.summary.summary}`],
    })
    if (provisioningFailure.summary.evidence.length > 0) {
      runtime.emitLaunchLog?.({
        level: "error",
        source: "local-bootstrap",
        lines: provisioningFailure.summary.evidence.slice(0, 5).map((line) => `[diagnostic] evidence: ${line}`),
      })
    }

    return toFailure(
      "LOCAL_PROVISIONING_FAILED",
      "Local provisioning failed while running ansible playbook.",
      {
        details: {
          suggestedCommands,
        },
        metadata: {
          ...installMetadata,
          provisionOutputTail: provisionOutput,
          provisionCommand: provisionCommand.join(" "),
          provisionTimeoutMs: timeoutMs,
          provisioningFailureSummary: provisioningFailure.summary,
          ...(provisioningFailure.kubernetesDiagnostics
            ? { kubernetesDiagnostics: provisioningFailure.kubernetesDiagnostics }
            : {}),
        },
      },
    )
  }

  runtime.onProgress?.(72, "provisioning_complete", "Infrastructure provisioned")

  const localAppImageMetadata = installMetadata.localAppImage as Record<string, unknown> | undefined
  const localAppImageChanged = localAppImageMetadata ? (localAppImageMetadata.imageChanged === true) : false
  if (localAppImageChanged && input.infrastructure.kind === "kind") {
    const appName = runtime.env.ORCHWIZ_APP_NAME || "orchwiz"
    const rolloutTimeoutMs = Math.max(timeoutMs, 320_000)
    const restartResult = await runtime.runCommand(
      "kubectl",
      kubectlArgs(input.infrastructure, ["rollout", "restart", `deployment/${appName}`]),
      { timeoutMs: rolloutTimeoutMs },
    )
    if (!restartResult.ok) {
      return toFailure(
        "LOCAL_PROVISIONING_FAILED",
        "Failed to restart local starship app deployment after rebuilding the image.",
        {
          details: {
            suggestedCommands: [
              `kubectl --context ${input.infrastructure.kubeContext} -n ${input.infrastructure.namespace} rollout restart deployment/${appName}`,
              `kubectl --context ${input.infrastructure.kubeContext} -n ${input.infrastructure.namespace} rollout status deployment/${appName} --timeout=300s`,
            ],
          },
          metadata: {
            appName,
            appRestartOutputTail: outputTail(restartResult),
            ...installMetadata,
          },
        },
      )
    }

    const rolloutResult = await runtime.runCommand(
      "kubectl",
      kubectlArgs(input.infrastructure, ["rollout", "status", `deployment/${appName}`, "--timeout=300s"]),
      { timeoutMs: rolloutTimeoutMs },
    )
    if (!rolloutResult.ok) {
      return toFailure(
        "LOCAL_PROVISIONING_FAILED",
        "Local starship app deployment did not become ready after restart.",
        {
          metadata: {
            appName,
            appRolloutOutputTail: outputTail(rolloutResult),
            ...installMetadata,
          },
        },
      )
    }

    installMetadata.localAppImage = {
      ...(localAppImageMetadata || {}),
      appRolloutRestarted: true,
    }
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

  const runtimeUi = await resolveLocalRuntimeUiMetadata({
    runtime,
    terraformEnvDirAbsolute: paths.terraformEnvDirAbsolute,
    timeoutMs,
  })

  const observability = await resolveLocalObservabilityMetadata({
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
        observabilityStackEnabled,
        leanObservabilityDefaultsForced,
      },
      provisionOutputTail: outputTail(provisionResult),
      openClawContextInjection: openClawContextInjection.summary,
      kubeview,
      runtimeUi,
      observability,
    },
  }
}
