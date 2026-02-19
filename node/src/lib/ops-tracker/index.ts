import { createHash } from "node:crypto"
import { BRIDGE_CREW_ROLE_ORDER, bridgeCrewTemplateForRole, type BridgeCrewRole } from "@/lib/shipyard/bridge-crew"

export const OPS_TRACKER_VERSION = 1

export type OpsTrackerSource =
  | "manual"
  | "security_audit"
  | "bridge_scorecard"
  | "verification"
  | "deployment"

export type OpsTrackerVisibility = "public" | "private"
export type OpsTrackerScope = "agent" | "ship" | "fleet"

export interface OpsTrackerEventV1 {
  type: "ops-tracker-event"
  trackerVersion: number
  eventId: string
  eventDate: string
  occurredAt: string
  shipDeploymentId: string | null
  agentId: string | null
  agentRole: string | null
  source: OpsTrackerSource
  points: number
  isForwarded: boolean
  visibility: OpsTrackerVisibility
  tags: string[]
  title: string
  summary: string
}

export interface OpsTrackerRollupV1 {
  type: "ops-tracker-rollup"
  trackerVersion: number
  scope: OpsTrackerScope
  rollupDate: string
  timezone: string
  shipDeploymentId: string | null
  agentId: string | null
  totalPoints: number
  sourceCounts: Partial<Record<OpsTrackerSource, number>>
  eventCount: number
  generatedAt: string
  tags: string[]
}

export interface OpsTrackerRunWindow {
  from: Date
  to: Date
  fromDate: string
  toDate: string
  backfillDays: number
}

export interface OpsTrackerShipAgentContext {
  shipDeploymentId: string
  agentIds: string[]
}

interface LocalDateParts {
  year: string
  month: string
  day: string
}

const SOURCE_VALUES: OpsTrackerSource[] = [
  "manual",
  "security_audit",
  "bridge_scorecard",
  "verification",
  "deployment",
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function safeInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.trunc(value))
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function isBridgeRole(value: unknown): value is BridgeCrewRole {
  return typeof value === "string" && BRIDGE_CREW_ROLE_ORDER.includes(value as BridgeCrewRole)
}

function localDateParts(date: Date, timezone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((entry) => entry.type === "year")?.value || "1970"
  const month = parts.find((entry) => entry.type === "month")?.value || "01"
  const day = parts.find((entry) => entry.type === "day")?.value || "01"

  return {
    year,
    month,
    day,
  }
}

export function safeTimezone(value: string | null | undefined, fallback = "UTC"): string {
  const timezone = value?.trim() || fallback
  try {
    localDateParts(new Date(), timezone)
    return timezone
  } catch {
    return fallback
  }
}

export function localDateInTimezone(date: Date, timezone: string): string {
  const parts = localDateParts(date, safeTimezone(timezone))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function buildOpsTrackerRunWindow(args: {
  now?: Date
  fromDate?: string | null
  toDate?: string | null
  defaultBackfillDays?: number
} = {}): OpsTrackerRunWindow {
  const now = args.now || new Date()
  const defaultBackfillDays = Math.max(1, Math.trunc(args.defaultBackfillDays || 90))

  if (args.fromDate || args.toDate) {
    const fromDate = args.fromDate || args.toDate
    const toDate = args.toDate || args.fromDate

    if (!fromDate || !toDate) {
      throw new Error("fromDate and toDate must be provided together")
    }

    if (!/^\d{4}-\d{2}-\d{2}$/u.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/u.test(toDate)) {
      throw new Error("Date values must use YYYY-MM-DD format")
    }

    const from = new Date(`${fromDate}T00:00:00.000Z`)
    const to = new Date(`${toDate}T23:59:59.999Z`)

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error("Invalid date range")
    }

    if (from.getTime() > to.getTime()) {
      throw new Error("fromDate must be <= toDate")
    }

    const daySpan = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
    return {
      from,
      to,
      fromDate,
      toDate,
      backfillDays: Math.max(1, daySpan),
    }
  }

  const toDate = now.toISOString().slice(0, 10)
  const to = new Date(`${toDate}T23:59:59.999Z`)
  const from = new Date(to.getTime() - (defaultBackfillDays - 1) * 86_400_000)
  const fromDate = from.toISOString().slice(0, 10)

  return {
    from,
    to,
    fromDate,
    toDate,
    backfillDays: defaultBackfillDays,
  }
}

