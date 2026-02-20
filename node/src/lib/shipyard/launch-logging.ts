import { accessSync, constants, existsSync, lstatSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { spawn } from "node:child_process"
import type { LocalBootstrapRuntime } from "@/lib/deployment/local-bootstrap"
import type { ShipyardCloudBootstrapRuntime } from "@/lib/deployment/shipyard-cloud-bootstrap"
import {
  getLocalBootstrapResourceSnapshot,
  formatResourceSnapshotLine,
  isVerboseOrResourceUsageEnabled,
} from "@/lib/deployment/local-bootstrap-resources"
import { publishRealtimeEvent } from "@/lib/realtime/events"

export const SHIP_LAUNCH_LOG_EVENT_TYPE = "ship.launch.log" as const

export type ShipLaunchLogLevel = "debug" | "info" | "warn" | "error"
export type ShipLaunchLogSource =
  | "ship-yard"
  | "local-bootstrap"
  | "cloud-bootstrap"
  | "deployment-adapter"
  | "apps-bootstrap"
export type ShipLaunchLogStream = "stdout" | "stderr"

export interface ShipLaunchLogPayload {
  requestId: string
  deploymentId: string | null
  level: ShipLaunchLogLevel
  source: ShipLaunchLogSource
  stream?: ShipLaunchLogStream
  capturedAt?: string
  lines: string[]
}

export function publishShipLaunchLog(args: { userId: string; payload: ShipLaunchLogPayload }) {
  return publishRealtimeEvent({
    type: SHIP_LAUNCH_LOG_EVENT_TYPE,
    userId: args.userId,
    payload: args.payload,
  })
}

type EmitLaunchLog = (entry: Omit<ShipLaunchLogPayload, "requestId" | "deploymentId">) => void

export interface StreamingRunCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
}

export interface StreamingRunCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  exitCode: number | null
}

const ANSI_ESCAPE_REGEX = /\u001b\[[0-?]*[ -/]*[@-~]/g
const DEFAULT_TIMEOUT_MS = 60_000
const MAX_EMITTED_LINE_CHARS = 8_000
const MAX_ACCUMULATED_CHARS = 8 * 1024 * 1024
const RESOURCE_SAMPLING_INTERVAL_MS = 45_000
const RESOURCE_SAMPLING_MIN_TIMEOUT_MS = 60_000
const POD_OVERVIEW_SAMPLING_TIMEOUT_MS = 12_000
const POD_OVERVIEW_MAX_NAMESPACES = 8
const POD_OVERVIEW_MAX_REASONS = 5
const POD_STALL_STREAK_THRESHOLD = 3
const POD_STALL_MAX_NAMESPACES = 3
const POD_STALL_MAX_REASONS = 3
const POD_OVERVIEW_LOG_PREFIX = "[pods-overview]"
const HIGH_SIGNAL_FAILURE_PATTERNS: RegExp[] = [
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
const STDERR_WARNING_PATTERNS: RegExp[] = [
  /\bwarn(?:ing)?\b/iu,
  /\berror\b/iu,
  /\bfatal\b/iu,
  /\bfailed\b/iu,
  /\bunhealthy\b/iu,
  /\btimeout\b/iu,
  /imagepullbackoff/iu,
  /errimagepull/iu,
  /crashloopbackoff/iu,
]

interface CapturedCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  spawnError?: string
}

interface PodContainerStatusLike {
  state?: {
    waiting?: {
      reason?: string | null
    } | null
  } | null
}

interface PodStatusLike {
  phase?: string
  initContainerStatuses?: PodContainerStatusLike[]
  containerStatuses?: PodContainerStatusLike[]
  ephemeralContainerStatuses?: PodContainerStatusLike[]
}

interface PodLike {
  metadata?: {
    namespace?: string
  }
  status?: PodStatusLike
}

interface PodListLike {
  items?: PodLike[]
}

interface PodNamespaceOverview {
  name: string
  total: number
  running: number
  pending: number
  succeeded: number
  failed: number
  unknown: number
  waiting: number
  crashing: number
}

interface PodOverviewPayload {
  capturedAt: string
  context: string
  total: number
  phases: {
    running: number
    pending: number
    succeeded: number
    failed: number
    unknown: number
  }
  namespaces: PodNamespaceOverview[]
  topWaitingReasons: Array<{
    reason: string
    count: number
  }>
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_REGEX, "")
}

function truncateLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line
  const suffix = "..."
  if (maxChars <= suffix.length) {
    return suffix.slice(0, Math.max(0, maxChars))
  }
  return `${line.slice(0, maxChars - suffix.length)}${suffix}`
}

function normalizeLines(lines: string[]): string[] {
  const out: string[] = []
  for (const raw of lines) {
    const stripped = stripAnsi(raw)
    const trimmed = stripped.replace(/\r$/u, "")
    if (trimmed.length === 0) continue
    out.push(truncateLine(trimmed, MAX_EMITTED_LINE_CHARS))
  }
  return out
}

function normalizeLineForDedup(line: string): string {
  return line.trim().toLowerCase()
}

function stderrLevel(lines: string[]): ShipLaunchLogLevel {
  return lines.some((line) => STDERR_WARNING_PATTERNS.some((pattern) => pattern.test(line)))
    ? "warn"
    : "debug"
}

function highSignalFailureLines(lines: string[]): string[] {
  const matches: string[] = []
  for (const line of lines) {
    if (!HIGH_SIGNAL_FAILURE_PATTERNS.some((pattern) => pattern.test(line))) {
      continue
    }
    matches.push(line)
  }
  return matches
}

function appendCapped(buffer: string, chunk: string, maxChars: number): string {
  const next = buffer + chunk
  if (next.length <= maxChars) return next
  return next.slice(next.length - maxChars)
}

function resolveKubeContext(env: NodeJS.ProcessEnv): string {
  return (env.KUBE_CONTEXT?.trim() || env.TF_VAR_kube_context?.trim() || "").trim()
}

function phaseKeyForPod(phaseRaw: string | undefined): keyof PodOverviewPayload["phases"] {
  if (phaseRaw === "Running") return "running"
  if (phaseRaw === "Pending") return "pending"
  if (phaseRaw === "Succeeded") return "succeeded"
  if (phaseRaw === "Failed") return "failed"
  return "unknown"
}

function waitingSignal(status: PodStatusLike | undefined): {
  waiting: boolean
  crashing: boolean
  reasons: string[]
} {
  if (!status) {
    return { waiting: false, crashing: false, reasons: [] }
  }

  let waiting = false
  let crashing = false
  const reasons = new Set<string>()
  const collections = [
    status.initContainerStatuses,
    status.containerStatuses,
    status.ephemeralContainerStatuses,
  ]
  for (const collection of collections) {
    if (!Array.isArray(collection)) {
      continue
    }
    for (const entry of collection) {
      const reason = entry?.state?.waiting?.reason
      if (typeof reason !== "string" || reason.length === 0) {
        continue
      }
      waiting = true
      reasons.add(reason)
      if (reason === "CrashLoopBackOff" || reason === "ImagePullBackOff" || reason === "ErrImagePull") {
        crashing = true
      }
    }
  }

  return { waiting, crashing, reasons: Array.from(reasons) }
}

async function captureCommandOutput(args: {
  command: string
  commandArgs: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs: number
}): Promise<CapturedCommandResult> {
  const env = args.env || process.env

  let stdout = ""
  let stderr = ""
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let timedOut = false

  const child = spawn(args.command, args.commandArgs, {
    cwd: args.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  child.stdout?.on("data", (chunk: Buffer) => {
    stdout = appendCapped(stdout, chunk.toString("utf8"), MAX_ACCUMULATED_CHARS)
  })
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr = appendCapped(stderr, chunk.toString("utf8"), MAX_ACCUMULATED_CHARS)
  })

  const result = await new Promise<{
    exitCode: number | null
    signal: NodeJS.Signals | null
    spawnError?: string
  }>((resolve) => {
    child.on("error", (error) => {
      resolve({ exitCode: null, signal: null, spawnError: error.message })
    })
    child.on("close", (exitCode, signal) => {
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : null,
        signal: (signal as NodeJS.Signals | null) || null,
      })
    })

    timeoutId = setTimeout(() => {
      timedOut = true
      try {
        child.kill("SIGTERM")
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL")
        } catch {
          // ignore
        }
      }, 1_000)
    }, args.timeoutMs)
  })

  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  const cleanedStdout = stripAnsi(stdout)
  const cleanedStderr = stripAnsi(stderr)
  return {
    ok: !timedOut && !result.spawnError && result.exitCode === 0,
    stdout: cleanedStdout,
    stderr: cleanedStderr,
    exitCode: result.exitCode,
    timedOut,
    ...(result.spawnError ? { spawnError: result.spawnError } : {}),
  }
}

