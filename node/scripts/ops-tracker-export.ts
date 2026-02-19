import { readdir, readFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { saveVaultFile } from "@/lib/vault"
import { collectMarkdownFilePaths, directoryExists, readMarkdownFile } from "@/lib/vault/fs"
import { resolveVaultAbsolutePath } from "@/lib/vault/config"
import { resolveBridgeCrewScorecardDirectory, resolveSecurityAuditDirectory } from "@/lib/security/paths"
import {
  bridgeRoleToAgentId,
  buildAgentDashboardPath,
  buildAgentRollupPath,
  buildAutoEventPath,
  buildDeterministicEventId,
  buildFleetDashboardPath,
  buildFleetRollupPath,
  buildOpsTrackerRollups,
  buildOpsTrackerRunWindow,
  buildShipAgentContext,
  buildShipDashboardPath,
  buildShipRollupPath,
  dedupeOpsTrackerEvents,
  filterOpsTrackerEventsByForwardedPolicy,
  isInRunWindow,
  localDateInTimezone,
  normalizeOpsTrackerEvent,
  parseOpsTrackerEventFromMarkdown,
  renderAgentDashboardNote,
  renderAgentReadmeNote,
  renderFleetDashboardNote,
  renderFleetReadmeNote,
  renderOpsTrackerEventNote,
  renderOpsTrackerRollupNote,
  renderShipDashboardNote,
  safeTimezone,
  type OpsTrackerEventV1,
  type OpsTrackerRunWindow,
} from "@/lib/ops-tracker"

interface CliArgs {
  dryRun: boolean
  includeForwarded: boolean
  fromDate: string | null
  toDate: string | null
  timezone: string | null
  userId: string | null
  backfillDays: number
  help: boolean
}

interface ExportSummary {
  timezone: string
  window: {
    fromDate: string
    toDate: string
    backfillDays: number
  }
  includeForwarded: boolean
  dryRun: boolean
  sourceCounts: Record<string, number>
  autoEventWrites: number
  rollupWrites: {
    agent: number
    ship: number
    fleet: number
  }
  dashboardWrites: number
  readmeWrites: number
  eventCount: number
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function parseCliArgs(argv: string[]): CliArgs {
  let dryRun = false
  let includeForwarded = true
  let fromDate: string | null = null
  let toDate: string | null = null
  let timezone: string | null = null
  let userId: string | null = null
  let backfillDays = 90
  let help = false

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx]

    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--include-forwarded") {
      includeForwarded = true
      continue
    }
    if (arg === "--no-forwarded") {
      includeForwarded = false
      continue
    }
    if (arg === "--help" || arg === "-h") {
      help = true
      continue
    }

    if (arg.startsWith("--from=")) {
      fromDate = arg.slice("--from=".length).trim() || null
      continue
    }
    if (arg === "--from") {
      fromDate = (argv[idx + 1] || "").trim() || null
      idx += 1
      continue
    }

    if (arg.startsWith("--to=")) {
      toDate = arg.slice("--to=".length).trim() || null
      continue
    }
    if (arg === "--to") {
      toDate = (argv[idx + 1] || "").trim() || null
      idx += 1
      continue
    }

    if (arg.startsWith("--timezone=")) {
      timezone = arg.slice("--timezone=".length).trim() || null
      continue
    }
    if (arg === "--timezone") {
      timezone = (argv[idx + 1] || "").trim() || null
      idx += 1
      continue
    }

    if (arg.startsWith("--user-id=")) {
      userId = arg.slice("--user-id=".length).trim() || null
      continue
    }
    if (arg === "--user-id") {
      userId = (argv[idx + 1] || "").trim() || null
      idx += 1
      continue
    }

    if (arg.startsWith("--backfill-days=")) {
      const parsed = Number.parseInt(arg.slice("--backfill-days=".length), 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        backfillDays = parsed
      }
      continue
    }
    if (arg === "--backfill-days") {
      const parsed = Number.parseInt(argv[idx + 1] || "", 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        backfillDays = parsed
      }
      idx += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    dryRun,
    includeForwarded,
    fromDate,
    toDate,
    timezone,
    userId,
    backfillDays,
    help,
  }
}