export function isInRunWindow(date: Date, window: OpsTrackerRunWindow): boolean {
  const ts = date.getTime()
  return ts >= window.from.getTime() && ts <= window.to.getTime()
}

export function isOpsTrackerSource(value: unknown): value is OpsTrackerSource {
  return typeof value === "string" && SOURCE_VALUES.includes(value as OpsTrackerSource)
}

export function buildDeterministicEventId(seed: unknown): string {
  const raw = typeof seed === "string" ? seed : JSON.stringify(seed)
  const digest = createHash("sha256").update(raw).digest("hex")
  return digest.slice(0, 16)
}

export function normalizeOpsTrackerEvent(input: {
  eventId: string
  occurredAt: string | Date
  source: OpsTrackerSource
  title: string
  summary: string
  eventDate?: string | null
  shipDeploymentId?: string | null
  agentId?: string | null
  agentRole?: string | null
  points?: number | null
  isForwarded?: boolean | null
  visibility?: OpsTrackerVisibility | null
  tags?: string[] | null
  timezone?: string | null
}): OpsTrackerEventV1 {
  const occurredAtDate = input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt)
  if (Number.isNaN(occurredAtDate.getTime())) {
    throw new Error(`Invalid occurredAt for event ${input.eventId}`)
  }

  const timezone = safeTimezone(input.timezone)
  const normalizedEventDate = input.eventDate && /^\d{4}-\d{2}-\d{2}$/u.test(input.eventDate)
    ? input.eventDate
    : localDateInTimezone(occurredAtDate, timezone)

  const rawTags = Array.isArray(input.tags) ? input.tags : []
  const tags = sortUnique([
    ...rawTags,
    "ops-tracker/event",
    `ops-tracker/source/${input.source}`,
  ])

  return {
    type: "ops-tracker-event",
    trackerVersion: OPS_TRACKER_VERSION,
    eventId: input.eventId,
    eventDate: normalizedEventDate,
    occurredAt: occurredAtDate.toISOString(),
    shipDeploymentId: asString(input.shipDeploymentId),
    agentId: asString(input.agentId)?.toLowerCase() || null,
    agentRole: asString(input.agentRole),
    source: input.source,
    points: safeInt(input.points ?? 1),
    isForwarded: input.isForwarded === true,
    visibility: input.visibility === "private" ? "private" : "public",
    tags,
    title: input.title.trim() || "Ops tracker event",
    summary: input.summary.trim() || "",
  }
}

export function dedupeOpsTrackerEvents(events: OpsTrackerEventV1[]): OpsTrackerEventV1[] {
  const byId = new Map<string, OpsTrackerEventV1>()

  for (const event of events) {
    const existing = byId.get(event.eventId)
    if (!existing) {
      byId.set(event.eventId, event)
      continue
    }

    if (existing.isForwarded && !event.isForwarded) {
      byId.set(event.eventId, event)
      continue
    }

    if (existing.isForwarded === event.isForwarded) {
      const existingTime = new Date(existing.occurredAt).getTime()
      const nextTime = new Date(event.occurredAt).getTime()
      if (nextTime < existingTime) {
        byId.set(event.eventId, event)
      }
    }
  }

  return [...byId.values()].sort((left, right) => {
    const leftTs = new Date(left.occurredAt).getTime()
    const rightTs = new Date(right.occurredAt).getTime()
    if (leftTs !== rightTs) {
      return leftTs - rightTs
    }
    return left.eventId.localeCompare(right.eventId)
  })
}

