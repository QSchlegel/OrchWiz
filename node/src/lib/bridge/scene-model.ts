import type { BridgeStationKey } from "@/lib/bridge/stations"

export interface BridgeStationAnchor {
  position: [number, number, number]
  rotationY: number
}

export interface BridgeCameraShot {
  position: [number, number, number]
  lookAt: [number, number, number]
  fov: number
}

export interface BridgeCameraPose extends BridgeCameraShot {}

export interface BridgeMissionStats {
  active: number
  completed: number
  failed: number
}

export interface BridgeSceneSystem {
  label: string
  state: string
  detail?: string
}

export interface BridgeSceneWorkItem {
  name: string
  status?: string
  eta?: string
  assignedTo?: string
}

export interface BridgeSceneStationSummary {
  stationKey: BridgeStationKey
  callsign: string
  role?: string
  status?: string
  load?: number
  focus?: string
  queue?: string[]
}

export interface BridgeSceneCommsEntry {
  speaker: string
  text: string
  timestamp: string
  kind: "directive" | "response" | "error" | "system"
}

const STATION_ORDER: BridgeStationKey[] = ["xo", "ops", "eng", "sec", "med", "cou"]

const STATION_ANCHORS: Record<BridgeStationKey, BridgeStationAnchor> = {
  xo: { position: [0, -0.65, -6.2], rotationY: 0 },
  ops: { position: [-4.9, -0.65, -7.8], rotationY: 0.28 },
  eng: { position: [4.9, -0.65, -7.8], rotationY: -0.28 },
  sec: { position: [-8.4, -0.65, -4.9], rotationY: 0.52 },
  med: { position: [8.4, -0.65, -4.9], rotationY: -0.52 },
  cou: { position: [0, -0.65, -10.5], rotationY: 0 },
}

const CAMERA_SHOTS: Record<BridgeStationKey, BridgeCameraShot> = {
  xo: { position: [0, 3.5, 12.4], lookAt: [0, 0.2, -6.2], fov: 44 },
  ops: { position: [-7.6, 3.2, 10.6], lookAt: [-4.9, -0.1, -7.8], fov: 45 },
  eng: { position: [7.6, 3.2, 10.6], lookAt: [4.9, -0.1, -7.8], fov: 45 },
  sec: { position: [-10.1, 3.4, 8.1], lookAt: [-8.4, -0.1, -4.9], fov: 46 },
  med: { position: [10.1, 3.4, 8.1], lookAt: [8.4, -0.1, -4.9], fov: 46 },
  cou: { position: [0, 4.0, 8.9], lookAt: [0, 0.0, -10.5], fov: 43 },
}

export const BRIDGE_WIDE_SHOT: BridgeCameraShot = {
  position: [0, 4.8, 20.5],
  lookAt: [0, 1.9, -30],
  fov: 47,
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function clampCount(value: number) {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0))
}