function printHelp(): void {
  console.log("Usage: npm run ops-tracker:export -- [options]")
  console.log("")
  console.log("Options:")
  console.log("  --dry-run                 Build export without writing notes")
  console.log("  --from YYYY-MM-DD         Inclusive UTC start date")
  console.log("  --to YYYY-MM-DD           Inclusive UTC end date")
  console.log("  --backfill-days N         Default window size (default: 90)")
  console.log("  --timezone TZ             Explicit rollup timezone")
  console.log("  --user-id ID              Scope DB queries + timezone lookup to a user")
  console.log("  --no-forwarded            Exclude forwarded events")
  console.log("  --include-forwarded       Include forwarded events (default)")
}

async function listJsonFiles(rootPath: string): Promise<string[]> {
  const out: string[] = []

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const nextPath = resolve(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(nextPath)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
        out.push(nextPath)
      }
    }
  }

  if (await directoryExists(rootPath)) {
    await walk(rootPath)
  }

  return out.sort((left, right) => left.localeCompare(right))
}

function resolveShipAndAgentFromMetadata(metadata: unknown): {
  shipDeploymentId: string | null
  agentId: string | null
} {
  const root = asRecord(metadata)
  const bridge = asRecord(root.bridge)
  const quartermaster = asRecord(root.quartermaster)
  const shipContext = asRecord(root.shipContext)

  const shipDeploymentId =
    asString(bridge.shipDeploymentId)
    || asString(quartermaster.shipDeploymentId)
    || asString(shipContext.shipDeploymentId)
    || asString(shipContext.deploymentId)
    || null

  const stationKey = asString(bridge.stationKey)
  const bridgeAgentId = stationKey ? bridgeRoleToAgentId(stationKey) : null
  if (bridgeAgentId) {
    return {
      shipDeploymentId,
      agentId: bridgeAgentId,
    }
  }

  if (shipDeploymentId && quartermaster.channel === "ship-quartermaster") {
    return {
      shipDeploymentId,
      agentId: "qtm-lgr",
    }
  }

  if (shipDeploymentId && asString(root.channel) === "ship-quartermaster") {
    return {
      shipDeploymentId,
      agentId: "qtm-lgr",
    }
  }

  return {
    shipDeploymentId,
    agentId: shipDeploymentId ? "qtm-lgr" : null,
  }
}

function securityAuditSummary(payload: Record<string, unknown>): string {
  const riskScore = asRecord(payload.riskScore)
  const score = asNumber(riskScore.score)
  const level = asString(riskScore.level) || "unknown"
  const reportId = asString(payload.reportId) || "n/a"
  return `Security audit ${reportId} risk=${score ?? "n/a"} (${level})`
}

function normalizeEventDateForTimezone(occurredAt: Date, timezone: string): string {
  return localDateInTimezone(occurredAt, timezone)
}

function sourceCountSummary(events: OpsTrackerEventV1[]): Record<string, number> {
  const counts: Record<string, number> = {
    manual: 0,
    security_audit: 0,
    bridge_scorecard: 0,
    verification: 0,
    deployment: 0,
  }

  for (const event of events) {
    counts[event.source] = (counts[event.source] || 0) + 1
  }

  return counts
}

async function resolveTimezoneForRun(args: {
  requestedTimezone: string | null
  userId: string | null
}): Promise<string> {
  if (args.requestedTimezone) {
    return safeTimezone(args.requestedTimezone)
  }

  if (args.userId) {
    const pref = await prisma.agentSyncPreference.findUnique({
      where: {
        userId: args.userId,
      },
      select: {
        timezone: true,
      },
    })

    if (pref?.timezone) {
      return safeTimezone(pref.timezone)
    }
  }

  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return safeTimezone(systemTimezone || "UTC")
}

