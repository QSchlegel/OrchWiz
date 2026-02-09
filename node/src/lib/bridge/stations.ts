export type BridgeStationKey = "xo" | "ops" | "eng" | "sec" | "med" | "cou"

export type BridgeStationStatus = "online" | "busy" | "offline"

export interface BridgeCrewLike {
  id: string
  role?: string | null
  callsign?: string | null
  name?: string | null
  description?: string | null
}

export interface CanonicalBridgeStation {
  id: string
  stationKey: BridgeStationKey
  callsign: string
  name: string
  role: string
  status: BridgeStationStatus
  load: number
  focus: string
  queue: string[]
  bridgeCrewId?: string
  bridgeCrewName?: string
  bridgeCrewDescription?: string
  subagentId?: string
  subagentName?: string
  subagentDescription?: string
}

interface BridgeStationTemplate {
  stationKey: BridgeStationKey
  role: string
  callsign: string
  defaultStatus: BridgeStationStatus
  defaultLoad: number
  defaultFocus: string
}

export interface ForwardedBridgeEventLike {
  id: string
  payload: unknown
}

const BRIDGE_STATION_TEMPLATES: BridgeStationTemplate[] = [
  {
    stationKey: "xo",
    role: "Executive Officer",
    callsign: "XO-CB01",
    defaultStatus: "online",
    defaultLoad: 46,
    defaultFocus: "Command delegation and mission alignment.",
  },
  {
    stationKey: "ops",
    role: "Operations",
    callsign: "OPS-ARX",
    defaultStatus: "busy",
    defaultLoad: 58,
    defaultFocus: "Compute balancing and deployment routing.",
  },
  {
    stationKey: "eng",
    role: "Engineering",
    callsign: "ENG-GEO",
    defaultStatus: "online",
    defaultLoad: 52,
    defaultFocus: "Incident triage and infrastructure stability.",
  },
  {
    stationKey: "sec",
    role: "Security",
    callsign: "SEC-KOR",
    defaultStatus: "online",
    defaultLoad: 44,
    defaultFocus: "Policy review and security posture checks.",
  },
  {
    stationKey: "med",
    role: "Medical",
    callsign: "MED-BEV",
    defaultStatus: "online",
    defaultLoad: 37,
    defaultFocus: "Runtime health monitoring and diagnostics.",
  },
  {
    stationKey: "cou",
    role: "Communications",
    callsign: "COU-DEA",
    defaultStatus: "busy",
    defaultLoad: 49,
    defaultFocus: "Outbound comms and notification routing.",
  },
]

const BRIDGE_STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeStationKey(value: unknown): BridgeStationKey | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase() as BridgeStationKey
  return BRIDGE_STATION_KEYS.has(key) ? key : null
}

function normalizeStatus(value: unknown): BridgeStationStatus | null {
  if (value === "online" || value === "busy" || value === "offline") {
    return value
  }
  return null
}

function clampLoad(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null
  }
  return Math.min(100, Math.max(0, Math.round(value)))
}

function stationKeyFromCallsign(value: unknown): BridgeStationKey | null {
  if (typeof value !== "string" || !value.trim()) return null
  const [prefix] = value.split("-")
  return normalizeStationKey(prefix)
}

export function getBridgeStationTemplates(): readonly BridgeStationTemplate[] {
  return BRIDGE_STATION_TEMPLATES
}

function stationKeyFromCrew(crew: BridgeCrewLike): BridgeStationKey | null {
  const byRole = normalizeStationKey(crew.role)
  if (byRole) {
    return byRole
  }

  const byCallsign = stationKeyFromCallsign(crew.callsign)
  if (byCallsign) {
    return byCallsign
  }

  return stationKeyFromCallsign(crew.name)
}

export function buildCanonicalBridgeStations(bridgeCrew: BridgeCrewLike[]): CanonicalBridgeStation[] {
  const byKey = new Map<BridgeStationKey, BridgeCrewLike>()
  for (const crewMember of bridgeCrew) {
    const key = stationKeyFromCrew(crewMember)
    if (key && !byKey.has(key)) {
      byKey.set(key, crewMember)
    }
  }

  return BRIDGE_STATION_TEMPLATES.map((template) => {
    const matched = byKey.get(template.stationKey)
    const focus = matched?.description?.trim() || template.defaultFocus
    const callsign = matched?.callsign?.trim() || matched?.name?.trim() || template.callsign

    return {
      id: matched?.id || `station-${template.stationKey}`,
      stationKey: template.stationKey,
      callsign,
      name: callsign,
      role: template.role,
      status: template.defaultStatus,
      load: template.defaultLoad,
      focus,
      queue: [],
      bridgeCrewId: matched?.id,
      bridgeCrewName: callsign,
      bridgeCrewDescription: matched?.description || undefined,
      subagentId: matched?.id,
      subagentName: callsign,
      subagentDescription: matched?.description || undefined,
    }
  })
}

export function applyForwardedBridgeStationEvents(
  stations: CanonicalBridgeStation[],
  events: ForwardedBridgeEventLike[],
): CanonicalBridgeStation[] {
  const next = stations.map((station) => ({ ...station }))
  const byId = new Map<string, number>(next.map((station, index) => [station.id, index]))
  const byKey = new Map<BridgeStationKey, number>(next.map((station, index) => [station.stationKey, index]))

  for (const event of events) {
    const payload = asRecord(event.payload)
    const stationId = typeof payload.stationId === "string" ? payload.stationId : null
    const stationKey =
      normalizeStationKey(payload.stationKey) ||
      stationKeyFromCallsign(payload.callsign) ||
      stationKeyFromCallsign(payload.name)

    const index =
      (stationId && byId.has(stationId) ? byId.get(stationId) : undefined) ??
      (stationKey ? byKey.get(stationKey) : undefined)

    if (index === undefined) {
      continue
    }

    const station = next[index]
    const status = normalizeStatus(payload.status)
    const load = clampLoad(payload.load)

    if (typeof payload.name === "string" && payload.name.trim()) {
      station.name = payload.name
    }
    if (typeof payload.role === "string" && payload.role.trim()) {
      station.role = payload.role
    }
    if (typeof payload.callsign === "string" && payload.callsign.trim()) {
      station.callsign = payload.callsign
    }
    if (typeof payload.focus === "string" && payload.focus.trim()) {
      station.focus = payload.focus
    }
    if (status) {
      station.status = status
    }
    if (load !== null) {
      station.load = load
    }
  }

  return next
}