export function filterOpsTrackerEventsByForwardedPolicy(
  events: OpsTrackerEventV1[],
  includeForwarded = true,
): OpsTrackerEventV1[] {
  if (includeForwarded) {
    return [...events]
  }

  return events.filter((event) => !event.isForwarded)
}

export function shouldIncludeEventForHigherScopes(event: OpsTrackerEventV1): boolean {
  return event.visibility === "public"
}

function incrementSourceCount(
  counts: Partial<Record<OpsTrackerSource, number>>,
  source: OpsTrackerSource,
  points = 1,
): Partial<Record<OpsTrackerSource, number>> {
  return {
    ...counts,
    [source]: (counts[source] || 0) + points,
  }
}

export function buildOpsTrackerRollups(args: {
  events: OpsTrackerEventV1[]
  timezone: string
  generatedAt?: Date
}): {
  agentRollups: OpsTrackerRollupV1[]
  shipRollups: OpsTrackerRollupV1[]
  fleetRollups: OpsTrackerRollupV1[]
} {
  const timezone = safeTimezone(args.timezone)
  const generatedAt = (args.generatedAt || new Date()).toISOString()

  const agentMap = new Map<string, OpsTrackerRollupV1>()
  const shipMap = new Map<string, OpsTrackerRollupV1>()
  const fleetMap = new Map<string, OpsTrackerRollupV1>()

  for (const event of args.events) {
    const eventDate = event.eventDate

    if (event.shipDeploymentId && event.agentId) {
      const key = `${eventDate}:${event.shipDeploymentId}:${event.agentId}`
      const existing = agentMap.get(key)
      const next: OpsTrackerRollupV1 = existing
        ? {
            ...existing,
            totalPoints: existing.totalPoints + event.points,
            eventCount: existing.eventCount + 1,
            sourceCounts: incrementSourceCount(existing.sourceCounts, event.source, event.points),
          }
        : {
            type: "ops-tracker-rollup",
            trackerVersion: OPS_TRACKER_VERSION,
            scope: "agent",
            rollupDate: eventDate,
            timezone,
            shipDeploymentId: event.shipDeploymentId,
            agentId: event.agentId,
            totalPoints: event.points,
            sourceCounts: incrementSourceCount({}, event.source, event.points),
            eventCount: 1,
            generatedAt,
            tags: sortUnique([
              "ops-tracker/rollup",
              "ops-tracker/rollup/agent",
              `ops-tracker/ship/${event.shipDeploymentId}`,
              `ops-tracker/agent/${event.agentId}`,
            ]),
          }
      agentMap.set(key, next)
    }

    if (event.shipDeploymentId && shouldIncludeEventForHigherScopes(event)) {
      const key = `${eventDate}:${event.shipDeploymentId}`
      const existing = shipMap.get(key)
      const next: OpsTrackerRollupV1 = existing
        ? {
            ...existing,
            totalPoints: existing.totalPoints + event.points,
            eventCount: existing.eventCount + 1,
            sourceCounts: incrementSourceCount(existing.sourceCounts, event.source, event.points),
          }
        : {
            type: "ops-tracker-rollup",
            trackerVersion: OPS_TRACKER_VERSION,
            scope: "ship",
            rollupDate: eventDate,
            timezone,
            shipDeploymentId: event.shipDeploymentId,
            agentId: null,
            totalPoints: event.points,
            sourceCounts: incrementSourceCount({}, event.source, event.points),
            eventCount: 1,
            generatedAt,
            tags: sortUnique([
              "ops-tracker/rollup",
              "ops-tracker/rollup/ship",
              `ops-tracker/ship/${event.shipDeploymentId}`,
            ]),
          }
      shipMap.set(key, next)
    }

    if (shouldIncludeEventForHigherScopes(event)) {
      const key = eventDate
      const existing = fleetMap.get(key)
      const next: OpsTrackerRollupV1 = existing
        ? {
            ...existing,
            totalPoints: existing.totalPoints + event.points,
            eventCount: existing.eventCount + 1,
            sourceCounts: incrementSourceCount(existing.sourceCounts, event.source, event.points),
          }
        : {
            type: "ops-tracker-rollup",
            trackerVersion: OPS_TRACKER_VERSION,
            scope: "fleet",
            rollupDate: eventDate,
            timezone,
            shipDeploymentId: null,
            agentId: null,
            totalPoints: event.points,
            sourceCounts: incrementSourceCount({}, event.source, event.points),
            eventCount: 1,
            generatedAt,
            tags: sortUnique([
              "ops-tracker/rollup",
              "ops-tracker/rollup/fleet",
            ]),
          }
      fleetMap.set(key, next)
    }
  }

  const sortRollups = (values: OpsTrackerRollupV1[]): OpsTrackerRollupV1[] =>
    values.sort((left, right) => {
      if (left.rollupDate !== right.rollupDate) {
        return left.rollupDate.localeCompare(right.rollupDate)
      }
      if (left.shipDeploymentId !== right.shipDeploymentId) {
        return (left.shipDeploymentId || "").localeCompare(right.shipDeploymentId || "")
      }
      return (left.agentId || "").localeCompare(right.agentId || "")
    })

  return {
    agentRollups: sortRollups([...agentMap.values()]),
    shipRollups: sortRollups([...shipMap.values()]),
    fleetRollups: sortRollups([...fleetMap.values()]),
  }
}