async function collectManualEvents(args: {
  window: OpsTrackerRunWindow
  timezone: string
}): Promise<OpsTrackerEventV1[]> {
  const root = resolveVaultAbsolutePath("agent-public")
  if (!(await directoryExists(root))) {
    return []
  }

  const markdownPaths = await collectMarkdownFilePaths(root)
  const manualPaths = markdownPaths.filter((path) => path.startsWith("ops-tracker/events/manual/"))

  const events: OpsTrackerEventV1[] = []

  for (const path of manualPaths) {
    const file = await readMarkdownFile(root, path).catch(() => null)
    if (!file) continue

    const parsed = parseOpsTrackerEventFromMarkdown(file.content, args.timezone)
    if (!parsed) continue

    const occurredAt = new Date(parsed.occurredAt)
    if (!isInRunWindow(occurredAt, args.window)) continue

    events.push(
      normalizeOpsTrackerEvent({
        ...parsed,
        source: "manual",
        eventDate: normalizeEventDateForTimezone(occurredAt, args.timezone),
      }),
    )
  }

  return events
}

async function collectSecurityArtifactEvents(args: {
  window: OpsTrackerRunWindow
  timezone: string
  userId: string | null
}): Promise<OpsTrackerEventV1[]> {
  const events: OpsTrackerEventV1[] = []
  const auditDir = resolveSecurityAuditDirectory()
  const scorecardDir = resolveBridgeCrewScorecardDirectory()

  const auditFiles = await listJsonFiles(auditDir)
  const scorecardFiles = await listJsonFiles(scorecardDir)

  for (const fullPath of auditFiles) {
    if (fullPath.startsWith(scorecardDir)) {
      continue
    }

    const raw = await readFile(fullPath, "utf8").catch(() => null)
    if (!raw) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    const payload = asRecord(parsed)
    const reportId = asString(payload.reportId)
    const createdAt = asString(payload.createdAt)
    const userId = asString(payload.userId)

    if (!reportId || !createdAt) {
      continue
    }
    if (args.userId && userId && userId !== args.userId) {
      continue
    }

    const occurredAt = new Date(createdAt)
    if (Number.isNaN(occurredAt.getTime()) || !isInRunWindow(occurredAt, args.window)) {
      continue
    }

    const shipDeploymentId = asString(payload.shipDeploymentId)
    const riskLevel = asString(asRecord(payload.riskScore).level) || "unknown"

    events.push(
      normalizeOpsTrackerEvent({
        eventId: buildDeterministicEventId(["security_audit", reportId, occurredAt.toISOString()]),
        occurredAt,
        source: "security_audit",
        eventDate: normalizeEventDateForTimezone(occurredAt, args.timezone),
        shipDeploymentId,
        title: `Security Audit ${reportId}`,
        summary: securityAuditSummary(payload),
        points: 1,
        isForwarded: false,
        visibility: "public",
        tags: [
          "ops-tracker/source/security_audit",
          `ops-tracker/risk/${riskLevel}`,
          shipDeploymentId ? `ops-tracker/ship/${shipDeploymentId}` : "ops-tracker/scope/fleet",
        ],
      }),
    )
  }

  for (const fullPath of scorecardFiles) {
    const raw = await readFile(fullPath, "utf8").catch(() => null)
    if (!raw) continue

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    const payload = asRecord(parsed)
    const generatedAt = asString(payload.generatedAt)
    const userId = asString(payload.userId)

    if (!generatedAt) {
      continue
    }
    if (args.userId && userId && userId !== args.userId) {
      continue
    }

    const occurredAt = new Date(generatedAt)
    if (Number.isNaN(occurredAt.getTime()) || !isInRunWindow(occurredAt, args.window)) {
      continue
    }

    const shipDeploymentId = asString(payload.shipDeploymentId)
    const perStationScores = asRecord(payload.perStationScores)
    const overallScore = asNumber(payload.overallScore)

    for (const stationKey of Object.keys(perStationScores)) {
      const stationScore = asNumber(perStationScores[stationKey])
      const agentId = bridgeRoleToAgentId(stationKey)
      if (!agentId) continue

      events.push(
        normalizeOpsTrackerEvent({
          eventId: buildDeterministicEventId([
            "bridge_scorecard",
            relative(scorecardDir, fullPath),
            stationKey,
            occurredAt.toISOString(),
          ]),
          occurredAt,
          source: "bridge_scorecard",
          eventDate: normalizeEventDateForTimezone(occurredAt, args.timezone),
          shipDeploymentId,
          agentId,
          agentRole: stationKey,
          title: `Bridge Scorecard ${stationKey.toUpperCase()}`,
          summary: `Bridge scorecard station=${stationKey} stationScore=${stationScore ?? "n/a"} overall=${overallScore ?? "n/a"}`,
          points: 1,
          isForwarded: false,
          visibility: "public",
          tags: [
            "ops-tracker/source/bridge_scorecard",
            `ops-tracker/station/${stationKey}`,
            shipDeploymentId ? `ops-tracker/ship/${shipDeploymentId}` : "ops-tracker/scope/fleet",
          ],
        }),
      )
    }
  }

  return events
}

