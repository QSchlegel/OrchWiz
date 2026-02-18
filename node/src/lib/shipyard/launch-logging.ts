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

    const enableResourceSampling =
      isVerboseOrResourceUsageEnabled(env)
      && (timeoutMs ?? 0) >= RESOURCE_SAMPLING_MIN_TIMEOUT_MS

    let resourceIntervalId: ReturnType<typeof setInterval> | null = null
    if (enableResourceSampling) {
      resourceIntervalId = setInterval(async () => {
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

    const flushRemainders = () => {
      if (stdoutRemainder.trim().length > 0) {
        const lines = normalizeLines([stdoutRemainder])
        if (lines.length > 0) {
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
          args.emitLaunchLog({
            level: "warn",
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
        args.emitLaunchLog({
          level: "warn",
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
    emitLaunchLog: args.emitLaunchLog,
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