function splitDate(dateKey: string): LocalDateParts {
  const [year, month, day] = dateKey.split("-")
  if (!year || !month || !day) {
    throw new Error(`Invalid date key: ${dateKey}`)
  }

  return {
    year,
    month,
    day,
  }
}

function quoteYamlString(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/u.test(value)) {
    return value
  }
  return JSON.stringify(value)
}

function renderYamlScalar(value: unknown): string {
  if (typeof value === "string") {
    return quoteYamlString(value)
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "0"
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }
  if (value === null || value === undefined) {
    return "null"
  }
  return quoteYamlString(JSON.stringify(value))
}

function renderYamlNested(value: unknown, indent: number): string[] {
  const pad = " ".repeat(indent)

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${pad}[]`]
    }

    const lines: string[] = []
    for (const item of value) {
      if (Array.isArray(item) || isRecord(item)) {
        lines.push(`${pad}-`)
        lines.push(...renderYamlNested(item, indent + 2))
      } else {
        lines.push(`${pad}- ${renderYamlScalar(item)}`)
      }
    }
    return lines
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return [`${pad}{}`]
    }

    const lines: string[] = []
    for (const [key, nested] of entries) {
      if (Array.isArray(nested) || isRecord(nested)) {
        lines.push(`${pad}${key}:`)
        lines.push(...renderYamlNested(nested, indent + 2))
      } else {
        lines.push(`${pad}${key}: ${renderYamlScalar(nested)}`)
      }
    }
    return lines
  }

  return [`${pad}${renderYamlScalar(value)}`]
}

export function renderYamlFrontmatter(fields: Record<string, unknown>): string {
  const lines = ["---"]

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value) || isRecord(value)) {
      lines.push(`${key}:`)
      lines.push(...renderYamlNested(value, 2))
    } else {
      lines.push(`${key}: ${renderYamlScalar(value)}`)
    }
  }

  lines.push("---")
  return `${lines.join("\n")}\n`
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed === "null") return null

  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) {
    const parsed = Number.parseFloat(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export function parseYamlFrontmatter(markdown: string): Record<string, unknown> | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/u)
  if (!match) {
    return null
  }

  const block = match[1]
  const lines = block.split("\n")

  const root: Record<string, unknown> = {}
  let idx = 0

  while (idx < lines.length) {
    const line = lines[idx]
    if (!line.trim()) {
      idx += 1
      continue
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u)
    if (!keyMatch) {
      idx += 1
      continue
    }

    const key = keyMatch[1]
    const rest = keyMatch[2]

    if (rest.length > 0) {
      root[key] = parseYamlScalar(rest)
      idx += 1
      continue
    }

    const listValues: unknown[] = []
    const objectValues: Record<string, unknown> = {}
    let sawList = false
    let sawObject = false

    idx += 1
    while (idx < lines.length) {
      const nestedLine = lines[idx]
      if (!nestedLine.startsWith("  ")) {
        break
      }

      const trimmed = nestedLine.trim()
      const listMatch = trimmed.match(/^-\s+(.*)$/u)
      if (listMatch) {
        sawList = true
        listValues.push(parseYamlScalar(listMatch[1]))
        idx += 1
        continue
      }

      const nestedKeyMatch = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u)
      if (nestedKeyMatch) {
        sawObject = true
        objectValues[nestedKeyMatch[1]] = parseYamlScalar(nestedKeyMatch[2])
        idx += 1
        continue
      }

      idx += 1
    }

    if (sawList) {
      root[key] = listValues
    } else if (sawObject) {
      root[key] = objectValues
    } else {
      root[key] = null
    }
  }

  return root
}

export function parseOpsTrackerEventFromMarkdown(markdown: string, timezone = "UTC"): OpsTrackerEventV1 | null {
  const frontmatter = parseYamlFrontmatter(markdown)
  if (!frontmatter) {
    return null
  }

  const eventId = asString(frontmatter.eventId)
  const occurredAt = asString(frontmatter.occurredAt)
  const source = frontmatter.source

  if (!eventId || !occurredAt || !isOpsTrackerSource(source)) {
    return null
  }

  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map((value) => String(value).trim()).filter(Boolean)
    : []

  return normalizeOpsTrackerEvent({
    eventId,
    occurredAt,
    source,
    eventDate: asString(frontmatter.eventDate),
    shipDeploymentId: asString(frontmatter.shipDeploymentId),
    agentId: asString(frontmatter.agentId),
    agentRole: asString(frontmatter.agentRole),
    points: asNumber(frontmatter.points),
    isForwarded: asBoolean(frontmatter.isForwarded),
    visibility: frontmatter.visibility === "private" ? "private" : "public",
    tags,
    title: asString(frontmatter.title) || "Manual ops event",
    summary: asString(frontmatter.summary) || "",
    timezone,
  })
}

export function renderOpsTrackerEventNote(event: OpsTrackerEventV1): string {
  const frontmatter = renderYamlFrontmatter({
    type: event.type,
    trackerVersion: event.trackerVersion,
    eventId: event.eventId,
    eventDate: event.eventDate,
    occurredAt: event.occurredAt,
    shipDeploymentId: event.shipDeploymentId,
    agentId: event.agentId,
    agentRole: event.agentRole,
    source: event.source,
    points: event.points,
    isForwarded: event.isForwarded,
    visibility: event.visibility,
    title: event.title,
    summary: event.summary,
    tags: event.tags,
  })

  const sections = [
    frontmatter,
    `# ${event.title}`,
    "",
    event.summary || "No summary provided.",
    "",
    "## Metadata",
    `- Event ID: \`${event.eventId}\``,
    `- Source: \`${event.source}\``,
    `- Date: ${event.eventDate}`,
    `- Ship: ${event.shipDeploymentId || "fleet"}`,
    `- Agent: ${event.agentId || "n/a"}`,
    `- Visibility: ${event.visibility}`,
  ]

  return `${sections.join("\n")}\n`
}

