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

export interface QuartermasterPromptMetadata {
  channel?: string
  callsign?: string
  shipDeploymentId?: string
  subagentId?: string
  knowledge?: QuartermasterKnowledgeMetadata
}

export interface QuartermasterKnowledgeSource {
  id?: string
  path?: string
  title?: string
  excerpt?: string
  scopeType?: "ship" | "fleet" | "global"
  shipDeploymentId?: string | null
}

export interface QuartermasterKnowledgeMetadata {
  query?: string
  mode?: "hybrid" | "lexical"
  fallbackUsed?: boolean
  sources?: QuartermasterKnowledgeSource[]
}

export interface QuartermasterShipContext {
  shipDeploymentId?: string
  shipName?: string
  status?: string
  nodeId?: string
  nodeType?: string
  deploymentProfile?: string
  healthStatus?: string | null
  lastHealthCheck?: string | null
  crewCount?: number
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

function summarizeQuartermasterShipContext(shipContext?: QuartermasterShipContext): string {
  if (!shipContext) {
    return "No ship context provided."
  }

  const lines: string[] = []
  if (shipContext.shipName) {
    lines.push(`Ship: ${shipContext.shipName}`)
  }
  if (shipContext.shipDeploymentId) {
    lines.push(`Ship Deployment ID: ${shipContext.shipDeploymentId}`)
  }
  if (shipContext.status) {
    lines.push(`Status: ${shipContext.status}`)
  }
  if (shipContext.nodeId || shipContext.nodeType) {
    lines.push(`Node: ${shipContext.nodeId || "unknown"} (${shipContext.nodeType || "unknown"})`)
  }
  if (shipContext.deploymentProfile) {
    lines.push(`Deployment Profile: ${shipContext.deploymentProfile}`)
  }
  if (shipContext.healthStatus) {
    lines.push(`Health: ${shipContext.healthStatus}`)
  }
  if (shipContext.lastHealthCheck) {
    lines.push(`Last Health Check: ${shipContext.lastHealthCheck}`)
  }
  if (typeof shipContext.crewCount === "number") {
    lines.push(`Bridge Crew Count: ${shipContext.crewCount}`)
  }

  return lines.length > 0 ? lines.join("\n") : "No ship context provided."
}

function sanitizeQuartermasterShipContext(value: unknown): QuartermasterShipContext | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>
  const crewCountValue = record.crewCount
  const crewCount = typeof crewCountValue === "number" && Number.isFinite(crewCountValue)
    ? Math.trunc(crewCountValue)
    : undefined

  return {
    shipDeploymentId: typeof record.shipDeploymentId === "string" ? record.shipDeploymentId : undefined,
    shipName: typeof record.shipName === "string" ? record.shipName : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    nodeId: typeof record.nodeId === "string" ? record.nodeId : undefined,
    nodeType: typeof record.nodeType === "string" ? record.nodeType : undefined,
    deploymentProfile: typeof record.deploymentProfile === "string" ? record.deploymentProfile : undefined,
    healthStatus:
      typeof record.healthStatus === "string" || record.healthStatus === null
        ? (record.healthStatus as string | null)
        : undefined,
    lastHealthCheck:
      typeof record.lastHealthCheck === "string" || record.lastHealthCheck === null
        ? (record.lastHealthCheck as string | null)
        : undefined,
    crewCount,
  }
}

function sanitizeQuartermasterKnowledge(value: unknown): QuartermasterKnowledgeMetadata | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const record = value as Record<string, unknown>
  const rawSources = Array.isArray(record.sources) ? record.sources : []

  return {
    query: typeof record.query === "string" ? record.query : undefined,
    mode: record.mode === "lexical" ? "lexical" : "hybrid",
    fallbackUsed: typeof record.fallbackUsed === "boolean" ? record.fallbackUsed : undefined,
    sources: rawSources
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      .map((entry) => ({
        id: typeof entry.id === "string" ? entry.id : undefined,
        path: typeof entry.path === "string" ? entry.path : undefined,
        title: typeof entry.title === "string" ? entry.title : undefined,
        excerpt: typeof entry.excerpt === "string" ? entry.excerpt : undefined,
        scopeType:
          entry.scopeType === "ship" || entry.scopeType === "fleet" || entry.scopeType === "global"
            ? entry.scopeType
            : undefined,
        shipDeploymentId:
          typeof entry.shipDeploymentId === "string" || entry.shipDeploymentId === null
            ? (entry.shipDeploymentId as string | null)
            : undefined,
      })),
  }
}

