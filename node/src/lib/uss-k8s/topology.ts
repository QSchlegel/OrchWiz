// USS-K8S topology configuration
// Maps directly from OWZ-Vault/01-Project-Overview/uss-k8s — Bridge + Observability Diagram.md

export type SubsystemGroup = "users" | "bridge" | "openclaw" | "obs" | "k8s"

export type ComponentType =
  | "operator"
  | "agent"
  | "runtime"
  | "observability"
  | "k8s-workload"
  | "ui"

export type EdgeType = "data" | "control" | "telemetry" | "alert"

export interface SubsystemComponent {
  id: string
  label: string
  sublabel?: string
  group: SubsystemGroup
  componentType: ComponentType
}

export interface TopologyComponent extends SubsystemComponent {
  subagentId?: string
  subagentName?: string
  subagentDescription?: string
  status?: string
}

export interface SubsystemEdge {
  source: string
  target: string
  label?: string
  animated?: boolean
  edgeType: EdgeType
}

export interface CommandHierarchyTier {
  tier: number
  label: string
  description: string
  nodeIds: string[]
}

export const USS_K8S_COMPONENTS: SubsystemComponent[] = [
  // ── USERS ──────────────────────────────────────────
  { id: "qs", label: "CAP-QS (sir)", sublabel: "Telegram / Operator", group: "users", componentType: "operator" },
  { id: "ui", label: "Cora UI", sublabel: "Next.js state reader", group: "users", componentType: "ui" },

  // ── BRIDGE CREW ────────────────────────────────────
  { id: "xo", label: "XO-CB01", sublabel: "bridge coordination", group: "bridge", componentType: "agent" },
  { id: "ops", label: "OPS-ARX", sublabel: "ops automation", group: "bridge", componentType: "agent" },
  { id: "eng", label: "ENG-GEO", sublabel: "incident queue + infra", group: "bridge", componentType: "agent" },
  { id: "sec", label: "SEC-KOR", sublabel: "security review", group: "bridge", componentType: "agent" },
  { id: "med", label: "MED-BEV", sublabel: "health checks", group: "bridge", componentType: "agent" },
  { id: "cou", label: "COU-DEA", sublabel: "comms/outreach", group: "bridge", componentType: "agent" },

  // ── OPENCLAW RUNTIME ───────────────────────────────
  { id: "gw", label: "OpenClaw Gateway", sublabel: "ws://127.0.0.1:18789", group: "openclaw", componentType: "runtime" },
  { id: "cron", label: "Cron Scheduler", sublabel: "recurring + one-shot jobs", group: "openclaw", componentType: "runtime" },
  { id: "state", label: "File-backed State", sublabel: "logs/*.jsonl · OWZ-Vault/**", group: "openclaw", componentType: "runtime" },

  // ── OBSERVABILITY & ANALYTICS ──────────────────────
  { id: "lf", label: "Langfuse", sublabel: "traces / spans / scores", group: "obs", componentType: "observability" },
  { id: "ch", label: "ClickHouse", sublabel: "Langfuse storage / analytics", group: "obs", componentType: "observability" },
  { id: "loki", label: "Grafana Loki", sublabel: "log aggregation", group: "obs", componentType: "observability" },
  { id: "prom", label: "Prometheus", sublabel: "metrics", group: "obs", componentType: "observability" },
  { id: "graf", label: "Grafana", sublabel: "dashboards + alerts", group: "obs", componentType: "observability" },
  { id: "evt", label: "k8s-event-exporter", sublabel: "K8s Events → Loki", group: "obs", componentType: "observability" },

  // ── KUBERNETES CLUSTER ─────────────────────────────
  { id: "app", label: "Workloads", sublabel: "OpenClaw jobs, services, agents", group: "k8s", componentType: "k8s-workload" },
  { id: "nodes", label: "Nodes", sublabel: "kubelet / container runtime", group: "k8s", componentType: "k8s-workload" },
]