export function renderOpsTrackerRollupNote(rollup: OpsTrackerRollupV1): string {
  const sourceLines = SOURCE_VALUES
    .map((source) => ({ source, count: rollup.sourceCounts[source] || 0 }))
    .filter((entry) => entry.count > 0)

  const frontmatter = renderYamlFrontmatter({
    type: rollup.type,
    trackerVersion: rollup.trackerVersion,
    scope: rollup.scope,
    rollupDate: rollup.rollupDate,
    timezone: rollup.timezone,
    shipDeploymentId: rollup.shipDeploymentId,
    agentId: rollup.agentId,
    totalPoints: rollup.totalPoints,
    sourceCounts: rollup.sourceCounts,
    eventCount: rollup.eventCount,
    generatedAt: rollup.generatedAt,
    tags: rollup.tags,
  })

  const sections = [
    frontmatter,
    `# Ops Tracker ${rollup.scope.toUpperCase()} Rollup`,
    "",
    `- Date: ${rollup.rollupDate}`,
    `- Total points: ${rollup.totalPoints}`,
    `- Event count: ${rollup.eventCount}`,
    `- Ship: ${rollup.shipDeploymentId || "fleet"}`,
    `- Agent: ${rollup.agentId || "n/a"}`,
    `- Generated at: ${rollup.generatedAt}`,
    "",
    "## Source Breakdown",
    ...(sourceLines.length > 0
      ? sourceLines.map((entry) => `- ${entry.source}: ${entry.count}`)
      : ["- none"]),
  ]

  return `${sections.join("\n")}\n`
}