function summarizeQuartermasterKnowledge(knowledge?: QuartermasterKnowledgeMetadata): string {
  if (!knowledge || !knowledge.sources || knowledge.sources.length === 0) {
    return [
      "No indexed Vault evidence was retrieved for this request.",
      "Proceed carefully using explicit [S0] assumptions and a short verification plan, and end with a Sources section.",
    ].join(" ")
  }

  const lines: string[] = []
  const retrievalMode = knowledge.mode || "hybrid"
  lines.push(`Retrieval Mode: ${retrievalMode}${knowledge.fallbackUsed ? " (lexical fallback)" : ""}`)
  if (knowledge.query) {
    lines.push(`Knowledge Query: ${knowledge.query}`)
  }
  lines.push("Evidence Sources:")

  for (const source of knowledge.sources.slice(0, 12)) {
    const id = source.id || "S?"
    const scope = source.scopeType || "global"
    const path = source.path || "unknown-path"
    const title = source.title || "Untitled"
    const excerpt = source.excerpt || ""
    lines.push(`[${id}] ${title} (${scope}) :: ${path}`)
    if (excerpt) {
      lines.push(`  Snippet: ${excerpt}`)
    }
  }

  return lines.join("\n")
}

function buildQuartermasterRuntimePrompt(args: {
  userPrompt: string
  quartermaster: QuartermasterPromptMetadata
  shipContext?: QuartermasterShipContext
}): string {
  const callsign = typeof args.quartermaster.callsign === "string" && args.quartermaster.callsign.trim()
    ? args.quartermaster.callsign
    : "QTM-LGR"
  const shipContextSummary = summarizeQuartermasterShipContext(args.shipContext)
  const knowledgeSummary = summarizeQuartermasterKnowledge(args.quartermaster.knowledge)

  return [
    `You are ${callsign}, Quartermaster for this ship inside the OrchWiz control surface.`,
    "Scope: setup guidance, maintenance planning, readiness checks, and diagnostics triage.",
    "Constraint: treat all actions as read-only diagnostics/planning. Do not assume destructive execution.",
    "Tone: warm, concise, and collaborative; no blame; no lecturing.",
    "If key context is missing, ask up to 3 targeted questions under Situation Summary.",
    "Evidence rule: every factual claim must cite one or more knowledge source markers like [S1].",
    "Evidence rule: always end with a Sources section listing cited IDs and their paths.",
    "Response format:",
    "1) Situation Summary",
    "2) Setup/Maintenance Actions (read-only-first sequence)",
    "3) Risks and Guardrails",
    "4) Next Operator Action",
    "5) Sources",
    "",
    "Ship context:",
    shipContextSummary,
    "",
    "Knowledge evidence:",
    knowledgeSummary,
    "",
    "Operator request:",
    args.userPrompt,
  ].join("\n")
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
  const quartermasterRaw = asRecord(metadata.quartermaster)
  const quartermaster = quartermasterRaw as QuartermasterPromptMetadata
  if (quartermaster.channel === "ship-quartermaster") {
    const shipContext = sanitizeQuartermasterShipContext(metadata.shipContext)
    const knowledge = sanitizeQuartermasterKnowledge(quartermasterRaw.knowledge)
    return {
      interactionContent: args.userPrompt,
      runtimePrompt: buildQuartermasterRuntimePrompt({
        userPrompt: args.userPrompt,
        quartermaster: {
          ...quartermaster,
          knowledge,
        },
        shipContext,
      }),
    }
  }

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