async function collectDeploymentEvents(args: {
  window: OpsTrackerRunWindow
  timezone: string
  userId: string | null
  includeForwarded: boolean
}): Promise<OpsTrackerEventV1[]> {
  const where: Prisma.AgentDeploymentWhereInput = {
    createdAt: {
      gte: args.window.from,
      lte: args.window.to,
    },
  }

  if (args.userId) {
    where.userId = args.userId
  }

  const deployments = await prisma.agentDeployment.findMany({
    where,
    select: {
      id: true,
      name: true,
      deploymentType: true,
      status: true,
      createdAt: true,
      metadata: true,
    },
  })

  const events: OpsTrackerEventV1[] = deployments.map((deployment) => {
    const metadata = asRecord(deployment.metadata)
    const shipDeploymentId = deployment.deploymentType === "ship"
      ? deployment.id
      : asString(metadata.shipDeploymentId)

    return normalizeOpsTrackerEvent({
      eventId: buildDeterministicEventId([
        "deployment",
        deployment.id,
        deployment.createdAt.toISOString(),
        deployment.status,
      ]),
      occurredAt: deployment.createdAt,
      source: "deployment",
      eventDate: normalizeEventDateForTimezone(deployment.createdAt, args.timezone),
      shipDeploymentId,
      agentId: shipDeploymentId ? "qtm-lgr" : null,
      agentRole: shipDeploymentId ? "quartermaster" : null,
      title: `Deployment ${deployment.name}`,
      summary: `Deployment status=${deployment.status} type=${deployment.deploymentType}`,
      points: 1,
      isForwarded: false,
      visibility: "public",
      tags: [
        "ops-tracker/source/deployment",
        `ops-tracker/deployment-status/${deployment.status}`,
        shipDeploymentId ? `ops-tracker/ship/${shipDeploymentId}` : "ops-tracker/scope/fleet",
      ],
    })
  })

  if (!args.includeForwarded) {
    return events
  }

  const forwardedEvents = await prisma.forwardingEvent.findMany({
    where: {
      eventType: "deployment",
      occurredAt: {
        gte: args.window.from,
        lte: args.window.to,
      },
      ...(args.userId
        ? {
            sourceNode: {
              ownerUserId: args.userId,
            },
          }
        : {}),
    },
    include: {
      sourceNode: true,
    },
    orderBy: {
      occurredAt: "desc",
    },
  })

  const forwarded: OpsTrackerEventV1[] = []
  for (const row of forwardedEvents) {
    const payload = asRecord(row.payload)
    const occurredAt = new Date(asString(payload.createdAt) || row.occurredAt.toISOString())
    if (Number.isNaN(occurredAt.getTime()) || !isInRunWindow(occurredAt, args.window)) {
      continue
    }

    const deploymentType = asString(payload.deploymentType)
    const shipDeploymentId = deploymentType === "ship"
      ? asString(payload.id) || asString(payload.shipDeploymentId)
      : asString(payload.shipDeploymentId)

    forwarded.push(
      normalizeOpsTrackerEvent({
        eventId: buildDeterministicEventId([
          "deployment",
          asString(payload.id) || row.id,
          occurredAt.toISOString(),
        ]),
        occurredAt,
        source: "deployment",
        eventDate: normalizeEventDateForTimezone(occurredAt, args.timezone),
        shipDeploymentId,
        agentId: shipDeploymentId ? "qtm-lgr" : null,
        agentRole: shipDeploymentId ? "quartermaster" : null,
        title: `Forwarded Deployment ${asString(payload.name) || asString(payload.id) || row.id}`,
        summary: `Forwarded deployment status=${asString(payload.status) || "unknown"} node=${row.sourceNode.nodeId}`,
        points: 1,
        isForwarded: true,
        visibility: "public",
        tags: [
          "ops-tracker/source/deployment",
          "ops-tracker/forwarded",
          shipDeploymentId ? `ops-tracker/ship/${shipDeploymentId}` : "ops-tracker/scope/fleet",
        ],
      }),
    )
  }

  return [...events, ...forwarded]
}