export function buildManualEventPath(eventDate: string, eventId: string): string {
  const { year, month, day } = splitDate(eventDate)
  return `ops-tracker/events/manual/${year}/${month}/${day}/${eventId}.md`
}

export function buildAutoEventPath(event: OpsTrackerEventV1): string {
  const { year, month, day } = splitDate(event.eventDate)
  const fileName = `${event.source}-${event.eventId}.md`

  if (event.shipDeploymentId) {
    return `kb/ships/${event.shipDeploymentId}/ops-tracker/events/auto/${year}/${month}/${day}/${fileName}`
  }

  return `kb/fleet/ops-tracker/events/auto/${year}/${month}/${day}/${fileName}`
}

export function buildAgentRollupPath(rollup: OpsTrackerRollupV1): string {
  if (!rollup.shipDeploymentId || !rollup.agentId) {
    throw new Error("Agent rollup requires shipDeploymentId and agentId")
  }

  const { year } = splitDate(rollup.rollupDate)
  return `ops-tracker/agents/${rollup.agentId}/ships/${rollup.shipDeploymentId}/daily/${year}/${rollup.rollupDate}.md`
}

export function buildShipRollupPath(rollup: OpsTrackerRollupV1): string {
  if (!rollup.shipDeploymentId) {
    throw new Error("Ship rollup requires shipDeploymentId")
  }

  const { year } = splitDate(rollup.rollupDate)
  return `kb/ships/${rollup.shipDeploymentId}/ops-tracker/daily/${year}/${rollup.rollupDate}.md`
}

export function buildFleetRollupPath(rollup: OpsTrackerRollupV1): string {
  const { year } = splitDate(rollup.rollupDate)
  return `kb/fleet/ops-tracker/daily/${year}/${rollup.rollupDate}.md`
}

export function buildFleetDashboardPath(): string {
  return "kb/fleet/ops-tracker/Fleet-Dashboard.md"
}

export function buildShipDashboardPath(shipDeploymentId: string): string {
  return `kb/ships/${shipDeploymentId}/ops-tracker/Ship-Dashboard.md`
}

export function buildAgentDashboardPath(shipDeploymentId: string, agentId: string): string {
  return `ops-tracker/agents/${agentId}/ships/${shipDeploymentId}/Agent-Dashboard.md`
}

export function buildShipAgentContext(args: {
  shipIds: string[]
  bridgeCrewByShip: Record<string, string[]>
  includeQuartermaster?: boolean
  eventPairs?: Array<{ shipDeploymentId: string; agentId: string }>
}): OpsTrackerShipAgentContext[] {
  const includeQuartermaster = args.includeQuartermaster !== false
  const byShip = new Map<string, Set<string>>()

  for (const shipId of args.shipIds) {
    byShip.set(shipId, new Set())
  }

  for (const [shipId, agents] of Object.entries(args.bridgeCrewByShip)) {
    if (!byShip.has(shipId)) {
      byShip.set(shipId, new Set())
    }

    const shipSet = byShip.get(shipId) as Set<string>
    for (const agent of agents) {
      const normalized = agent.trim().toLowerCase()
      if (normalized) {
        shipSet.add(normalized)
      }
    }
  }

  if (includeQuartermaster) {
    for (const shipSet of byShip.values()) {
      shipSet.add("qtm-lgr")
    }
  }

  for (const pair of args.eventPairs || []) {
    if (!pair.shipDeploymentId || !pair.agentId) continue
    if (!byShip.has(pair.shipDeploymentId)) {
      byShip.set(pair.shipDeploymentId, new Set())
    }
    ;(byShip.get(pair.shipDeploymentId) as Set<string>).add(pair.agentId.toLowerCase())
  }

  return [...byShip.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([shipDeploymentId, agentSet]) => ({
      shipDeploymentId,
      agentIds: [...agentSet].sort((left, right) => left.localeCompare(right)),
    }))
}

