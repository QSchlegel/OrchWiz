import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { resolveRepositoryRoot } from "@/lib/security/paths"
import type {
  ShipLaunchLogLevel,
  ShipLaunchLogSource,
  ShipLaunchLogStream,
} from "@/lib/shipyard/launch-logging"

const REPORT_ROOT_SEGMENTS = ["OWZ-Vault", "00-Inbox", "Ship-Yard-Launch-Reports"] as const
const DEFAULT_READ_LIMIT = 800
const MAX_READ_LIMIT = 10_000

export type ShipLaunchReportStatus = "running" | "succeeded" | "failed"

export interface ShipLaunchPersistedLogLine {
  lineNumber: number
  timestamp: string
  level: ShipLaunchLogLevel
  source: ShipLaunchLogSource
  stream?: ShipLaunchLogStream
  text: string
}

export interface ShipLaunchReportArtifact {
  requestId: string
  ownerUserId: string
  deploymentId: string | null
  status: ShipLaunchReportStatus
  startedAt: string
  completedAt: string | null
  lineCount: number
  levelCounts: Record<ShipLaunchLogLevel, number>
  error: {
    code: string | null
    message: string | null
  } | null
  paths: {
    logPath: string
    jsonlPath: string
    reportPathMd: string
    reportPathJson: string
  }
}

export interface ShipLaunchReportPaths {
  root: string
  logPath: string
  jsonlPath: string
  reportPathMd: string
  reportPathJson: string
}

function resolveLaunchReportRoot(): string {
  const configured = process.env.SHIPYARD_LAUNCH_REPORT_ROOT?.trim()
  if (configured) {
    return resolve(configured)
  }
  return resolve(resolveRepositoryRoot(), ...REPORT_ROOT_SEGMENTS)
}

function sanitizeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
  return normalized.length > 0 ? normalized : "unknown"
}

function normalizeLines(lines: string[]): string[] {
  return lines
    .map((line) => (typeof line === "string" ? line.trimEnd() : ""))
    .filter((line) => line.trim().length > 0)
}

function asNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  if (value < 0) return 0
  return Math.floor(value)
}

function clampReadLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_READ_LIMIT
  }
  return Math.max(1, Math.min(MAX_READ_LIMIT, Math.floor(value)))
}

function buildRecordTimestamp(rawTimestamp: string | undefined): string {
  if (typeof rawTimestamp !== "string") {
    return new Date().toISOString()
  }
  const parsed = new Date(rawTimestamp)
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString()
  }
  return parsed.toISOString()
}

function formatPlainLogLine(line: ShipLaunchPersistedLogLine): string {
  const streamLabel = line.stream ? `/${line.stream}` : ""
  return `${line.timestamp} [${line.level}] [${line.source}${streamLabel}] ${line.text}\n`
}