async function collectVerificationEvents(args: {
  window: OpsTrackerRunWindow
  timezone: string
  userId: string | null
  includeForwarded: boolean
}): Promise<OpsTrackerEventV1[]> {
  const where: Prisma.VerificationRunWhereInput = {
    startedAt: {
      gte: args.window.from,
      lte: args.window.to,
    },
    ...(args.userId
      ? {
          session: {
            userId: args.userId,
          },
        }
      : {}),
  }

  const runs = await prisma.verificationRun.findMany({
    where,
    include: {
      session: {
        select: {
          id: true,
          title: true,
          metadata: true,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
  })

  const events: OpsTrackerEventV1[] = runs.map((run) => {
    const scope = resolveShipAndAgentFromMetadata(run.session.metadata)

    return normalizeOpsTrackerEvent({
      eventId: buildDeterministicEventId(["verification", run.id]),
      occurredAt: run.startedAt,
      source: "verification",
      eventDate: normalizeEventDateForTimezone(run.startedAt, args.timezone),
      shipDeploymentId: scope.shipDeploymentId,
      agentId: scope.agentId,
      title: `Verification ${run.type}`,
      summary: `Verification status=${run.status || "unknown"} iterations=${run.iterations || 0} session=${run.session.id}`,
      points: 1,
      isForwarded: false,
      visibility: "public",
      tags: [
        "ops-tracker/source/verification",
        `ops-tracker/verification/${run.type}`,
        scope.shipDeploymentId ? `ops-tracker/ship/${scope.shipDeploymentId}` : "ops-tracker/scope/fleet",
      ],
    })
  })

  if (!args.includeForwarded) {
    return events
  }

  const forwardedRows = await prisma.forwardingEvent.findMany({
    where: {
      eventType: "verification",
      occurredAt: {
        gte: args.window.from,
        lte: args.window.to,
      },
      ...(args.userId
        ? {
            sourceNode: {
              ownerUserId: args.userId,
            },
          }
        : {}),
    },
    include: {
      sourceNode: true,
    },
    orderBy: {
      occurredAt: "desc",
    },
  })

  const forwarded: OpsTrackerEventV1[] = []

  for (const row of forwardedRows) {
    const payload = asRecord(row.payload)
    const occurredAt = new Date(asString(payload.startedAt) || row.occurredAt.toISOString())
    if (Number.isNaN(occurredAt.getTime()) || !isInRunWindow(occurredAt, args.window)) {
      continue
    }

    const metaScope = resolveShipAndAgentFromMetadata(payload.metadata)
    const shipDeploymentId = asString(payload.shipDeploymentId) || metaScope.shipDeploymentId

    const stationAgent = bridgeRoleToAgentId(asString(payload.stationKey) || "")
    const agentId = stationAgent || metaScope.agentId || (shipDeploymentId ? "qtm-lgr" : null)

    forwarded.push(
      normalizeOpsTrackerEvent({
        eventId: buildDeterministicEventId([
          "verification",
          asString(payload.id) || asString(payload.sessionId) || row.id,
          occurredAt.toISOString(),
        ]),
        occurredAt,
        source: "verification",
        eventDate: normalizeEventDateForTimezone(occurredAt, args.timezone),
        shipDeploymentId,
        agentId,
        title: `Forwarded Verification ${asString(payload.type) || "run"}`,
        summary: `Forwarded verification status=${asString(payload.status) || "unknown"} node=${row.sourceNode.nodeId}`,
        points: 1,
        isForwarded: true,
        visibility: "public",
        tags: [
          "ops-tracker/source/verification",
          "ops-tracker/forwarded",
          shipDeploymentId ? `ops-tracker/ship/${shipDeploymentId}` : "ops-tracker/scope/fleet",
        ],
      }),
    )
  }

  return [...events, ...forwarded]
}

async function writeMarkdown(args: {
  vaultId: "ship" | "agent-public"
  path: string
  content: string
  dryRun: boolean
}): Promise<boolean> {
  if (args.dryRun) {
    return false
  }

  await saveVaultFile(args.vaultId, args.path, args.content)
  return true
}

async function writeScaffoldNotes(dryRun: boolean): Promise<{
  dashboardWrites: number
  readmeWrites: number
}> {
  let dashboardWrites = 0
  let readmeWrites = 0

  const wroteFleetDashboard = await writeMarkdown({
    vaultId: "ship",
    path: buildFleetDashboardPath(),
    content: renderFleetDashboardNote(),
    dryRun,
  })
  if (wroteFleetDashboard) dashboardWrites += 1

  const wroteFleetReadme = await writeMarkdown({
    vaultId: "ship",
    path: "kb/fleet/ops-tracker/README.md",
    content: renderFleetReadmeNote(),
    dryRun,
  })
  if (wroteFleetReadme) readmeWrites += 1

  const wroteAgentReadme = await writeMarkdown({
    vaultId: "agent-public",
    path: "ops-tracker/README.md",
    content: renderAgentReadmeNote(),
    dryRun,
  })
  if (wroteAgentReadme) readmeWrites += 1

  return {
    dashboardWrites,
    readmeWrites,
  }
}

async function runExport(args: CliArgs): Promise<ExportSummary> {
  const timezone = await resolveTimezoneForRun({
    requestedTimezone: args.timezone,
    userId: args.userId,
  })

  const window = buildOpsTrackerRunWindow({
    fromDate: args.fromDate,
    toDate: args.toDate,
    defaultBackfillDays: args.backfillDays,
  })

  const [manualEvents, securityEvents, deploymentEvents, verificationEvents] = await Promise.all([
    collectManualEvents({ window, timezone }),
    collectSecurityArtifactEvents({ window, timezone, userId: args.userId }),
    collectDeploymentEvents({
      window,
      timezone,
      userId: args.userId,
      includeForwarded: args.includeForwarded,
    }),
    collectVerificationEvents({
      window,
      timezone,
      userId: args.userId,
      includeForwarded: args.includeForwarded,
    }),
  ])

  const allEvents = [
    ...manualEvents,
    ...securityEvents,
    ...deploymentEvents,
    ...verificationEvents,
  ]

  const dedupedEvents = dedupeOpsTrackerEvents(
    filterOpsTrackerEventsByForwardedPolicy(allEvents, args.includeForwarded),
  )

  const rollups = buildOpsTrackerRollups({
    events: dedupedEvents,
    timezone,
    generatedAt: new Date(),
  })

  let autoEventWrites = 0
  for (const event of dedupedEvents) {
    if (event.source === "manual") continue
    const wrote = await writeMarkdown({
      vaultId: "ship",
      path: buildAutoEventPath(event),
      content: renderOpsTrackerEventNote(event),
      dryRun: args.dryRun,
    })
    if (wrote) autoEventWrites += 1
  }

  let agentRollupWrites = 0
  for (const rollup of rollups.agentRollups) {
    const wrote = await writeMarkdown({
      vaultId: "agent-public",
      path: buildAgentRollupPath(rollup),
      content: renderOpsTrackerRollupNote(rollup),
      dryRun: args.dryRun,
    })
    if (wrote) agentRollupWrites += 1
  }

  let shipRollupWrites = 0
  for (const rollup of rollups.shipRollups) {
    const wrote = await writeMarkdown({
      vaultId: "ship",
      path: buildShipRollupPath(rollup),
      content: renderOpsTrackerRollupNote(rollup),
      dryRun: args.dryRun,
    })
    if (wrote) shipRollupWrites += 1
  }

  let fleetRollupWrites = 0
  for (const rollup of rollups.fleetRollups) {
    const wrote = await writeMarkdown({
      vaultId: "ship",
      path: buildFleetRollupPath(rollup),
      content: renderOpsTrackerRollupNote(rollup),
      dryRun: args.dryRun,
    })
    if (wrote) fleetRollupWrites += 1
  }

  const shipWhere: Prisma.AgentDeploymentWhereInput = {
    deploymentType: "ship",
    ...(args.userId
      ? {
          userId: args.userId,
        }
      : {}),
  }

  const [ships, bridgeCrew] = await Promise.all([
    prisma.agentDeployment.findMany({
      where: shipWhere,
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.bridgeCrew.findMany({
      where: {
        deployment: shipWhere,
      },
      select: {
        deploymentId: true,
        callsign: true,
        role: true,
      },
    }),
  ])

  const bridgeCrewByShip: Record<string, string[]> = {}
  for (const member of bridgeCrew) {
    const shipId = member.deploymentId
    if (!bridgeCrewByShip[shipId]) {
      bridgeCrewByShip[shipId] = []
    }

    const callsign = asString(member.callsign)?.toLowerCase()
    const roleAgent = bridgeRoleToAgentId(member.role)
    const agentId = callsign || roleAgent
    if (agentId) {
      bridgeCrewByShip[shipId].push(agentId)
    }
  }

  const shipAgentContext = buildShipAgentContext({
    shipIds: ships.map((ship) => ship.id),
    bridgeCrewByShip,
    includeQuartermaster: true,
    eventPairs: dedupedEvents
      .filter((event) => Boolean(event.shipDeploymentId && event.agentId))
      .map((event) => ({
        shipDeploymentId: event.shipDeploymentId as string,
        agentId: event.agentId as string,
      })),
  })

  const scaffoldWrites = await writeScaffoldNotes(args.dryRun)

  let shipDashboardWrites = 0
  for (const shipCtx of shipAgentContext) {
    const wrote = await writeMarkdown({
      vaultId: "ship",
      path: buildShipDashboardPath(shipCtx.shipDeploymentId),
      content: renderShipDashboardNote(shipCtx.shipDeploymentId),
      dryRun: args.dryRun,
    })
    if (wrote) shipDashboardWrites += 1
  }

  let agentDashboardWrites = 0
  for (const shipCtx of shipAgentContext) {
    for (const agentId of shipCtx.agentIds) {
      const wrote = await writeMarkdown({
        vaultId: "agent-public",
        path: buildAgentDashboardPath(shipCtx.shipDeploymentId, agentId),
        content: renderAgentDashboardNote(shipCtx.shipDeploymentId, agentId),
        dryRun: args.dryRun,
      })
      if (wrote) agentDashboardWrites += 1
    }
  }

  return {
    timezone,
    window: {
      fromDate: window.fromDate,
      toDate: window.toDate,
      backfillDays: window.backfillDays,
    },
    includeForwarded: args.includeForwarded,
    dryRun: args.dryRun,
    sourceCounts: sourceCountSummary(dedupedEvents),
    autoEventWrites,
    rollupWrites: {
      agent: agentRollupWrites,
      ship: shipRollupWrites,
      fleet: fleetRollupWrites,
    },
    dashboardWrites: scaffoldWrites.dashboardWrites + shipDashboardWrites + agentDashboardWrites,
    readmeWrites: scaffoldWrites.readmeWrites,
    eventCount: dedupedEvents.length,
  }
}

function ensureScriptCwd(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  process.chdir(resolve(scriptDir, ".."))
}

async function main(): Promise<void> {
  ensureScriptCwd()

  const args = parseCliArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const summary = await runExport(args)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error("[ops-tracker-export] fatal:", error)
  process.exit(1)
})