function sanitizeLine(value: string, maxLength = 56): string {
  const compact = value.replace(/\s+/g, " ").trim()
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeStationKey(stationKey: BridgeStationKey | null | undefined): BridgeStationKey | null {
  if (!stationKey) return null
  return STATION_ORDER.includes(stationKey) ? stationKey : null
}

function withExactKeys<T>(builder: (stationKey: BridgeStationKey) => T): Record<BridgeStationKey, T> {
  return {
    xo: builder("xo"),
    ops: builder("ops"),
    eng: builder("eng"),
    sec: builder("sec"),
    med: builder("med"),
    cou: builder("cou"),
  }
}

function copyShot(shot: BridgeCameraShot): BridgeCameraShot {
  return {
    position: [...shot.position] as [number, number, number],
    lookAt: [...shot.lookAt] as [number, number, number],
    fov: shot.fov,
  }
}

export function getBridgeStationOrder(): BridgeStationKey[] {
  return [...STATION_ORDER]
}

export function getBridgeStationAnchors(): Record<BridgeStationKey, BridgeStationAnchor> {
  return withExactKeys((stationKey) => {
    const anchor = STATION_ANCHORS[stationKey]
    return {
      position: [...anchor.position] as [number, number, number],
      rotationY: anchor.rotationY,
    }
  })
}

export function getBridgeCameraShot(stationKey: BridgeStationKey | null | undefined): BridgeCameraShot {
  const normalized = normalizeStationKey(stationKey)
  if (!normalized) {
    return copyShot(BRIDGE_WIDE_SHOT)
  }
  return copyShot(CAMERA_SHOTS[normalized])
}

export function interpolateBridgeCameraPose(
  current: BridgeCameraPose,
  target: BridgeCameraPose,
  deltaSeconds: number,
  damping = 8.5,
): BridgeCameraPose {
  const safeDelta = clampNumber(deltaSeconds, 0, 1)
  const safeDamping = clampNumber(damping, 0.01, 40)
  const alpha = 1 - Math.exp(-safeDamping * safeDelta)

  const lerp = (from: number, to: number) => {
    const safeFrom = Number.isFinite(from) ? from : to
    const safeTo = Number.isFinite(to) ? to : from
    return safeFrom + (safeTo - safeFrom) * alpha
  }

  return {
    position: [
      lerp(current.position[0], target.position[0]),
      lerp(current.position[1], target.position[1]),
      lerp(current.position[2], target.position[2]),
    ],
    lookAt: [
      lerp(current.lookAt[0], target.lookAt[0]),
      lerp(current.lookAt[1], target.lookAt[1]),
      lerp(current.lookAt[2], target.lookAt[2]),
    ],
    fov: lerp(current.fov, target.fov),
  }
}

export interface BridgeTelemetryScreenBlock {
  title: string
  lines: string[]
}

export interface BridgeTelemetrySnapshot {
  mainScreen: BridgeTelemetryScreenBlock
  systemsScreen: BridgeTelemetryScreenBlock
  queueScreen: BridgeTelemetryScreenBlock
  stationScreens: Record<BridgeStationKey, BridgeTelemetryScreenBlock>
  tickerLine: string
}

function toUpperToken(value: string | undefined, fallback: string) {
  const normalized = (value || fallback).replace(/\s+/g, " ").trim()
  if (!normalized) {
    return fallback
  }
  return normalized.toUpperCase()
}

function parseClock(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const date = typeof value === "number" ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString().slice(11, 19)
}

function statusPriority(value: string) {
  if (value === "critical") return 0
  if (value === "warning") return 1
  if (value === "nominal") return 2
  return 3
}

function workPriority(value: string) {
  if (value === "failed") return 0
  if (value === "active") return 1
  if (value === "pending") return 2
  if (value === "completed") return 3
  return 4
}

function compareStrings(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" })
}

function normalizeCommsFeed(entries: BridgeSceneCommsEntry[]): BridgeSceneCommsEntry[] {
  return entries
    .filter((entry) => entry && typeof entry.text === "string" && entry.text.trim().length > 0)
    .map((entry) => ({
      speaker: toUpperToken(entry.speaker, "BRIDGE"),
      text: sanitizeLine(entry.text, 96),
      timestamp: entry.timestamp,
      kind: entry.kind,
    }))
}

function buildAlertStack(systems: BridgeSceneSystem[], workItems: BridgeSceneWorkItem[]): string[] {
  const systemAlerts = [...systems]
    .map((system) => ({
      label: sanitizeLine(system.label || "Subsystem", 30),
      detail: sanitizeLine(system.detail || "", 28),
      state: String(system.state || "nominal").toLowerCase(),
    }))
    .filter((system) => system.state === "critical" || system.state === "warning")
    .sort((a, b) => {
      const priority = statusPriority(a.state) - statusPriority(b.state)
      if (priority !== 0) return priority
      return compareStrings(a.label, b.label)
    })
    .map((system) =>
      sanitizeLine(
        system.detail
          ? `SYS ${system.state.toUpperCase()} ${system.label} ${system.detail}`
          : `SYS ${system.state.toUpperCase()} ${system.label}`,
      ),
    )

  const workAlerts = [...workItems]
    .map((item) => ({
      name: sanitizeLine(item.name || "Untitled task", 32),
      status: String(item.status || "pending").toLowerCase(),
    }))
    .filter((item) => item.status === "failed" || item.status === "active")
    .sort((a, b) => {
      const priority = workPriority(a.status) - workPriority(b.status)
      if (priority !== 0) return priority
      return compareStrings(a.name, b.name)
    })
    .map((item) => sanitizeLine(`WRK ${item.status.toUpperCase()} ${item.name}`))

  return [...systemAlerts, ...workAlerts]
}

export function formatBridgeTelemetry(args: {
  operatorLabel: string
  stardate: string
  missionStats: BridgeMissionStats
  systems: BridgeSceneSystem[]
  workItems: BridgeSceneWorkItem[]
  stations: BridgeSceneStationSummary[]
  selectedStationKey?: BridgeStationKey | null
  commsFeed?: BridgeSceneCommsEntry[]
  lastEventAt?: number | null
}): BridgeTelemetrySnapshot {
  const selectedKey = normalizeStationKey(args.selectedStationKey) ?? "xo"
  const selectedStation = args.stations.find((station) => station.stationKey === selectedKey) ?? null
  const commsFeed = normalizeCommsFeed(args.commsFeed || [])
  const lastComms = commsFeed[commsFeed.length - 1] || null
  const lastEventClock = parseClock(args.lastEventAt) || "--:--:--"

  const missionLine = sanitizeLine(
    `MISSION A:${clampCount(args.missionStats.active)} C:${clampCount(args.missionStats.completed)} F:${clampCount(args.missionStats.failed)}`,
  )
  const selectedStatus = toUpperToken(selectedStation?.status, "ONLINE")
  const selectedLoad = Math.round(clampNumber(selectedStation?.load ?? 0, 0, 100))
  const alertStack = buildAlertStack(args.systems, args.workItems)

  const mainLines = [
    sanitizeLine(`OPS ${args.operatorLabel}`, 64),
    sanitizeLine(`SD ${args.stardate}`),
    missionLine,
    sanitizeLine(`FOCUS ${selectedStation?.callsign || selectedKey.toUpperCase()} ${selectedStatus} ${selectedLoad}%`),
    sanitizeLine(alertStack[0] || "ALERT GREEN"),
    sanitizeLine(`EVENT ${lastEventClock}`),
    sanitizeLine(
      lastComms ? `COMMS ${lastComms.speaker}: ${lastComms.text}` : "COMMS NO COMMS",
      64,
    ),
  ].slice(0, 7)

  const stationByKey = new Map(args.stations.map((station) => [station.stationKey, station]))

  const stationScreens = withExactKeys((stationKey) => {
    const station = stationByKey.get(stationKey)
    const callsign = station?.callsign || stationKey.toUpperCase()
    const status = toUpperToken(station?.status, "ONLINE")
    const load = clampNumber(station?.load ?? 0, 0, 100)
    const focus = station?.focus || "Standing by."
    const queueDepth = station?.queue?.length ?? 0
    const nextQueueItem = station?.queue?.[0] || "QUEUE CLEAR"

    return {
      title: callsign,
      lines: [
        sanitizeLine(`${callsign} ${status} ${Math.round(load)}%`),
        sanitizeLine(`ROLE ${toUpperToken(station?.role, "BRIDGE SPECIALIST")}`),
        sanitizeLine(`QDEPTH ${queueDepth}`),
        sanitizeLine(`NEXT ${nextQueueItem}`, 64),
        sanitizeLine(`FOCUS ${focus}`, 64),
      ].slice(0, 5),
    }
  })

  const criticalCount = args.systems.filter((system) => String(system.state).toLowerCase() === "critical").length
  const warningCount = args.systems.filter((system) => String(system.state).toLowerCase() === "warning").length
  const sortedSystems = [...args.systems].sort((a, b) => {
    const leftState = String(a.state || "nominal").toLowerCase()
    const rightState = String(b.state || "nominal").toLowerCase()
    const priority = statusPriority(leftState) - statusPriority(rightState)
    if (priority !== 0) return priority
    return compareStrings(a.label || "", b.label || "")
  })

  const systemsLines =
    sortedSystems.length === 0
      ? ["NO LIVE SYSTEMS"]
      : [
          sanitizeLine(`ALERTS CRIT:${criticalCount} WARN:${warningCount}`),
          ...sortedSystems.slice(0, 4).map((system) => {
            const state = toUpperToken(String(system.state || "nominal"), "NOMINAL")
            const detail = system.detail ? ` ${system.detail}` : ""
            return sanitizeLine(`${state} ${system.label}${detail}`)
          }),
        ].slice(0, 5)

  const sortedWork = [...args.workItems].sort((a, b) => {
    const left = String(a.status || "pending").toLowerCase()
    const right = String(b.status || "pending").toLowerCase()
    const priority = workPriority(left) - workPriority(right)
    if (priority !== 0) return priority
    return compareStrings(a.name || "", b.name || "")
  })

  const queueLines =
    sortedWork.length === 0
      ? ["QUEUE CLEAR"]
      : [
          sanitizeLine(`WORK ITEMS ${sortedWork.length}`),
          ...sortedWork.slice(0, 4).map((item) => {
            const status = toUpperToken(item.status, "PENDING")
            const eta = item.eta ? ` ETA ${item.eta}` : ""
            return sanitizeLine(`${status} ${item.name}${eta}`)
          }),
        ].slice(0, 5)

  const tickerLine = sanitizeLine(
    lastComms
      ? `${lastComms.kind.toUpperCase()} ${parseClock(lastComms.timestamp) || "--:--:--"} ${lastComms.speaker}: ${lastComms.text}`
      : `NO COMMS • LAST EVENT ${lastEventClock}`,
    112,
  )

  return {
    mainScreen: {
      title: "BRIDGE CORE",
      lines: mainLines,
    },
    systemsScreen: {
      title: "SYSTEMS GRID",
      lines: systemsLines,
    },
    queueScreen: {
      title: "WORK QUEUE",
      lines: queueLines,
    },
    stationScreens,
    tickerLine,
  }
}