function buildMarkdownReport(report: ShipLaunchReportArtifact): string {
  const lines: string[] = []
  lines.push(`# Ship Launch Report: ${report.requestId}`)
  lines.push("")
  lines.push(`- Owner user: ${report.ownerUserId}`)
  lines.push(`- Deployment ID: ${report.deploymentId || "n/a"}`)
  lines.push(`- Status: ${report.status}`)
  lines.push(`- Started: ${report.startedAt}`)
  lines.push(`- Completed: ${report.completedAt || "n/a"}`)
  lines.push(`- Line count: ${report.lineCount}`)
  lines.push("")
  lines.push("## Log Levels")
  lines.push(`- debug: ${report.levelCounts.debug}`)
  lines.push(`- info: ${report.levelCounts.info}`)
  lines.push(`- warn: ${report.levelCounts.warn}`)
  lines.push(`- error: ${report.levelCounts.error}`)
  if (report.error) {
    lines.push("")
    lines.push("## Failure")
    lines.push(`- Code: ${report.error.code || "n/a"}`)
    lines.push(`- Message: ${report.error.message || "n/a"}`)
  }
  lines.push("")
  lines.push("## Artifacts")
  lines.push(`- Plain log: ${report.paths.logPath}`)
  lines.push(`- Structured log (jsonl): ${report.paths.jsonlPath}`)
  lines.push(`- Report JSON: ${report.paths.reportPathJson}`)
  lines.push(`- Report Markdown: ${report.paths.reportPathMd}`)
  return `${lines.join("\n")}\n`
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parsePersistedLogLine(raw: string): ShipLaunchPersistedLogLine | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  const record = asObject(parsed)
  if (!record) return null
  const timestamp = buildRecordTimestamp(typeof record.timestamp === "string" ? record.timestamp : undefined)
  const levelRaw = record.level
  const sourceRaw = record.source
  const textRaw = record.text
  const streamRaw = record.stream
  const level: ShipLaunchLogLevel =
    levelRaw === "debug" || levelRaw === "info" || levelRaw === "warn" || levelRaw === "error"
      ? levelRaw
      : "info"
  const source: ShipLaunchLogSource =
    sourceRaw === "ship-yard"
      || sourceRaw === "local-bootstrap"
      || sourceRaw === "cloud-bootstrap"
      || sourceRaw === "deployment-adapter"
      || sourceRaw === "apps-bootstrap"
      ? sourceRaw
      : "ship-yard"
  const text = typeof textRaw === "string" ? textRaw : ""
  if (text.trim().length === 0) return null
  const stream: ShipLaunchLogStream | undefined =
    streamRaw === "stdout" || streamRaw === "stderr" ? streamRaw : undefined
  return {
    lineNumber: asNonNegativeInt(record.lineNumber),
    timestamp,
    level,
    source,
    ...(stream ? { stream } : {}),
    text,
  }
}

function parseReportArtifact(raw: string): ShipLaunchReportArtifact | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const object = asObject(parsed)
  if (!object) return null
  const pathsObject = asObject(object.paths)
  const levelCountsObject = asObject(object.levelCounts)
  const errorObject = asObject(object.error)
  if (!pathsObject || !levelCountsObject) return null
  const statusRaw = object.status
  const status: ShipLaunchReportStatus =
    statusRaw === "running" || statusRaw === "succeeded" || statusRaw === "failed"
      ? statusRaw
      : "running"
  const requestId = typeof object.requestId === "string" ? object.requestId : ""
  const ownerUserId = typeof object.ownerUserId === "string" ? object.ownerUserId : ""
  if (!requestId || !ownerUserId) return null
  const deploymentIdRaw = object.deploymentId
  const deploymentId = typeof deploymentIdRaw === "string" && deploymentIdRaw.trim().length > 0
    ? deploymentIdRaw
    : null
  const completedAtRaw = object.completedAt
  const completedAt = typeof completedAtRaw === "string" && completedAtRaw.trim().length > 0
    ? completedAtRaw
    : null
  const error =
    errorObject
      ? {
          code: typeof errorObject.code === "string" ? errorObject.code : null,
          message: typeof errorObject.message === "string" ? errorObject.message : null,
        }
      : null
  return {
    requestId,
    ownerUserId,
    deploymentId,
    status,
    startedAt: buildRecordTimestamp(typeof object.startedAt === "string" ? object.startedAt : undefined),
    completedAt,
    lineCount: asNonNegativeInt(object.lineCount),
    levelCounts: {
      debug: asNonNegativeInt(levelCountsObject.debug),
      info: asNonNegativeInt(levelCountsObject.info),
      warn: asNonNegativeInt(levelCountsObject.warn),
      error: asNonNegativeInt(levelCountsObject.error),
    },
    error,
    paths: {
      logPath: typeof pathsObject.logPath === "string" ? pathsObject.logPath : "",
      jsonlPath: typeof pathsObject.jsonlPath === "string" ? pathsObject.jsonlPath : "",
      reportPathMd: typeof pathsObject.reportPathMd === "string" ? pathsObject.reportPathMd : "",
      reportPathJson: typeof pathsObject.reportPathJson === "string" ? pathsObject.reportPathJson : "",
    },
  }
}

