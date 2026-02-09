import type { BridgeStationKey } from "@/lib/bridge/stations"

export interface BridgePromptStation {
  stationKey: BridgeStationKey
  callsign: string
  role: string
  name?: string
  focus?: string
}

export interface BridgeMissionContext {
  operator?: string
  stardate?: string
  systems?: Array<{ label: string; state: string; detail?: string }>
  workItems?: Array<{ name: string; status?: string; eta?: string; assignedTo?: string }>
}

export interface BridgePromptMetadata {
  channel?: string
  stationKey?: string
  callsign?: string
  role?: string
  name?: string
  focus?: string
  cameoCandidates?: Array<{
    stationKey?: string
    callsign?: string
    role?: string
    name?: string
    focus?: string
  }>
  missionContext?: BridgeMissionContext
}

export interface BridgePromptBuildResult {
  runtimePrompt: string
  primaryAgent: string
  cameoKeys: BridgeStationKey[]
  cameoCallsigns: string[]
}

export interface SessionRuntimePromptResolution {
  interactionContent: string
  runtimePrompt: string
  bridgeResponseMetadata?: {
    bridgeStationKey: BridgeStationKey
    bridgePrimaryAgent: string
    bridgeCameos: string[]
  }
}

const BRIDGE_STATION_KEYS = new Set<BridgeStationKey>(["xo", "ops", "eng", "sec", "med", "cou"])

const BASE_CAMEO_MATRIX: Record<BridgeStationKey, BridgeStationKey[]> = {
  xo: ["ops", "eng"],
  ops: ["eng", "sec"],
  eng: ["ops", "med"],
  sec: ["xo", "eng"],
  med: ["eng", "xo"],
  cou: ["xo", "ops"],
}

const KEYWORD_PRIORITIES: Array<{ key: BridgeStationKey; patterns: RegExp[] }> = [
  { key: "sec", patterns: [/\bsecurity\b/i, /\bpolicy\b/i, /\baudit\b/i, /\bthreat\b/i] },
  { key: "eng", patterns: [/\bincident\b/i, /\balert\b/i, /\boutage\b/i, /\binfra(?:structure)?\b/i] },
  { key: "cou", patterns: [/\bcomms?\b/i, /\btelegram\b/i, /\bnotify\b/i, /\boutreach\b/i, /\bbroadcast\b/i] },
  { key: "med", patterns: [/\bhealth\b/i, /\bmedical\b/i, /\bvitals?\b/i, /\bdegrad(?:ed|ation)\b/i] },
  { key: "ops", patterns: [/\bdeploy(?:ment)?\b/i, /\brollout\b/i, /\bscale\b/i, /\brouting\b/i] },
]

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {}
  return value as Record<string, unknown>
}

function asStationKey(value: unknown): BridgeStationKey | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase() as BridgeStationKey
  return BRIDGE_STATION_KEYS.has(key) ? key : null
}

function sanitizeStation(input: BridgePromptMetadata): BridgePromptStation | null {
  const stationKey = asStationKey(input.stationKey)
  if (!stationKey) return null
  const callsign = typeof input.callsign === "string" && input.callsign.trim() ? input.callsign : stationKey.toUpperCase()
  const role = typeof input.role === "string" && input.role.trim() ? input.role : "Bridge Specialist"

  return {
    stationKey,
    callsign,
    role,
    name: typeof input.name === "string" ? input.name : undefined,
    focus: typeof input.focus === "string" ? input.focus : undefined,
  }
}

function sanitizeCameoCandidates(candidates: BridgePromptMetadata["cameoCandidates"]): BridgePromptStation[] {
  if (!Array.isArray(candidates)) return []

  const results: BridgePromptStation[] = []
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue
    const stationKey = asStationKey(candidate.stationKey)
    if (!stationKey) continue
    const callsign =
      typeof candidate.callsign === "string" && candidate.callsign.trim()
        ? candidate.callsign
        : stationKey.toUpperCase()
    const role = typeof candidate.role === "string" && candidate.role.trim() ? candidate.role : "Bridge Specialist"

    results.push({
      stationKey,
      callsign,
      role,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      focus: typeof candidate.focus === "string" ? candidate.focus : undefined,
    })
  }
  return results
}