export function bridgeRoleToAgentId(stationKey: string): string | null {
  if (!isBridgeRole(stationKey)) {
    return null
  }

  return bridgeCrewTemplateForRole(stationKey).callsign.toLowerCase()
}

function baseHeatmapBlock(args: {
  title: string
  folder: string
  colorHex: string
}): string {
  return [
    `### ${args.title}`,
    "```base",
    "views:",
    "  - type: heatmap-calendar",
    "    name: Daily Activity",
    "    filters:",
    "      and:",
    `        - file.inFolder(\"${args.folder}\")`,
    "        - file.hasTag(\"ops-tracker/rollup\")",
    "    order:",
    "      - note.rollupDate",
    "    dateProperty: note.rollupDate",
    "    trackProperty: note.totalPoints",
    "    showDayLabels: true",
    "    showYearLabels: true",
    "    showLegend: true",
    "    shape: rounded",
    "    colorScheme: primary",
    "    customColors: \"#0f172a, " + args.colorHex + "\"",
    "    viewMode: week-grid",
    "    trackType: number",
    "",
    "```",
  ].join("\n")
}

function baseTableBlock(args: {
  title: string
  folder: string
  tag?: string
  columns?: string[]
  orderColumns?: string[]
  extraFilterLine?: string
}): string {
  const extraFilter = args.extraFilterLine ? [`        - ${args.extraFilterLine}`] : []
  const tag = args.tag || "ops-tracker/rollup"
  const columns = args.columns || [
    "file.name",
    "note.rollupDate",
    "note.shipDeploymentId",
    "note.agentId",
    "note.totalPoints",
    "note.eventCount",
    "note.sourceCounts",
  ]
  const orderColumns = args.orderColumns || [
    "note.rollupDate",
    "note.totalPoints",
  ]
  return [
    `### ${args.title}`,
    "```base",
    "views:",
    "  - type: table",
    "    name: Daily Rows",
    "    filters:",
    "      and:",
    `        - file.inFolder(\"${args.folder}\")`,
    `        - file.hasTag(\"${tag}\")`,
    ...extraFilter,
    "    order:",
    ...orderColumns.map((column) => `      - ${column}`),
    "    columns:",
    ...columns.map((column) => `      - ${column}`),
    "",
    "```",
  ].join("\n")
}

export function renderFleetDashboardNote(): string {
  return [
    "---",
    "tags:",
    "  - ops-tracker/dashboard",
    "  - ops-tracker/fleet",
    "---",
    "# Fleet Ops Tracker Dashboard",
    "",
    "Generated by `ops-tracker-export`.",
    "",
    baseHeatmapBlock({
      title: "Fleet Daily Heatmap",
      folder: "kb/fleet/ops-tracker/daily",
      colorHex: "#0ea5e9",
    }),
    "",
    baseTableBlock({
      title: "Last-30-Day Ship Totals",
      folder: "kb/ships",
      extraFilterLine: "note.scope = \"ship\"",
    }),
    "",
    baseTableBlock({
      title: "Source Mix (Last 30 Days)",
      folder: "kb/fleet/ops-tracker/daily",
      extraFilterLine: "note.scope = \"fleet\"",
    }),
    "",
  ].join("\n")
}