export function resolveShipLaunchReportPaths(args: {
  ownerUserId: string
  requestId: string
}): ShipLaunchReportPaths {
  const userSegment = sanitizeSegment(args.ownerUserId)
  const requestSegment = sanitizeSegment(args.requestId)
  const root = resolve(resolveLaunchReportRoot(), userSegment)
  const base = `ship_launch_${requestSegment}`
  return {
    root,
    logPath: resolve(root, `${base}.log`),
    jsonlPath: resolve(root, `${base}.jsonl`),
    reportPathMd: resolve(root, `${base}.md`),
    reportPathJson: resolve(root, `${base}.json`),
  }
}

export interface ShipLaunchReportWriter {
  append(args: {
    timestamp?: string
    level: ShipLaunchLogLevel
    source: ShipLaunchLogSource
    stream?: ShipLaunchLogStream
    lines: string[]
  }): void
  setDeploymentId(deploymentId: string): void
  finalize(args: {
    status: "succeeded" | "failed"
    errorCode?: string | null
    errorMessage?: string | null
  }): Promise<ShipLaunchReportArtifact>
  snapshot(): ShipLaunchReportArtifact
}

function buildArtifactSnapshot(args: {
  ownerUserId: string
  requestId: string
  deploymentId: string | null
  status: ShipLaunchReportStatus
  startedAt: string
  completedAt: string | null
  lineCount: number
  levelCounts: Record<ShipLaunchLogLevel, number>
  errorCode: string | null
  errorMessage: string | null
  paths: ShipLaunchReportPaths
}): ShipLaunchReportArtifact {
  return {
    requestId: args.requestId,
    ownerUserId: args.ownerUserId,
    deploymentId: args.deploymentId,
    status: args.status,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    lineCount: args.lineCount,
    levelCounts: {
      debug: asNonNegativeInt(args.levelCounts.debug),
      info: asNonNegativeInt(args.levelCounts.info),
      warn: asNonNegativeInt(args.levelCounts.warn),
      error: asNonNegativeInt(args.levelCounts.error),
    },
    error:
      args.errorCode || args.errorMessage
        ? {
            code: args.errorCode,
            message: args.errorMessage,
          }
        : null,
    paths: {
      logPath: args.paths.logPath,
      jsonlPath: args.paths.jsonlPath,
      reportPathMd: args.paths.reportPathMd,
      reportPathJson: args.paths.reportPathJson,
    },
  }
}

