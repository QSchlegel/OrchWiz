"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Rocket,
  Server,
  Cloud,
  XCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Trash2,
  Network,
  Activity,
  HardDrive,
  Package,
  Bot,
  RefreshCw,
  ExternalLink,
  Copy,
  Search,
  ChevronDown,
  X,
  Anchor,
  Info,
  MessageSquare,
  Check,
  Radio,
} from "lucide-react"
import { NodeInfoCard } from "@/components/orchestration/NodeInfoCard"
import { ShipQuartermasterPanel } from "@/components/quartermaster/ShipQuartermasterPanel"
import { useEventStream } from "@/lib/realtime/useEventStream"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DeploymentProfile = "local_starship_build" | "cloud_shipyard"
type ProvisioningMode = "terraform_ansible" | "terraform_only" | "ansible_only"
type NodeType = "local" | "cloud" | "hybrid"
type InfrastructureKind = "kind" | "minikube" | "existing_k8s"

interface InfrastructureConfig {
  kind: InfrastructureKind
  kubeContext: string
  namespace: string
  terraformWorkspace: string
  terraformEnvDir: string
  ansibleInventory: string
  ansiblePlaybook: string
}

interface DeploymentFormData {
  name: string
  description: string
  subagentId: string
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  advancedNodeTypeOverride: boolean
  nodeUrl: string
  infrastructure: InfrastructureConfig
}

// ---------------------------------------------------------------------------
// Label Maps
// ---------------------------------------------------------------------------
const deploymentProfileLabels: Record<DeploymentProfile, string> = {
  local_starship_build: "Local Starship Build",
  cloud_shipyard: "Cloud Shipyard",
}

const provisioningModeLabels: Record<ProvisioningMode, string> = {
  terraform_ansible: "Terraform + Ansible",
  terraform_only: "Terraform only",
  ansible_only: "Ansible only",
}