export function renderShipDashboardNote(shipDeploymentId: string): string {
  const shipDailyFolder = `kb/ships/${shipDeploymentId}/ops-tracker/daily`

  return [
    "---",
    "tags:",
    "  - ops-tracker/dashboard",
    "  - ops-tracker/ship",
    `  - ops-tracker/ship/${shipDeploymentId}`,
    "---",
    `# Ship Ops Tracker Dashboard (${shipDeploymentId})`,
    "",
    "Generated by `ops-tracker-export`.",
    "",
    baseHeatmapBlock({
      title: "Ship Daily Heatmap",
      folder: shipDailyFolder,
      colorHex: "#22c55e",
    }),
    "",
    baseTableBlock({
      title: "Per-Agent Totals (Last 30 Days)",
      folder: `kb/ships/${shipDeploymentId}/ops-tracker/events/auto`,
      tag: "ops-tracker/event",
      orderColumns: [
        "note.eventDate",
        "note.points",
      ],
      columns: [
        "file.name",
        "note.eventDate",
        "note.agentId",
        "note.agentRole",
        "note.source",
        "note.points",
        "note.summary",
      ],
    }),
    "",
    baseTableBlock({
      title: "Source Mix (Ship Scope)",
      folder: shipDailyFolder,
      extraFilterLine: `note.shipDeploymentId = \"${shipDeploymentId}\"`,
    }),
    "",
  ].join("\n")
}

export function renderAgentDashboardNote(shipDeploymentId: string, agentId: string): string {
  const agentDailyFolder = `ops-tracker/agents/${agentId}/ships/${shipDeploymentId}/daily`

  return [
    "---",
    "tags:",
    "  - ops-tracker/dashboard",
    "  - ops-tracker/agent",
    `  - ops-tracker/ship/${shipDeploymentId}`,
    `  - ops-tracker/agent/${agentId}`,
    "---",
    `# Agent Ops Tracker Dashboard (${agentId} @ ${shipDeploymentId})`,
    "",
    "Generated by `ops-tracker-export`.",
    "",
    baseHeatmapBlock({
      title: "Agent Daily Heatmap",
      folder: agentDailyFolder,
      colorHex: "#f59e0b",
    }),
    "",
    baseTableBlock({
      title: "Last-30-Day Trend By Source",
      folder: agentDailyFolder,
      extraFilterLine: `note.agentId = \"${agentId}\"`,
    }),
    "",
  ].join("\n")
}

export function renderFleetReadmeNote(): string {
  return [
    "# Fleet Ops Tracker",
    "",
    "## Purpose",
    "- Fleet-wide aggregation dashboard and daily rollups.",
    "- Canonical fleet files live under `kb/fleet/ops-tracker/`.",
    "",
    "## Included Sources",
    "- `manual`",
    "- `security_audit`",
    "- `bridge_scorecard`",
    "- `verification`",
    "- `deployment`",
    "",
    "## Commands",
    "- `npm --prefix node run ops-tracker:export`",
    "- `npm --prefix node run ops-tracker:export:dry-run`",
    "- `npm --prefix node run ops-tracker:backfill`",
    "",
  ].join("\n")
}

export function renderAgentReadmeNote(): string {
  return [
    "# Agent Ops Tracker",
    "",
    "## Quick Start",
    "1. Open `ops-tracker/templates/(TEMPLATE) Ops Tracker Event.md`.",
    "2. Create a new note under `ops-tracker/events/manual/YYYY/MM/DD/`.",
    "3. Fill `shipDeploymentId`, `agentId`, event kind, and notes.",
    "4. Run `npm --prefix node run ops-tracker:export`.",
    "",
    "## Required Frontmatter Fields",
    "- `eventId`",
    "- `occurredAt`",
    "- `shipDeploymentId`",
    "- `agentId`",
    "- `source` (`manual`)",
    "- `points` (default `1`)",
    "- `visibility` (`public` by default)",
    "",
    "## Notes",
    "- Only public events are aggregated into ship/fleet scopes.",
    "- Private content is excluded from ship/fleet rollups.",
    "",
  ].join("\n")
}