async function capturePodOverview(args: {
  cwd?: string
  env?: NodeJS.ProcessEnv
}): Promise<PodOverviewPayload | null> {
  const env = args.env || process.env
  const kubeContext = resolveKubeContext(env)
  const kubectlArgs = kubeContext
    ? ["--context", kubeContext, "get", "pods", "-A", "-o", "json"]
    : ["get", "pods", "-A", "-o", "json"]

  const result = await captureCommandOutput({
    command: "kubectl",
    commandArgs: kubectlArgs,
    cwd: args.cwd,
    env,
    timeoutMs: POD_OVERVIEW_SAMPLING_TIMEOUT_MS,
  })
  if (!result.ok || result.stdout.trim().length === 0) {
    return null
  }

  let parsed: PodListLike
  try {
    parsed = JSON.parse(result.stdout) as PodListLike
  } catch {
    return null
  }
  const pods = Array.isArray(parsed.items) ? parsed.items : []

  const phases: PodOverviewPayload["phases"] = {
    running: 0,
    pending: 0,
    succeeded: 0,
    failed: 0,
    unknown: 0,
  }
  const namespaceMap = new Map<string, PodNamespaceOverview>()
  const waitingReasonCounts = new Map<string, number>()

  for (const pod of pods) {
    const namespace =
      typeof pod?.metadata?.namespace === "string" && pod.metadata.namespace.trim().length > 0
        ? pod.metadata.namespace
        : "default"
    const phaseKey = phaseKeyForPod(pod?.status?.phase)
    phases[phaseKey] += 1

    const current = namespaceMap.get(namespace) || {
      name: namespace,
      total: 0,
      running: 0,
      pending: 0,
      succeeded: 0,
      failed: 0,
      unknown: 0,
      waiting: 0,
      crashing: 0,
    }
    current.total += 1
    current[phaseKey] += 1

    const waitState = waitingSignal(pod?.status)
    if (waitState.waiting) {
      current.waiting += 1
    }
    if (waitState.crashing) {
      current.crashing += 1
    }
    for (const reason of waitState.reasons) {
      waitingReasonCounts.set(reason, (waitingReasonCounts.get(reason) || 0) + 1)
    }
    namespaceMap.set(namespace, current)
  }

  const namespaces = Array.from(namespaceMap.values())
    .sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name))
    .slice(0, POD_OVERVIEW_MAX_NAMESPACES)
  const topWaitingReasons = Array.from(waitingReasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => (b.count - a.count) || a.reason.localeCompare(b.reason))
    .slice(0, POD_OVERVIEW_MAX_REASONS)

  return {
    capturedAt: new Date().toISOString(),
    context: kubeContext || "current",
    total: pods.length,
    phases,
    namespaces,
    topWaitingReasons,
  }
}

function formatPodOverviewLine(overview: PodOverviewPayload): string {
  return `${POD_OVERVIEW_LOG_PREFIX} ${JSON.stringify(overview)}`
}