export const USS_K8S_EDGES: SubsystemEdge[] = [
  // Operator interactions
  { source: "qs", target: "xo", label: "requests / directives", edgeType: "control" },
  { source: "qs", target: "ui", label: "views state", edgeType: "data" },
  { source: "ui", target: "state", label: "read-only", edgeType: "data" },

  // Bridge crew → Gateway (tool calls)
  { source: "xo", target: "gw", label: "tool calls", edgeType: "control", animated: true },
  { source: "ops", target: "gw", label: "tool calls", edgeType: "control", animated: true },
  { source: "eng", target: "gw", label: "tool calls", edgeType: "control", animated: true },
  { source: "sec", target: "gw", label: "tool calls", edgeType: "control" },
  { source: "med", target: "gw", label: "tool calls", edgeType: "control" },
  { source: "cou", target: "gw", label: "tool calls", edgeType: "control" },

  // Cron + State
  { source: "cron", target: "gw", label: "trigger job runs", edgeType: "control" },
  { source: "gw", target: "state", label: "writes results", edgeType: "data" },

  // K8S telemetry
  { source: "app", target: "loki", label: "pod logs", edgeType: "telemetry" },
  { source: "nodes", target: "loki", label: "node logs", edgeType: "telemetry" },
  { source: "app", target: "evt", edgeType: "telemetry" },
  { source: "evt", target: "loki", label: "events", edgeType: "telemetry" },
  { source: "app", target: "prom", label: "metrics", edgeType: "telemetry" },

  // Observability pipeline
  { source: "prom", target: "graf", edgeType: "data" },
  { source: "loki", target: "graf", edgeType: "data" },
  { source: "gw", target: "lf", label: "LLM / tool traces", edgeType: "telemetry" },
  { source: "lf", target: "ch", edgeType: "data" },
  { source: "ch", target: "graf", label: "SQL / cohorts", edgeType: "data" },

  // Alert feedback loop
  { source: "graf", target: "eng", label: "alerts", edgeType: "alert", animated: true },
  { source: "eng", target: "state", label: "incident notes", edgeType: "data" },
  { source: "eng", target: "xo", label: "action requests", edgeType: "control" },
]

export const USS_K8S_COMMAND_HIERARCHY: CommandHierarchyTier[] = [
  {
    tier: 1,
    label: "Intent + Interface",
    description: "Operator intent and mission UI surface",
    nodeIds: ["qs", "ui"],
  },
  {
    tier: 2,
    label: "Command Core",
    description: "Primary command authority and mission dispatch",
    nodeIds: ["xo"],
  },
  {
    tier: 3,
    label: "Specialist Crew",
    description: "Domain specialists issuing operational actions",
    nodeIds: ["ops", "eng", "sec", "med", "cou"],
  },
  {
    tier: 4,
    label: "Runtime Control",
    description: "Execution control plane and scheduling",
    nodeIds: ["gw", "cron", "state"],
  },
  {
    tier: 5,
    label: "Execution Substrate",
    description: "Workloads and cluster runtime layer",
    nodeIds: ["app", "nodes"],
  },
  {
    tier: 6,
    label: "Feedback + Telemetry",
    description: "Observability, analytics, dashboards, and alerts",
    nodeIds: ["lf", "ch", "loki", "prom", "graf", "evt"],
  },
]

export const USS_K8S_COMMAND_TIER_BY_NODE: Record<string, number> = Object.fromEntries(
  USS_K8S_COMMAND_HIERARCHY.flatMap((tier) => tier.nodeIds.map((nodeId) => [nodeId, tier.tier])),
)

export const SUBSYSTEM_GROUP_CONFIG: Record<
  SubsystemGroup,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  users: { label: "Humans / Operator Surfaces", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
  bridge: { label: "Bridge Crew", color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30" },
  openclaw: { label: "OpenClaw Runtime", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30" },
  obs: { label: "Observability & Analytics", color: "text-violet-400", bgColor: "bg-violet-500/10", borderColor: "border-violet-500/30" },
  k8s: { label: "Kubernetes Cluster", color: "text-rose-400", bgColor: "bg-rose-500/10", borderColor: "border-rose-500/30" },
}

/** Ordered group keys matching the top-to-bottom row layout */
export const GROUP_ORDER: SubsystemGroup[] = ["users", "bridge", "openclaw", "obs", "k8s"]