export function createShipLaunchReportWriter(args: {
  ownerUserId: string
  requestId: string
  deploymentId?: string | null
  startedAt?: Date
}): ShipLaunchReportWriter {
  const paths = resolveShipLaunchReportPaths({
    ownerUserId: args.ownerUserId,
    requestId: args.requestId,
  })
  const startedAt = (args.startedAt || new Date()).toISOString()
  let deploymentId = args.deploymentId || null
  let status: ShipLaunchReportStatus = "running"
  let completedAt: string | null = null
  let errorCode: string | null = null
  let errorMessage: string | null = null
  let lineCount = 0
  const levelCounts: Record<ShipLaunchLogLevel, number> = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
  }
  let finalized: ShipLaunchReportArtifact | null = null
  let pendingError: Error | null = null

  const ensureInitialized = async () => {
    await mkdir(paths.root, { recursive: true })
    await writeFile(paths.logPath, "", "utf8")
    await writeFile(paths.jsonlPath, "", "utf8")
    const runningReport = buildArtifactSnapshot({
      ownerUserId: args.ownerUserId,
      requestId: args.requestId,
      deploymentId,
      status,
      startedAt,
      completedAt,
      lineCount,
      levelCounts,
      errorCode,
      errorMessage,
      paths,
    })
    await writeFile(paths.reportPathJson, JSON.stringify(runningReport, null, 2), "utf8")
    await writeFile(paths.reportPathMd, buildMarkdownReport(runningReport), "utf8")
  }

  let queue: Promise<void> = ensureInitialized()
  queue = queue.catch((error) => {
    pendingError = error instanceof Error ? error : new Error(String(error))
  })

  const enqueue = (task: () => Promise<void>) => {
    queue = queue
      .then(async () => {
        if (pendingError) {
          return
        }
        await task()
      })
      .catch((error) => {
        pendingError = error instanceof Error ? error : new Error(String(error))
      })
  }

  const flush = async () => {
    await queue
    if (pendingError) {
      throw pendingError
    }
  }

  const snapshot = () => buildArtifactSnapshot({
    ownerUserId: args.ownerUserId,
    requestId: args.requestId,
    deploymentId,
    status,
    startedAt,
    completedAt,
    lineCount,
    levelCounts,
    errorCode,
    errorMessage,
    paths,
  })

  const writeSnapshotFiles = async () => {
    const current = snapshot()
    await writeFile(paths.reportPathJson, JSON.stringify(current, null, 2), "utf8")
    await writeFile(paths.reportPathMd, buildMarkdownReport(current), "utf8")
  }

  return {
    append(input) {
      if (finalized) {
        return
      }
      const lines = normalizeLines(input.lines)
      if (lines.length === 0) return
      const timestamp = buildRecordTimestamp(input.timestamp)
      const source = input.source
      const level = input.level
      const stream = input.stream

      const records: ShipLaunchPersistedLogLine[] = []
      for (const text of lines) {
        lineCount += 1
        levelCounts[level] += 1
        records.push({
          lineNumber: lineCount,
          timestamp,
          level,
          source,
          ...(stream ? { stream } : {}),
          text,
        })
      }

      enqueue(async () => {
        const plain = records.map((record) => formatPlainLogLine(record)).join("")
        const jsonl = records.map((record) => JSON.stringify(record)).join("\n")
        await appendFile(paths.logPath, plain, "utf8")
        await appendFile(paths.jsonlPath, `${jsonl}\n`, "utf8")
      })
    },
    setDeploymentId(nextDeploymentId) {
      if (!nextDeploymentId || finalized) return
      deploymentId = nextDeploymentId
      enqueue(writeSnapshotFiles)
    },
    async finalize(input) {
      if (finalized) {
        return finalized
      }
      status = input.status
      completedAt = new Date().toISOString()
      errorCode = input.errorCode || null
      errorMessage = input.errorMessage || null

      enqueue(writeSnapshotFiles)
      await flush()
      finalized = snapshot()
      return finalized
    },
    snapshot,
  }
}

export async function readShipLaunchLogs(args: {
  ownerUserId: string
  requestId: string
  cursor?: number
  limit?: number
}): Promise<{
  entries: ShipLaunchPersistedLogLine[]
  nextCursor: number
  totalLines: number
  hasMore: boolean
  report: ShipLaunchReportArtifact | null
  paths: ShipLaunchReportPaths
} | null> {
  const paths = resolveShipLaunchReportPaths({
    ownerUserId: args.ownerUserId,
    requestId: args.requestId,
  })
  const hasAnyArtifact =
    existsSync(paths.jsonlPath) || existsSync(paths.logPath) || existsSync(paths.reportPathJson)
  if (!hasAnyArtifact) {
    return null
  }

  const cursor = asNonNegativeInt(args.cursor)
  const limit = clampReadLimit(args.limit)

  const rawJsonl = existsSync(paths.jsonlPath)
    ? await readFile(paths.jsonlPath, "utf8")
    : ""
  const parsedEntries = rawJsonl
    .split("\n")
    .map((line) => parsePersistedLogLine(line))
    .filter((line): line is ShipLaunchPersistedLogLine => line !== null)

  const boundedCursor = Math.min(cursor, parsedEntries.length)
  const entries = parsedEntries.slice(boundedCursor, boundedCursor + limit)
  const nextCursor = boundedCursor + entries.length
  const hasMore = nextCursor < parsedEntries.length

  const report = existsSync(paths.reportPathJson)
    ? parseReportArtifact(await readFile(paths.reportPathJson, "utf8"))
    : null

  return {
    entries,
    nextCursor,
    totalLines: parsedEntries.length,
    hasMore,
    report,
    paths,
  }
}