function commandLineString(command: string, args: string[]): string {
  const parts = [command, ...args].map((part) => {
    if (!part) return "\"\""
    if (/[\s"'\\]/u.test(part)) {
      return JSON.stringify(part)
    }
    return part
  })
  return parts.join(" ")
}

function kubectlInspectSuggestion(env: NodeJS.ProcessEnv): string {
  const kubeContext = resolveKubeContext(env)
  const namespace = (env.ORCHWIZ_NAMESPACE?.trim() || "orchwiz-starship").trim() || "orchwiz-starship"
  const contextArg = kubeContext ? `--context ${kubeContext} ` : ""
  return `kubectl ${contextArg}-n ${namespace} get pods && kubectl ${contextArg}-n ${namespace} describe pods`
}

function asLaunchLogSource(value: string, fallback: ShipLaunchLogSource): ShipLaunchLogSource {
  if (
    value === "ship-yard"
    || value === "local-bootstrap"
    || value === "cloud-bootstrap"
    || value === "deployment-adapter"
    || value === "apps-bootstrap"
  ) {
    return value
  }
  return fallback
}

export function createStreamingRunCommand(args: {
  source: ShipLaunchLogSource
  emitLaunchLog: EmitLaunchLog
}) {
  return async function runCommand(
    command: string,
    commandArgs: string[],
    options: StreamingRunCommandOptions = {},
  ): Promise<StreamingRunCommandResult> {
    const startedAt = Date.now()
    args.emitLaunchLog({
      level: "info",
      source: args.source,
      lines: [`$ ${commandLineString(command, commandArgs)}`],
    })

    const env = options.env || process.env
    const cwd = options.cwd
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    const sampleLongRunningCommand = (timeoutMs ?? 0) >= RESOURCE_SAMPLING_MIN_TIMEOUT_MS
    const enableResourceSampling = isVerboseOrResourceUsageEnabled(env) && sampleLongRunningCommand
    const enablePodOverviewSampling = args.source === "local-bootstrap" && sampleLongRunningCommand
    const terraformApplyTaskPattern = /TASK \[Terraform apply\]/u
    const ansibleTaskPattern = /^TASK \[/u
    let terraformApplyTaskActive = false
    let lastPendingFingerprint = ""
    let pendingStreak = 0
    const emittedPodStallDiagnostics = new Set<string>()

    const updateAnsibleTaskState = (lines: string[]) => {
      if (!lines.length) {
        return
      }
      for (const line of lines) {
        if (terraformApplyTaskPattern.test(line)) {
          terraformApplyTaskActive = true
          continue
        }
        if (terraformApplyTaskActive && ansibleTaskPattern.test(line)) {
          terraformApplyTaskActive = false
          continue
        }
        if (line.startsWith("PLAY RECAP")) {
          terraformApplyTaskActive = false
        }
      }
    }

    const maybeEmitPodStallDiagnostic = (podOverview: PodOverviewPayload) => {
      const pending = podOverview.phases.pending
      const waiting = podOverview.namespaces.reduce((sum, namespace) => sum + namespace.waiting, 0)
      const crashing = podOverview.namespaces.reduce((sum, namespace) => sum + namespace.crashing, 0)
      const blockedNamespaces = podOverview.namespaces
        .filter((namespace) => namespace.pending > 0 || namespace.waiting > 0 || namespace.crashing > 0)
        .slice(0, POD_STALL_MAX_NAMESPACES)
      const blockedNamespaceSummary = blockedNamespaces
        .map((namespace) => `${namespace.name}(P${namespace.pending}/W${namespace.waiting}/C${namespace.crashing})`)
        .join(", ")
      const reasonSummary = podOverview.topWaitingReasons
        .slice(0, POD_STALL_MAX_REASONS)
        .map((reason) => `${reason.reason}(${reason.count})`)
        .join(", ")
      const fingerprint = `${pending}|${waiting}|${crashing}|${blockedNamespaceSummary}|${reasonSummary}`

      if (pending <= 0 && waiting <= 0 && crashing <= 0) {
        lastPendingFingerprint = ""
        pendingStreak = 0
        return
      }

      if (fingerprint === lastPendingFingerprint) {
        pendingStreak += 1
      } else {
        lastPendingFingerprint = fingerprint
        pendingStreak = 1
      }

      if (pendingStreak < POD_STALL_STREAK_THRESHOLD) {
        return
      }

      const phaseLabel = terraformApplyTaskActive ? "Terraform apply" : "Provisioning"
      const diagnosticKey = `${phaseLabel}|${fingerprint}`
      if (emittedPodStallDiagnostics.has(diagnosticKey)) {
        return
      }
      emittedPodStallDiagnostics.add(diagnosticKey)

      args.emitLaunchLog({
        level: "warn",
        source: args.source,
        lines: [
          `[diagnostic] ${phaseLabel} is still waiting on pods: pending=${pending}, waiting=${waiting}, crashing=${crashing}${blockedNamespaceSummary ? `; namespaces=${blockedNamespaceSummary}` : ""}${reasonSummary ? `; reasons=${reasonSummary}` : ""}`,
        ],
      })
      args.emitLaunchLog({
        level: "warn",
        source: args.source,
        lines: [`[diagnostic] Inspect with: ${kubectlInspectSuggestion(env)}`],
      })
    }

    let resourceIntervalId: ReturnType<typeof setInterval> | null = null
    let snapshotSamplingInFlight = false
    const emitPeriodicDebugSnapshots = async () => {
      if (snapshotSamplingInFlight) {
        return
      }
      snapshotSamplingInFlight = true
      try {
        if (enableResourceSampling) {
          try {
            const snapshot = await getLocalBootstrapResourceSnapshot({
              elapsedMs: Date.now() - startedAt,
            })
            const line = formatResourceSnapshotLine(snapshot)
            args.emitLaunchLog({
              level: "debug",
              source: args.source,
              lines: [line],
            })
          } catch {
            // ignore snapshot errors
          }
        }

        if (enablePodOverviewSampling) {
          try {
            const podOverview = await capturePodOverview({ cwd, env })
            if (podOverview) {
              args.emitLaunchLog({
                level: "debug",
                source: args.source,
                lines: [formatPodOverviewLine(podOverview)],
              })
              maybeEmitPodStallDiagnostic(podOverview)
            }
          } catch {
            // ignore pod overview errors
          }
        }
      } finally {
        snapshotSamplingInFlight = false
      }
    }

    if (enableResourceSampling || enablePodOverviewSampling) {
      resourceIntervalId = setInterval(() => {
        void emitPeriodicDebugSnapshots()
      }, RESOURCE_SAMPLING_INTERVAL_MS)
    }

    let stdout = ""
    let stderr = ""
    let stdoutRemainder = ""
    let stderrRemainder = ""
    const emittedHighSignal = new Set<string>()

    const emitHighSignalFailures = (lines: string[], stream: ShipLaunchLogStream) => {
      const highlights = highSignalFailureLines(lines)
      for (const line of highlights) {
        const key = normalizeLineForDedup(line)
        if (emittedHighSignal.has(key)) {
          continue
        }
        emittedHighSignal.add(key)
        args.emitLaunchLog({
          level: "error",
          source: args.source,
          stream,
          lines: [`[diagnostic] ${line}`],
        })
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let timedOut = false

    const child = spawn(command, commandArgs, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    if (enableResourceSampling || enablePodOverviewSampling) {
      void emitPeriodicDebugSnapshots()
    }

    const flushRemainders = () => {
      if (stdoutRemainder.trim().length > 0) {
        const lines = normalizeLines([stdoutRemainder])
        if (lines.length > 0) {
          updateAnsibleTaskState(lines)
          args.emitLaunchLog({
            level: "debug",
            source: args.source,
            stream: "stdout",
            lines,
          })
          emitHighSignalFailures(lines, "stdout")
        }
      }
      if (stderrRemainder.trim().length > 0) {
        const lines = normalizeLines([stderrRemainder])
        if (lines.length > 0) {
          updateAnsibleTaskState(lines)
          args.emitLaunchLog({
            level: stderrLevel(lines),
            source: args.source,
            stream: "stderr",
            lines,
          })
          emitHighSignalFailures(lines, "stderr")
        }
      }
    }

    const onStdout = (data: Buffer) => {
      const text = stripAnsi(data.toString("utf8"))
      stdout = appendCapped(stdout, text, MAX_ACCUMULATED_CHARS)
      const combined = stdoutRemainder + text
      const parts = combined.split(/\n/u)
      stdoutRemainder = parts.pop() || ""
      const lines = normalizeLines(parts)
      if (lines.length > 0) {
        updateAnsibleTaskState(lines)
        args.emitLaunchLog({
          level: "debug",
          source: args.source,
          stream: "stdout",
          lines,
        })
        emitHighSignalFailures(lines, "stdout")
      }
    }

    const onStderr = (data: Buffer) => {
      const text = stripAnsi(data.toString("utf8"))
      stderr = appendCapped(stderr, text, MAX_ACCUMULATED_CHARS)
      const combined = stderrRemainder + text
      const parts = combined.split(/\n/u)
      stderrRemainder = parts.pop() || ""
      const lines = normalizeLines(parts)
      if (lines.length > 0) {
        updateAnsibleTaskState(lines)
        args.emitLaunchLog({
          level: stderrLevel(lines),
          source: args.source,
          stream: "stderr",
          lines,
        })
        emitHighSignalFailures(lines, "stderr")
      }
    }

    child.stdout?.on("data", onStdout)
    child.stderr?.on("data", onStderr)

    const result = await new Promise<{
      exitCode: number | null
      signal: NodeJS.Signals | null
      spawnError?: Error
    }>((resolve) => {
      child.on("error", (error) => {
        resolve({ exitCode: null, signal: null, spawnError: error })
      })
      child.on("close", (exitCode, signal) => {
        resolve({
          exitCode: typeof exitCode === "number" ? exitCode : null,
          signal: (signal as NodeJS.Signals | null) || null,
        })
      })

      timeoutId = setTimeout(() => {
        timedOut = true
        try {
          child.kill("SIGTERM")
        } catch {
          // ignore
        }
        setTimeout(() => {
          try {
            child.kill("SIGKILL")
          } catch {
            // ignore
          }
        }, 1500)
      }, timeoutMs)
    })

    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (resourceIntervalId) {
      clearInterval(resourceIntervalId)
      resourceIntervalId = null
    }

    flushRemainders()

    const durationMs = Math.max(0, Date.now() - startedAt)
    const exitCodeLabel = result.exitCode === null ? "null" : String(result.exitCode)
    args.emitLaunchLog({
      level: timedOut || result.exitCode ? "error" : "info",
      source: args.source,
      lines: [`exitCode=${exitCodeLabel} signal=${result.signal || "null"} durationMs=${durationMs}`],
    })

    if (timedOut) {
      args.emitLaunchLog({
        level: "error",
        source: args.source,
        lines: [`Timed out after ${timeoutMs}ms`],
      })
      return {
        ok: false,
        stdout,
        stderr,
        error: `Timed out after ${timeoutMs}ms`,
        exitCode: null,
      }
    }

    if (result.spawnError) {
      args.emitLaunchLog({
        level: "error",
        source: args.source,
        lines: [result.spawnError.message],
      })
      return {
        ok: false,
        stdout,
        stderr,
        error: result.spawnError.message,
        exitCode: null,
      }
    }

    const ok = result.exitCode === 0
    if (!ok) {
      const failureTailLines = normalizeLines(
        `${appendCapped("", stdout, 4_096)}\n${appendCapped("", stderr, 4_096)}`.split("\n"),
      )
      emitHighSignalFailures(failureTailLines, "stderr")
    }
    return {
      ok,
      stdout,
      stderr,
      ...(ok ? {} : { error: `Command exited with code ${result.exitCode ?? "null"}` }),
      exitCode: result.exitCode,
    }
  }
}

function commandExists(command: string, pathValue = process.env.PATH || ""): boolean {
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

export function createLocalBootstrapLoggingRuntime(args: {
  emitLaunchLog: EmitLaunchLog
  onProgress?: (percent: number, stage: string, message: string) => void
}): LocalBootstrapRuntime {
  const runCommand = createStreamingRunCommand({
    source: "local-bootstrap",
    emitLaunchLog: args.emitLaunchLog,
  })

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
    commandExists: (command) => commandExists(command),
    runCommand: (command, commandArgs, options = {}) => runCommand(command, commandArgs, options),
    onProgress: args.onProgress,
    emitLaunchLog: (entry) => args.emitLaunchLog({
      level: entry.level,
      source: asLaunchLogSource(entry.source, "local-bootstrap"),
      lines: entry.lines,
    }),
  }
}

export function createCloudBootstrapLoggingRuntime(args: {
  emitLaunchLog: EmitLaunchLog
}): ShipyardCloudBootstrapRuntime {
  const runCommand = createStreamingRunCommand({
    source: "cloud-bootstrap",
    emitLaunchLog: args.emitLaunchLog,
  })

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
    runCommand: (command, commandArgs, options = {}) => runCommand(command, commandArgs, options),
  }
}