function summarizeMissionContext(missionContext?: BridgeMissionContext): string {
  if (!missionContext) return "No additional mission context provided."

  const lines: string[] = []

  if (missionContext.operator) {
    lines.push(`Operator: ${missionContext.operator}`)
  }
  if (missionContext.stardate) {
    lines.push(`Stardate: ${missionContext.stardate}`)
  }
  if (Array.isArray(missionContext.systems) && missionContext.systems.length > 0) {
    const systems = missionContext.systems.slice(0, 3).map((system) => `${system.label}=${system.state}`).join(", ")
    lines.push(`Systems: ${systems}`)
  }
  if (Array.isArray(missionContext.workItems) && missionContext.workItems.length > 0) {
    const workItems = missionContext.workItems
      .slice(0, 3)
      .map((item) => `${item.name}${item.status ? ` (${item.status})` : ""}`)
      .join("; ")
    lines.push(`Workload: ${workItems}`)
  }

  return lines.length > 0 ? lines.join("\n") : "No additional mission context provided."
}

export function selectBridgeCameoKeys(
  stationKey: BridgeStationKey,
  userPrompt: string,
  options: { availableKeys?: BridgeStationKey[]; maxCameos?: number } = {},
): BridgeStationKey[] {
  const maxCameos = Math.max(1, options.maxCameos ?? 2)
  const available = new Set(options.availableKeys || (Object.keys(BASE_CAMEO_MATRIX) as BridgeStationKey[]))
  const priority: BridgeStationKey[] = []

  for (const rule of KEYWORD_PRIORITIES) {
    if (rule.patterns.some((pattern) => pattern.test(userPrompt))) {
      priority.push(rule.key)
    }
  }

  const ordered = [...priority, ...BASE_CAMEO_MATRIX[stationKey]]
  const selected: BridgeStationKey[] = []

  for (const cameoKey of ordered) {
    if (selected.length >= maxCameos) break
    if (cameoKey === stationKey) continue
    if (!available.has(cameoKey)) continue
    if (!selected.includes(cameoKey)) {
      selected.push(cameoKey)
    }
  }

  return selected
}

export function buildBridgeRuntimePrompt(args: {
  userPrompt: string
  station: BridgePromptStation
  cameoCandidates?: BridgePromptStation[]
  missionContext?: BridgeMissionContext
}): BridgePromptBuildResult {
  const availableKeys = Array.isArray(args.cameoCandidates)
    ? args.cameoCandidates.map((candidate) => candidate.stationKey)
    : undefined
  const cameoKeys = selectBridgeCameoKeys(args.station.stationKey, args.userPrompt, {
    availableKeys,
    maxCameos: 2,
  })

  const candidateByKey = new Map((args.cameoCandidates || []).map((candidate) => [candidate.stationKey, candidate]))
  const cameoCallsigns = cameoKeys.map((key) => candidateByKey.get(key)?.callsign || key.toUpperCase())

  const missionSummary = summarizeMissionContext(args.missionContext)
  const cameoDirective =
    cameoCallsigns.length > 0
      ? `Include brief cameo lines from: ${cameoCallsigns.map((callsign) => `[${callsign}]`).join(", ")}`
      : "Do not include cameo lines."

  const runtimePrompt = [
    "You are operating in a starship bridge simulation for Agent Ops.",
    `Primary speaker: [${args.station.callsign}] (${args.station.role}).`,
    "Response format requirements:",
    "1) First line must start with the primary tag: [CALLSIGN].",
    `2) ${cameoDirective}`,
    "3) Keep response concise, tactical, and actionable (max 8 short lines).",
    "4) Mention concrete next actions and risk state when relevant.",
    "",
    "Mission context:",
    missionSummary,
    "",
    "Operator message:",
    args.userPrompt,
  ].join("\n")

  return {
    runtimePrompt,
    primaryAgent: args.station.callsign,
    cameoKeys,
    cameoCallsigns,
  }
}

export function resolveSessionRuntimePrompt(args: {
  userPrompt: string
  metadata?: Record<string, unknown>
}): SessionRuntimePromptResolution {
  const metadata = asRecord(args.metadata)
  const bridge = asRecord(metadata.bridge) as BridgePromptMetadata
  const station = sanitizeStation(bridge)

  if (bridge.channel !== "bridge-agent" || !station) {
    return {
      interactionContent: args.userPrompt,
      runtimePrompt: args.userPrompt,
    }
  }

  const cameoCandidates = sanitizeCameoCandidates(bridge.cameoCandidates)
  const missionContext = bridge.missionContext && typeof bridge.missionContext === "object"
    ? bridge.missionContext
    : undefined

  const result = buildBridgeRuntimePrompt({
    userPrompt: args.userPrompt,
    station,
    cameoCandidates,
    missionContext,
  })

  return {
    interactionContent: args.userPrompt,
    runtimePrompt: result.runtimePrompt,
    bridgeResponseMetadata: {
      bridgeStationKey: station.stationKey,
      bridgePrimaryAgent: result.primaryAgent,
      bridgeCameos: result.cameoCallsigns,
    },
  }
}