const infrastructureKindLabels: Record<InfrastructureKind, string> = {
  kind: "KIND",
  minikube: "Minikube",
  existing_k8s: "Existing K8s",
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------
function isInfrastructureKind(value: unknown): value is InfrastructureKind {
  return value === "kind" || value === "minikube" || value === "existing_k8s"
}

function kubeContextForKind(kind: InfrastructureKind): string {
  if (kind === "kind") return "kind-orchwiz"
  if (kind === "minikube") return "minikube"
  return "existing-cluster"
}

function defaultInfrastructure(profile: DeploymentProfile): InfrastructureConfig {
  if (profile === "cloud_shipyard") {
    return {
      kind: "existing_k8s",
      kubeContext: "existing-cluster",
      namespace: "orchwiz-shipyard",
      terraformWorkspace: "shipyard-cloud",
      terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
      ansibleInventory: "infra/ansible/inventory/cloud.ini",
      ansiblePlaybook: "infra/ansible/playbooks/shipyard_cloud.yml",
    }
  }
  return {
    kind: "kind",
    kubeContext: "kind-orchwiz",
    namespace: "orchwiz-starship",
    terraformWorkspace: "starship-local",
    terraformEnvDir: "infra/terraform/environments/starship-local",
    ansibleInventory: "infra/ansible/inventory/local.ini",
    ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
  }
}

function deriveNodeType(
  profile: DeploymentProfile,
  advancedOverride: boolean,
  requested: NodeType,
): NodeType {
  if (profile === "local_starship_build") return "local"
  if (advancedOverride && requested === "hybrid") return "hybrid"
  return "cloud"
}

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------
interface Deployment {
  id: string
  name: string
  description: string | null
  subagentId: string | null
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  nodeUrl: string | null
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  config: any
  metadata: any
  deployedAt: string | null
  lastHealthCheck: string | null
  healthStatus: string | null
  createdAt: string
  subagent?: { id: string; name: string; description: string | null }
}

interface RuntimeSnapshot {
  checkedAt: string
  docker: {
    available: boolean
    currentContext: string | null
    contexts: { name: string; description: string; dockerEndpoint: string; current: boolean; error: string | null }[]
    error?: string
  }
  kubernetes: {
    available: boolean
    currentContext: string | null
    contexts: string[]
    error?: string
  }
  kind: {
    available: boolean
    clusters: {
      name: string
      kubeContext: string
      kubeContextPresent: boolean
      controlPlaneContainer: string | null
      runningNodeCount: number
      totalNodeCount: number
      nodeContainers: { name: string; image: string; state: string | null; status: string }[]
    }[]
    error?: string
  }
}

interface DeploymentWithInfra extends Deployment {
  infrastructure: InfrastructureConfig | null
}

// ---------------------------------------------------------------------------
// Visual configuration
// ---------------------------------------------------------------------------
const statusCfg = {
  pending: { icon: Clock, color: "text-amber-500 dark:text-yellow-400", bg: "bg-amber-500/15 dark:bg-yellow-500/20", border: "border-amber-500/25 dark:border-yellow-500/30", accent: "bg-amber-400 dark:bg-yellow-400", label: "Pending", pulse: true },
  deploying: { icon: Rocket, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/15 dark:bg-blue-500/20", border: "border-blue-500/25 dark:border-blue-500/30", accent: "bg-blue-500 dark:bg-blue-400", label: "Deploying", pulse: true },
  active: { icon: Activity, color: "text-emerald-600 dark:text-green-400", bg: "bg-emerald-500/15 dark:bg-green-500/20", border: "border-emerald-500/25 dark:border-green-500/30", accent: "bg-emerald-500 dark:bg-green-400", label: "Active", pulse: false },
  inactive: { icon: Square, color: "text-slate-500 dark:text-gray-400", bg: "bg-slate-500/10 dark:bg-gray-500/20", border: "border-slate-400/20 dark:border-gray-500/30", accent: "bg-slate-400 dark:bg-gray-500", label: "Inactive", pulse: false },
  failed: { icon: XCircle, color: "text-rose-600 dark:text-red-400", bg: "bg-rose-500/15 dark:bg-red-500/20", border: "border-rose-500/25 dark:border-red-500/30", accent: "bg-rose-500 dark:bg-red-400", label: "Failed", pulse: false },
  updating: { icon: Package, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/15 dark:bg-orange-500/20", border: "border-orange-500/25 dark:border-orange-500/30", accent: "bg-orange-500 dark:bg-orange-400", label: "Updating", pulse: true },
} as const

const nodeTypeCfg = {
  local: { icon: HardDrive, label: "Local", color: "text-violet-600 dark:text-purple-400", bg: "bg-violet-500/12 dark:bg-purple-500/15", border: "border-violet-500/20 dark:border-purple-500/30" },
  cloud: { icon: Cloud, label: "Cloud", color: "text-sky-600 dark:text-blue-400", bg: "bg-sky-500/12 dark:bg-blue-500/15", border: "border-sky-500/20 dark:border-blue-500/30" },
  hybrid: { icon: Network, label: "Hybrid", color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-500/12 dark:bg-pink-500/15", border: "border-pink-500/20 dark:border-pink-500/30" },
} as const

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function formatUptime(deployedAt: Date): string {
  const diff = Date.now() - deployedAt.getTime()
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function extractInfrastructure(config: unknown, profile?: DeploymentProfile): InfrastructureConfig | null {
  if (!config || typeof config !== "object") return null
  const infra = (config as Record<string, unknown>).infrastructure
  if (!infra || typeof infra !== "object") return null

  const raw = infra as Record<string, unknown>
  const def = defaultInfrastructure(profile || "local_starship_build")
  const kind = isInfrastructureKind(raw.kind) ? raw.kind
    : profile === "cloud_shipyard" ? "existing_k8s"
    : typeof raw.kubeContext === "string" && raw.kubeContext.toLowerCase().includes("minikube") ? "minikube"
    : "kind"

  return {
    kind,
    kubeContext: typeof raw.kubeContext === "string" ? raw.kubeContext : kubeContextForKind(kind),
    namespace: typeof raw.namespace === "string" ? raw.namespace : def.namespace,
    terraformWorkspace: typeof raw.terraformWorkspace === "string" ? raw.terraformWorkspace : def.terraformWorkspace,
    terraformEnvDir: typeof raw.terraformEnvDir === "string" ? raw.terraformEnvDir : def.terraformEnvDir,
    ansibleInventory: typeof raw.ansibleInventory === "string" ? raw.ansibleInventory : def.ansibleInventory,
    ansiblePlaybook: typeof raw.ansiblePlaybook === "string" ? raw.ansiblePlaybook : def.ansiblePlaybook,
  }
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return "Never"
  const then = new Date(value)
  if (Number.isNaN(then.getTime())) return "Unknown"
  const ms = Date.now() - then.getTime()
  if (ms < 60_000) return "Just now"
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

// ---------------------------------------------------------------------------
// Detail Panel Tab
// ---------------------------------------------------------------------------
type DetailTab = "overview" | "quartermaster"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ShipsPage() {
  const initialProfile: DeploymentProfile = "local_starship_build"

  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | Deployment["status"]>("all")
  const [infraFilter, setInfraFilter] = useState<"all" | InfrastructureKind>("all")
  const [subagents, setSubagents] = useState<any[]>([])
  const [runtime, setRuntime] = useState<RuntimeSnapshot | null>(null)
  const [runtimeLoading, setRuntimeLoading] = useState(true)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const [tab, setTab] = useState<DetailTab>("overview")
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState<DeploymentFormData>({
    name: "", description: "", subagentId: "", nodeId: "",
    nodeType: "local", deploymentProfile: initialProfile,
    provisioningMode: "terraform_ansible", advancedNodeTypeOverride: false,
    nodeUrl: "", infrastructure: defaultInfrastructure(initialProfile),
  })

  const derivedNodeType = useMemo(
    () => deriveNodeType(form.deploymentProfile, form.advancedNodeTypeOverride, form.nodeType),
    [form.advancedNodeTypeOverride, form.deploymentProfile, form.nodeType],
  )

  // ── Fetching ──────────────────────────────────────────────────────────
  useEffect(() => { fetchDeployments() }, [])
  useEffect(() => {
    fetchSubagents(); fetchRuntime()
    const t = window.setInterval(fetchRuntime, 20_000)
    return () => window.clearInterval(t)
  }, [])

  useEventStream({
    enabled: true,
    types: ["ship.updated", "deployment.updated", "forwarding.received"],
    onEvent: () => { fetchDeployments(); fetchRuntime() },
  })

  useEffect(() => {
    if (!showModal || !runtime || !runtime.kind.clusters.length) return
    if (form.deploymentProfile !== "local_starship_build" || form.infrastructure.kind !== "kind") return
    const defCtx = defaultInfrastructure("local_starship_build").kubeContext
    if (form.infrastructure.kubeContext !== defCtx) return
    const ctx = runtime.kind.clusters.find(c => c.runningNodeCount > 0)?.kubeContext || runtime.kind.clusters[0]?.kubeContext
    if (!ctx || ctx === form.infrastructure.kubeContext) return
    setForm(f => ({ ...f, infrastructure: { ...f.infrastructure, kubeContext: ctx } }))
  }, [form.deploymentProfile, form.infrastructure.kind, form.infrastructure.kubeContext, runtime, showModal])

  async function fetchDeployments() {
    setIsLoading(true)
    try {
      const r = await fetch("/api/ships")
      if (r.ok) setDeployments(await r.json())
    } catch (e) { console.error("Error fetching ships:", e) }
    finally { setIsLoading(false) }
  }

  async function fetchSubagents() {
    try { const r = await fetch("/api/subagents"); if (r.ok) setSubagents(await r.json()) }
    catch (e) { console.error("Error fetching subagents:", e) }
  }

  async function fetchRuntime() {
    setRuntimeLoading(true)
    try { const r = await fetch("/api/ships/runtime"); if (r.ok) setRuntime(await r.json()) }
    catch (e) { console.error("Error fetching runtime:", e) }
    finally { setRuntimeLoading(false) }
  }

  // ── Handlers ──────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setIsCreating(true)
    try {
      const r = await fetch("/api/ships", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, description: form.description,
          subagentId: form.subagentId || null, nodeId: form.nodeId,
          nodeType: form.nodeType, deploymentType: "ship",
          deploymentProfile: form.deploymentProfile,
          provisioningMode: form.provisioningMode,
          advancedNodeTypeOverride: form.advancedNodeTypeOverride,
          nodeUrl: form.nodeUrl || null,
          config: { infrastructure: form.infrastructure },
        }),
      })
      if (r.ok) {
        setShowModal(false)
        setForm({ name: "", description: "", subagentId: "", nodeId: "", nodeType: "local", deploymentProfile: initialProfile, provisioningMode: "terraform_ansible", advancedNodeTypeOverride: false, nodeUrl: "", infrastructure: defaultInfrastructure(initialProfile) })
        fetchDeployments()
      }
    } catch (e) { console.error("Error creating deployment:", e) }
    finally { setIsCreating(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this ship?")) return
    try {
      const r = await fetch(`/api/ships/${id}`, { method: "DELETE" })
      if (r.ok) { if (selectedId === id) setSelectedId(null); fetchDeployments() }
    } catch (e) { console.error("Error deleting:", e) }
  }

  async function handleStatus(id: string, status: Deployment["status"]) {
    try {
      const r = await fetch(`/api/ships/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      if (r.ok) fetchDeployments()
    } catch (e) { console.error("Error updating:", e) }
  }

  function handleCopy(nodeId: string) {
    navigator.clipboard.writeText(nodeId)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const withInfra = useMemo<DeploymentWithInfra[]>(
    () => deployments.map(d => ({ ...d, infrastructure: extractInfrastructure(d.config, d.deploymentProfile) })),
    [deployments],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return withInfra.filter(d => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false
      if (infraFilter !== "all" && d.infrastructure?.kind !== infraFilter) return false
      if (!q) return true
      return [d.name, d.nodeId, d.subagent?.name || "", d.infrastructure?.kubeContext || "", d.infrastructure?.namespace || ""].join(" ").toLowerCase().includes(q)
    })
  }, [withInfra, infraFilter, search, statusFilter])

  const kindByCtx = useMemo(() => new Map((runtime?.kind.clusters || []).map(c => [c.kubeContext, c])), [runtime])

  const summary = useMemo(() => ({
    total: withInfra.length,
    active: withInfra.filter(d => d.status === "active").length,
    failed: withInfra.filter(d => d.status === "failed").length,
    filtered: filtered.length,
  }), [withInfra, filtered.length])

  useEffect(() => {
    if (!selectedId) return
    if (!filtered.some(d => d.id === selectedId)) setSelectedId(filtered[0]?.id || null)
  }, [filtered, selectedId])

  const selected = useMemo<DeploymentWithInfra | null>(
    () => selectedId ? filtered.find(d => d.id === selectedId) || null : null,
    [filtered, selectedId],
  )

  const hasFilters = !!(search || statusFilter !== "all" || infraFilter !== "all")

  // ── Shared input styles ───────────────────────────────────────────────
  const inputCls = "w-full rounded-lg border border-slate-300/70 dark:border-white/15 bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors backdrop-blur-sm"
  const selectCls = "rounded-lg border border-slate-300/70 dark:border-white/15 bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-cyan-500/50 transition-colors backdrop-blur-sm"

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-orb">
      {/* Subtle grid texture overlay */}
      <div className="pointer-events-none fixed inset-0 bridge-grid opacity-40 dark:opacity-100" />

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <header className="mb-6 animate-fade-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 dark:from-purple-500/25 dark:to-pink-500/25 p-3">
                  <Rocket className="h-7 w-7 text-violet-600 dark:text-purple-400" />
                </div>
                {summary.active > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "var(--font-display)" }}>
                  Fleet Command
                </h1>
                <p className="readout mt-0.5 text-slate-500 dark:text-gray-500">SHIP DEPLOYMENT & MANAGEMENT</p>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-purple-600 dark:to-pink-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/20 dark:shadow-purple-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-violet-500/30 dark:hover:shadow-purple-500/30 hover:brightness-110 active:scale-[0.98]"
            >
              <Rocket className="h-4 w-4" />
              Launch Ship
            </button>
          </div>

          {/* Stats */}
          <div className="mt-5 flex flex-wrap gap-2 animate-fade-up stagger-1">
            {[
              { label: "FLEET", value: summary.total, cls: "border-slate-200/70 dark:border-white/10 text-slate-700 dark:text-slate-200" },
              { label: "ACTIVE", value: summary.active, cls: "border-emerald-500/25 text-emerald-700 dark:text-emerald-300" },
              { label: "FAILED", value: summary.failed, cls: "border-rose-500/25 text-rose-700 dark:text-red-300" },
              ...(hasFilters ? [{ label: "SHOWING", value: summary.filtered, cls: "border-cyan-500/25 text-cyan-700 dark:text-cyan-200" }] : []),
            ].map(s => (
              <div key={s.label} className={`glass rounded-lg border px-3 py-1.5 flex items-baseline gap-2 ${s.cls}`}>
                <span className="readout opacity-60">{s.label}</span>
                <span className="text-base font-semibold font-tactical tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        </header>

        {/* Divider */}
        <div className="bridge-divider mb-6" />

        {/* ── Master / Detail ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start animate-fade-up stagger-2">
          {/* ─── LEFT: Ship List ────────────────────────────────────── */}
          <aside className="w-full shrink-0 lg:w-[400px] xl:w-[440px]">
            {/* Search + Filters */}
            <div className="mb-3 space-y-2">
              <label className="flex items-center gap-2 glass rounded-lg px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-gray-500" />
                <input
                  type="text" value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search ships..."
                  className="w-full bg-transparent text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-gray-500"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
              <div className="flex gap-2">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className={`${selectCls} flex-1`}>
                  <option value="all">All statuses</option>
                  {(["pending", "deploying", "active", "inactive", "failed", "updating"] as const).map(s => (
                    <option key={s} value={s}>{statusCfg[s].label}</option>
                  ))}
                </select>
                <select value={infraFilter} onChange={e => setInfraFilter(e.target.value as any)} className={`${selectCls} flex-1`}>
                  <option value="all">All infra</option>
                  {(["kind", "minikube", "existing_k8s"] as const).map(k => (
                    <option key={k} value={k}>{infrastructureKindLabels[k]}</option>
                  ))}
                </select>
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(""); setStatusFilter("all"); setInfraFilter("all") }}
                    className="glass rounded-lg px-2.5 text-xs text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="card-scroll space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 340px)" }}>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={`skeleton-shimmer h-[68px] rounded-xl stagger-${Math.min(i + 1, 5)}`} style={{ animationDelay: `${i * 80}ms` }} />
                ))
              ) : filtered.length === 0 ? (
                <div className="glass rounded-xl px-5 py-10 text-center">
                  {summary.total === 0 ? (
                    <>
                      <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
                        <span className="absolute inset-0 animate-ping rounded-full bg-violet-400/20 dark:bg-purple-400/20" />
                        <div className="relative rounded-2xl bg-violet-500/10 dark:bg-purple-500/15 p-4">
                          <Rocket className="h-8 w-8 text-violet-500 dark:text-purple-400 opacity-60" />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-700 dark:text-gray-300">No ships yet</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-gray-500">Launch your first ship to start your fleet</p>
                      <button
                        onClick={() => setShowModal(true)}
                        className="mt-4 rounded-lg bg-violet-600/90 dark:bg-purple-600/80 px-4 py-1.5 text-xs font-medium text-white hover:bg-violet-600 dark:hover:bg-purple-600 transition-colors"
                      >
                        Launch Ship
                      </button>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="mx-auto mb-2 h-7 w-7 text-amber-500 dark:text-amber-300 opacity-60" />
                      <p className="text-sm font-medium text-slate-700 dark:text-gray-300">No ships match filters</p>
                      <button
                        onClick={() => { setSearch(""); setStatusFilter("all"); setInfraFilter("all") }}
                        className="mt-2 text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
                      >
                        Reset filters
                      </button>
                    </>
                  )}
                </div>
              ) : (
                filtered.map((ship, i) => {
                  const st = statusCfg[ship.status]
                  const nt = nodeTypeCfg[ship.nodeType]
                  const StatusIcon = st.icon
                  const NodeIcon = nt.icon
                  const isSel = ship.id === selectedId

                  return (
                    <button
                      key={ship.id}
                      onClick={() => { setSelectedId(ship.id); setTab("overview") }}
                      className={`animate-fade-up group relative w-full rounded-xl border text-left transition-all duration-200 ${
                        isSel
                          ? "glass-elevated border-cyan-500/30 dark:border-cyan-400/30 surface-glow-cyan"
                          : "glass border-transparent hover:border-slate-300/50 dark:hover:border-white/15"
                      }`}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    >
                      {/* LCARS-style left accent bar */}
                      <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full transition-all ${
                        isSel ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                      } ${st.accent}`} />

                      <div className="flex items-center gap-3 px-4 py-3 pl-5">
                        <div className={`shrink-0 rounded-lg border p-1.5 ${nt.bg} ${nt.border}`}>
                          <NodeIcon className={`h-4 w-4 ${nt.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-800 dark:text-white">{ship.name}</span>
                            {ship.subagent && <Bot className="h-3 w-3 shrink-0 text-violet-500/60 dark:text-purple-400/60" />}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="font-tactical text-[11px] text-slate-400 dark:text-gray-500 truncate">{ship.nodeId}</span>
                            {ship.infrastructure && (
                              <>
                                <span className="text-slate-300 dark:text-white/15">&middot;</span>
                                <span className="readout text-slate-400 dark:text-gray-600">{infrastructureKindLabels[ship.infrastructure.kind]}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className={`shrink-0 flex items-center gap-1 rounded-md border px-2 py-0.5 ${st.bg} ${st.border}`}>
                          <StatusIcon className={`h-3 w-3 ${st.color} ${st.pulse ? "animate-pulse" : ""}`} />
                          <span className={`readout ${st.color}`}>{st.label}</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>

            {/* Runtime disclosure */}
            <div className="mt-4 animate-fade-up stagger-3">
              <button
                onClick={() => setRuntimeOpen(!runtimeOpen)}
                className="glass flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:brightness-105"
              >
                <Radio className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400 opacity-70" />
                <span className="readout flex-1 text-slate-600 dark:text-gray-400">LOCAL RUNTIME</span>
                <span className="readout text-slate-400 dark:text-gray-600">{relativeTime(runtime?.checkedAt)}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 dark:text-gray-500 transition-transform duration-200 ${runtimeOpen ? "rotate-180" : ""}`} />
              </button>
              {runtimeOpen && (
                <div className="glass mt-2 animate-slide-in space-y-3 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="readout text-slate-500 dark:text-gray-500">DOCKER CONTEXT</span>
                    <button onClick={fetchRuntime} className="readout flex items-center gap-1 text-cyan-600 dark:text-cyan-400 hover:underline">
                      <RefreshCw className={`h-3 w-3 ${runtimeLoading ? "animate-spin" : ""}`} />
                      REFRESH
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Server className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
                    <span className="font-medium text-slate-800 dark:text-white font-tactical">{runtime?.docker.currentContext || "Unavailable"}</span>
                    {runtime?.docker.currentContext === "desktop-linux" && (
                      <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Ready</span>
                    )}
                  </div>
                  {runtime?.docker.error && <p className="text-xs text-rose-600 dark:text-red-300">{runtime.docker.error}</p>}

                  <div className="bridge-divider" />

                  <div>
                    <span className="readout text-slate-500 dark:text-gray-500">KIND CLUSTERS</span>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 dark:text-blue-300" />
                      <span className="font-medium text-slate-800 dark:text-white font-tactical">{runtime?.kind.clusters.length || 0} detected</span>
                    </div>
                    {runtime?.kind.error && <p className="mt-1 text-xs text-rose-600 dark:text-red-300">{runtime.kind.error}</p>}
                    {!runtime?.kind.error && !runtime?.kind.clusters.length && (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-yellow-200/70">
                        No cluster. Run <code className="font-tactical text-cyan-700 dark:text-cyan-300/80">kind create cluster --name orchwiz</code>
                      </p>
                    )}
                    {!!runtime?.kind.clusters.length && (
                      <div className="mt-2 space-y-1">
                        {runtime.kind.clusters.map(c => (
                          <div key={c.kubeContext} className="flex items-center justify-between rounded-md border border-slate-200/50 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] px-2.5 py-1">
                            <span className="font-tactical text-[11px] font-medium text-cyan-700 dark:text-cyan-300">{c.name}</span>
                            <span className="font-tactical text-[11px] text-slate-500 dark:text-gray-400">
                              {c.runningNodeCount}/{c.totalNodeCount || 0} nodes
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bridge-divider" />

                  <div>
                    <span className="readout text-slate-500 dark:text-gray-500">KUBE CONTEXT</span>
                    <div className="mt-1 flex items-center gap-2 text-sm">
                      <Activity className="h-3.5 w-3.5 text-violet-600 dark:text-purple-300" />
                      <span className="font-medium text-slate-800 dark:text-white font-tactical">{runtime?.kubernetes.currentContext || "Unavailable"}</span>
                    </div>
                    {runtime?.kubernetes.error && <p className="mt-1 text-xs text-rose-600 dark:text-red-300">{runtime.kubernetes.error}</p>}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ─── RIGHT: Detail Panel ───────────────────────────────── */}
          <main className="min-w-0 flex-1 animate-fade-up stagger-3">
            {selected ? (
              <DetailPanel
                ship={selected} tab={tab} onTab={setTab}
                onStatus={handleStatus} onDelete={handleDelete}
                onCopy={handleCopy} copied={copied}
                kindCluster={selected.infrastructure?.kind === "kind" ? kindByCtx.get(selected.infrastructure.kubeContext) : undefined}
                runtime={runtime}
              />
            ) : (
              <div className="glass flex min-h-[420px] flex-col items-center justify-center rounded-2xl">
                <div className="relative mb-4">
                  <div className="absolute inset-0 -m-4 rounded-full bg-cyan-500/5 dark:bg-cyan-400/5 animate-ping" style={{ animationDuration: "3s" }} />
                  <Anchor className="relative h-12 w-12 text-slate-300 dark:text-gray-600" />
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-gray-400">
                  {summary.total === 0 ? "Launch a ship to begin" : "Select a ship to view details"}
                </p>
                <p className="mt-1 readout text-slate-400 dark:text-gray-600">
                  {summary.total === 0 ? "YOUR FLEET IS EMPTY" : `${summary.total} SHIP${summary.total !== 1 ? "S" : ""} IN FLEET`}
                </p>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="welcome-modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 dark:bg-black/60 backdrop-blur-sm pt-[5vh] pb-12" onClick={() => setShowModal(false)}>
          <div
            className="welcome-modal-enter relative w-full max-w-2xl glass-elevated rounded-2xl border border-slate-200/80 dark:border-white/15 p-6 shadow-2xl bg-white/90 dark:bg-slate-950/95"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Launch New Ship</h2>
                <p className="readout mt-1 text-slate-500 dark:text-gray-500">CONFIGURE DEPLOYMENT PARAMETERS</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-slate-400 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bridge-divider mb-5" />

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">NAME</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className={inputCls} placeholder="my-ship" />
                </div>
                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">SUBAGENT</label>
                  <select value={form.subagentId} onChange={e => setForm({ ...form, subagentId: e.target.value })} className={`${selectCls} w-full`}>
                    <option value="">None (Custom Agent)</option>
                    {subagents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">NODE ID</label>
                  <input type="text" value={form.nodeId} onChange={e => setForm({ ...form, nodeId: e.target.value })} required className={inputCls} placeholder="node-001" />
                </div>
                <div>
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">DEPLOYMENT PROFILE</label>
                  <select
                    value={form.deploymentProfile}
                    onChange={e => {
                      const dp = e.target.value as DeploymentProfile
                      setForm({ ...form, deploymentProfile: dp, advancedNodeTypeOverride: dp === "cloud_shipyard" ? form.advancedNodeTypeOverride : false, nodeType: dp === "local_starship_build" ? "local" : form.nodeType === "hybrid" ? "hybrid" : "cloud", infrastructure: defaultInfrastructure(dp) })
                    }}
                    className={`${selectCls} w-full`}
                  >
                    <option value="local_starship_build">Local Starship Build</option>
                    <option value="cloud_shipyard">Cloud Shipyard</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">PROVISIONING MODE</label>
                  <select value={form.provisioningMode} onChange={e => setForm({ ...form, provisioningMode: e.target.value as ProvisioningMode })} className={`${selectCls} w-full`}>
                    <option value="terraform_ansible">Terraform + Ansible</option>
                    <option value="terraform_only" disabled>Terraform only (coming soon)</option>
                    <option value="ansible_only" disabled>Ansible only (coming soon)</option>
                  </select>
                  <p className="mt-1 font-tactical text-[11px] text-slate-400 dark:text-gray-600">
                    {deploymentProfileLabels[form.deploymentProfile]} &rarr; {nodeTypeCfg[derivedNodeType].label}
                  </p>
                </div>
                {form.deploymentProfile === "cloud_shipyard" && (
                  <div className="sm:col-span-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                      <input type="checkbox" checked={form.advancedNodeTypeOverride} onChange={e => setForm({ ...form, advancedNodeTypeOverride: e.target.checked, nodeType: e.target.checked ? form.nodeType : "cloud" })} />
                      Advanced: allow hybrid node type
                    </label>
                    {form.advancedNodeTypeOverride && (
                      <select value={form.nodeType} onChange={e => setForm({ ...form, nodeType: e.target.value as NodeType })} className={`${selectCls} mt-2 w-full`}>
                        <option value="cloud">Cloud</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    )}
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">NODE URL (OPTIONAL)</label>
                  <input type="url" value={form.nodeUrl} onChange={e => setForm({ ...form, nodeUrl: e.target.value })} className={inputCls} placeholder="https://node.example.com" />
                </div>
                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">INFRASTRUCTURE</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={form.infrastructure.kind}
                      onChange={e => { const k = form.deploymentProfile === "cloud_shipyard" ? "existing_k8s" : e.target.value as InfrastructureKind; setForm({ ...form, infrastructure: { ...form.infrastructure, kind: k, kubeContext: kubeContextForKind(k) } }) }}
                      disabled={form.deploymentProfile === "cloud_shipyard"}
                      className={`${selectCls} w-full`}
                    >
                      {form.deploymentProfile === "cloud_shipyard"
                        ? <option value="existing_k8s">{infrastructureKindLabels.existing_k8s}</option>
                        : <><option value="kind">{infrastructureKindLabels.kind}</option><option value="minikube">{infrastructureKindLabels.minikube}</option></>}
                    </select>
                    <input type="text" value={form.infrastructure.kubeContext} onChange={e => setForm({ ...form, infrastructure: { ...form.infrastructure, kubeContext: e.target.value } })} className={inputCls} placeholder="kube context" />
                    <input type="text" value={form.infrastructure.namespace} onChange={e => setForm({ ...form, infrastructure: { ...form.infrastructure, namespace: e.target.value } })} className={inputCls} placeholder="namespace" />
                    <input type="text" value={form.infrastructure.terraformWorkspace} onChange={e => setForm({ ...form, infrastructure: { ...form.infrastructure, terraformWorkspace: e.target.value } })} className={inputCls} placeholder="terraform workspace" />
                    <input type="text" value={form.infrastructure.terraformEnvDir} onChange={e => setForm({ ...form, infrastructure: { ...form.infrastructure, terraformEnvDir: e.target.value } })} className={inputCls} placeholder="terraform env directory" />
                    <input type="text" value={form.infrastructure.ansibleInventory} onChange={e => setForm({ ...form, infrastructure: { ...form.infrastructure, ansibleInventory: e.target.value } })} className={inputCls} placeholder="ansible inventory" />
                    <input type="text" value={form.infrastructure.ansiblePlaybook} onChange={e => setForm({ ...form, infrastructure: { ...form.infrastructure, ansiblePlaybook: e.target.value } })} className={inputCls} placeholder="ansible playbook" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="readout mb-1.5 block text-slate-500 dark:text-gray-400">DESCRIPTION</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className={inputCls} placeholder="Ship description..." />
                </div>
              </div>

              <div className="bridge-divider" />

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="glass rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-gray-300 hover:brightness-105 transition-all">
                  Cancel
                </button>
                <button
                  type="submit" disabled={isCreating}
                  className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 dark:from-purple-600 dark:to-pink-600 px-5 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isCreating ? "Launching..." : "Launch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------
function DetailPanel({
  ship, tab, onTab, onStatus, onDelete, onCopy, copied, kindCluster, runtime,
}: {
  ship: DeploymentWithInfra
  tab: DetailTab
  onTab: (t: DetailTab) => void
  onStatus: (id: string, s: Deployment["status"]) => void
  onDelete: (id: string) => void
  onCopy: (id: string) => void
  copied: boolean
  kindCluster?: RuntimeSnapshot["kind"]["clusters"][number]
  runtime: RuntimeSnapshot | null
}) {
  const st = statusCfg[ship.status]
  const nt = nodeTypeCfg[ship.nodeType]
  const StatusIcon = st.icon
  const NodeIcon = nt.icon

  const missingCtx = ship.infrastructure?.kind === "kind" && !!ship.infrastructure.kubeContext && !!runtime && !kindCluster
  const stoppedCluster = !!kindCluster && kindCluster.totalNodeCount > 0 && kindCluster.runningNodeCount === 0

  return (
    <div className="glass-elevated animate-slide-in overflow-hidden rounded-2xl">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="relative border-b border-slate-200/60 dark:border-white/10 px-6 py-5">
        {/* Subtle gradient accent along the top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 rounded-xl border p-2.5 ${nt.bg} ${nt.border}`}>
                <NodeIcon className={`h-5 w-5 ${nt.color}`} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-white" style={{ fontFamily: "var(--font-display)" }}>
                  {ship.name}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-tactical text-xs text-slate-500 dark:text-gray-500">{ship.nodeId}</span>
                  {ship.subagent && (
                    <>
                      <span className="text-slate-300 dark:text-white/15">&middot;</span>
                      <span className="flex items-center gap-1 text-xs text-violet-600 dark:text-purple-400/80">
                        <Bot className="h-3 w-3" />
                        {ship.subagent.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${st.bg} ${st.border}`}>
            <StatusIcon className={`h-3.5 w-3.5 ${st.color} ${st.pulse ? "status-pulse" : ""}`} />
            <span className={`readout ${st.color}`}>{st.label}</span>
          </div>
        </div>

        {/* Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {[
            { text: nt.label, cls: `${nt.bg} ${nt.border} ${nt.color}` },
            { text: deploymentProfileLabels[ship.deploymentProfile], cls: "bg-slate-100/60 dark:bg-white/[0.04] border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-gray-400" },
            { text: provisioningModeLabels[ship.provisioningMode], cls: "bg-slate-100/60 dark:bg-white/[0.04] border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-gray-400" },
            ...(ship.infrastructure ? [{ text: infrastructureKindLabels[ship.infrastructure.kind], cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300" }] : []),
            ...(ship.healthStatus ? [{ text: ship.healthStatus, cls: ship.healthStatus === "healthy" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-green-300" : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-red-300" }] : []),
            ...(ship.infrastructure?.kind === "kind" && kindCluster && kindCluster.runningNodeCount > 0 ? [{ text: `kind ready (${kindCluster.runningNodeCount}/${kindCluster.totalNodeCount})`, cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-green-300" }] : []),
            ...(stoppedCluster ? [{ text: "kind stopped", cls: "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-yellow-200" }] : []),
            ...(missingCtx ? [{ text: "kind context missing", cls: "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-red-200" }] : []),
          ].map((pill, i) => (
            <span key={i} className={`rounded-full border px-2.5 py-0.5 readout ${pill.cls}`}>{pill.text}</span>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {ship.status === "active" ? (
            <button onClick={() => onStatus(ship.id, "inactive")} className="glass flex items-center gap-1.5 rounded-lg border-orange-500/20 px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-300 hover:brightness-105 transition-all">
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          ) : (
            <button onClick={() => onStatus(ship.id, "active")} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-green-600 px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 transition-all active:scale-[0.97]">
              <Play className="h-3.5 w-3.5" /> Start
            </button>
          )}
          <button onClick={() => onCopy(ship.nodeId)} className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-gray-300 hover:brightness-105 transition-all">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy ID"}
          </button>
          {ship.nodeUrl && (
            <a href={ship.nodeUrl} target="_blank" rel="noopener noreferrer" className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-sky-600 dark:text-blue-300 hover:brightness-105 transition-all">
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </a>
          )}
          <button onClick={() => onDelete(ship.id)} className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-red-300 hover:brightness-105 transition-all">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-transparent">
        {([
          { key: "overview" as const, icon: Info, label: "Overview" },
          { key: "quartermaster" as const, icon: MessageSquare, label: "Quartermaster" },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => onTab(t.key)}
            className={`relative flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors ${
              tab === t.key
                ? "text-cyan-700 dark:text-cyan-300"
                : "text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] bg-gradient-to-r from-cyan-500/0 via-cyan-500 to-cyan-500/0" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────── */}
      <div className="p-6">
        {tab === "overview" ? (
          <div className="animate-slide-in space-y-5">
            {ship.description && (
              <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">{ship.description}</p>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "PROFILE", value: ship.deploymentProfile === "local_starship_build" ? "Local" : "Cloud" },
                { label: "UPTIME", value: ship.deployedAt ? formatUptime(new Date(ship.deployedAt)) : "N/A" },
                { label: "CONTEXT", value: ship.infrastructure?.kubeContext || "N/A" },
                { label: "NAMESPACE", value: ship.infrastructure?.namespace || "N/A" },
              ].map(m => (
                <div key={m.label} className="glass rounded-lg px-3 py-2.5">
                  <p className="readout text-slate-400 dark:text-gray-600">{m.label}</p>
                  <p className="mt-1 truncate text-sm font-semibold font-tactical tabular-nums text-slate-800 dark:text-white">{m.value}</p>
                </div>
              ))}
            </div>

            <div className="bridge-divider" />

            {/* Full NodeInfoCard */}
            <NodeInfoCard
              nodeType={ship.nodeType} nodeId={ship.nodeId}
              nodeUrl={ship.nodeUrl} healthStatus={ship.healthStatus}
              deployedAt={ship.deployedAt}
              deploymentProfile={ship.deploymentProfile}
              provisioningMode={ship.provisioningMode}
              infrastructure={ship.infrastructure}
              showCapabilities showConfig showSecurity showUseCases
              dataForwarding={{
                enabled: ship.nodeType !== "local" || !!ship.metadata?.forwardingEnabled,
                targetNode: ship.metadata?.forwardTarget,
                sourceNodes: ship.metadata?.sourceNodeCount,
              }}
              metrics={ship.status === "active" ? {
                uptime: ship.deployedAt ? formatUptime(new Date(ship.deployedAt)) : undefined,
                activeSessions: typeof ship.metadata?.activeSessions === "number" ? ship.metadata.activeSessions : undefined,
              } : undefined}
            />

            {ship.subagent && (
              <>
                <div className="bridge-divider" />
                <div className="glass rounded-lg px-4 py-3 lcars-accent-left" style={{ "--lcars-accent": "rgba(139, 92, 246, 0.6)" } as React.CSSProperties}>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-violet-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold text-violet-700 dark:text-purple-300">{ship.subagent.name}</span>
                  </div>
                  {ship.subagent.description && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-500">{ship.subagent.description}</p>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="animate-slide-in">
            <ShipQuartermasterPanel shipDeploymentId={ship.id} shipName={ship.name} />
          </div>
        )}
      </div>
    </div>
  )
}
