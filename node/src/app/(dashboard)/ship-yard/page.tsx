"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type ElementType } from "react"
import {
  CheckCircle2,
  Cloud,
  Compass,
  Loader2,
  Rocket,
  Server,
  Settings2,
  Ship,
  Shield,
  Users,
} from "lucide-react"
import {
  defaultInfrastructureConfig,
  deriveNodeTypeFromProfile,
  type DeploymentProfile,
  type InfrastructureConfig,
  type NodeType,
  type ProvisioningMode,
} from "@/lib/deployment/profile"
import {
  BRIDGE_CREW_ROLE_ORDER,
  listBridgeCrewTemplates,
  type BridgeCrewRole,
} from "@/lib/shipyard/bridge-crew"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { ShipQuartermasterPanel } from "@/components/quartermaster/ShipQuartermasterPanel"

type InfrastructureKind = InfrastructureConfig["kind"]

type WizardStepId = "mission" | "environment" | "crew" | "review"

interface CrewOverrideInput {
  name: string
  description: string
  content: string
}

interface LaunchFormState {
  name: string
  description: string
  nodeId: string
  nodeUrl: string
  saneBootstrap: boolean
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  advancedNodeTypeOverride: boolean
  nodeType: NodeType
  infrastructure: InfrastructureConfig
  selectedCrewRoles: BridgeCrewRole[]
  crewOverrides: Record<BridgeCrewRole, CrewOverrideInput>
}

interface ShipDeployment {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  updatedAt: string
}

interface BridgeCrewRecord {
  id: string
  deploymentId: string
  role: BridgeCrewRole
  callsign: string
  name: string
  description: string | null
  content: string
  status: "active" | "inactive"
}

interface LaunchMessage {
  type: "success" | "error" | "info"
  text: string
  suggestedCommands?: string[]
}

interface BridgeConnectionSummary {
  total: number
  enabled: number
  autoRelay: number
  providers: {
    telegram: { total: number; enabled: number }
    discord: { total: number; enabled: number }
    whatsapp: { total: number; enabled: number }
  }
  lastDeliveryAt: string | null
  lastDeliveryStatus: "pending" | "processing" | "completed" | "failed" | null
}

const steps: { id: WizardStepId; title: string; subtitle: string; icon: ElementType }[] = [
  { id: "mission", title: "Mission", subtitle: "Ship identity and target", icon: Ship },
  { id: "environment", title: "Environment", subtitle: "Deployment profile setup", icon: Settings2 },
  { id: "crew", title: "Bridge Crew", subtitle: "Bootstrap OpenClaw command", icon: Users },
  { id: "review", title: "Launch", subtitle: "Review and deploy", icon: Rocket },
]

const deploymentProfileLabels: Record<DeploymentProfile, string> = {
  local_starship_build: "Local Starship Build",
  cloud_shipyard: "Cloud Shipyard",
}

const provisioningModeLabels: Record<ProvisioningMode, string> = {
  terraform_ansible: "Terraform + Ansible",
  terraform_only: "Terraform only",
  ansible_only: "Ansible only",
}

const crewRoleLabels: Record<BridgeCrewRole, string> = {
  xo: "Executive Officer",
  ops: "Operations",
  eng: "Engineering",
  sec: "Security",
  med: "Medical",
  cou: "Communications",
}

const statusClasses: Record<ShipDeployment["status"], string> = {
  pending: "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  deploying: "border-cyan-400/45 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
  active: "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  inactive: "border-slate-400/45 bg-slate-500/10 text-slate-700 dark:text-slate-200",
  failed: "border-rose-400/45 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  updating: "border-orange-400/45 bg-orange-500/10 text-orange-700 dark:text-orange-200",
}

function kubeContextForKind(kind: InfrastructureKind): string {
  if (kind === "kind") return "kind-orchwiz"
  if (kind === "minikube") return "minikube"
  return "existing-cluster"
}

function createCrewOverrides(): Record<BridgeCrewRole, CrewOverrideInput> {
  const templates = listBridgeCrewTemplates()
  const result = {} as Record<BridgeCrewRole, CrewOverrideInput>
  for (const template of templates) {
    result[template.role] = {
      name: template.name,
      description: template.description,
      content: template.content,
    }
  }
  return result
}

function createInitialFormState(): LaunchFormState {
  const deploymentProfile: DeploymentProfile = "local_starship_build"
  return {
    name: "",
    description: "",
    nodeId: "",
    nodeUrl: "",
    saneBootstrap: true,
    deploymentProfile,
    provisioningMode: "terraform_ansible",
    advancedNodeTypeOverride: false,
    nodeType: "local",
    infrastructure: defaultInfrastructureConfig(deploymentProfile),
    selectedCrewRoles: [...BRIDGE_CREW_ROLE_ORDER],
    crewOverrides: createCrewOverrides(),
  }
}

export default function ShipYardPage() {
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<LaunchFormState>(() => createInitialFormState())
  const [showAdvancedInfrastructure, setShowAdvancedInfrastructure] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [message, setMessage] = useState<LaunchMessage | null>(null)
  const [ships, setShips] = useState<ShipDeployment[]>([])
  const [isLoadingShips, setIsLoadingShips] = useState(true)
  const [bridgeCrew, setBridgeCrew] = useState<BridgeCrewRecord[]>([])
  const [isLoadingCrew, setIsLoadingCrew] = useState(false)
  const [isLoadingConnectionSummary, setIsLoadingConnectionSummary] = useState(false)
  const [connectionSummary, setConnectionSummary] = useState<BridgeConnectionSummary | null>(null)
  const [crewDrafts, setCrewDrafts] = useState<Record<string, CrewOverrideInput & { status: "active" | "inactive" }>>(
    {},
  )
  const [savingCrewId, setSavingCrewId] = useState<string | null>(null)

  const currentStep = steps[stepIndex]

  const derivedNodeType = useMemo(
    () =>
      deriveNodeTypeFromProfile(
        form.deploymentProfile,
        form.nodeType,
        form.advancedNodeTypeOverride,
      ),
    [form.advancedNodeTypeOverride, form.deploymentProfile, form.nodeType],
  )

  const selectedShip = useMemo(
    () => ships.find((ship) => ship.id === selectedShipDeploymentId) || null,
    [selectedShipDeploymentId, ships],
  )

  const fetchShips = useCallback(async () => {
    setIsLoadingShips(true)
    try {
      const response = await fetch("/api/ships")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      const parsed = Array.isArray(payload) ? (payload as ShipDeployment[]) : []
      setShips(parsed)

      if (parsed.length === 0) {
        setSelectedShipDeploymentId(null)
      } else if (!selectedShipDeploymentId || !parsed.some((ship) => ship.id === selectedShipDeploymentId)) {
        setSelectedShipDeploymentId(parsed[0].id)
      }
    } catch (error) {
      console.error("Failed to load ship deployments:", error)
      setMessage({ type: "error", text: "Unable to load Ship Yard deployments" })
    } finally {
      setIsLoadingShips(false)
    }
  }, [selectedShipDeploymentId, setSelectedShipDeploymentId])

  const fetchBridgeCrew = useCallback(async () => {
    if (!selectedShipDeploymentId) {
      setBridgeCrew([])
      setCrewDrafts({})
      return
    }

    setIsLoadingCrew(true)
    try {
      const response = await fetch(`/api/bridge-crew?deploymentId=${selectedShipDeploymentId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      const parsed = Array.isArray(payload) ? (payload as BridgeCrewRecord[]) : []
      setBridgeCrew(parsed)

      const nextDrafts: Record<string, CrewOverrideInput & { status: "active" | "inactive" }> = {}
      for (const record of parsed) {
        nextDrafts[record.id] = {
          name: record.name,
          description: record.description || "",
          content: record.content,
          status: record.status,
        }
      }
      setCrewDrafts(nextDrafts)
    } catch (error) {
      console.error("Failed to load bridge crew:", error)
      setMessage({ type: "error", text: "Unable to load bridge crew records" })
    } finally {
      setIsLoadingCrew(false)
    }
  }, [selectedShipDeploymentId])

  const fetchConnectionSummary = useCallback(async () => {
    if (!selectedShipDeploymentId) {
      setConnectionSummary(null)
      return
    }

    setIsLoadingConnectionSummary(true)
    try {
      const response = await fetch(
        `/api/bridge/connections?deploymentId=${selectedShipDeploymentId}&deliveriesTake=6`,
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      setConnectionSummary((payload?.summary || null) as BridgeConnectionSummary | null)
    } catch (error) {
      console.error("Failed to load bridge connection summary:", error)
      setConnectionSummary(null)
    } finally {
      setIsLoadingConnectionSummary(false)
    }
  }, [selectedShipDeploymentId])

  useEffect(() => {
    fetchShips()
  }, [fetchShips])

  useEffect(() => {
    fetchBridgeCrew()
  }, [fetchBridgeCrew])

  useEffect(() => {
    fetchConnectionSummary()
  }, [fetchConnectionSummary])

  const canAdvance = useMemo(() => {
    if (currentStep.id === "mission") {
      return form.name.trim().length > 0 && form.nodeId.trim().length > 0
    }
    if (currentStep.id === "crew") {
      return form.selectedCrewRoles.length > 0
    }
    return true
  }, [currentStep.id, form.name, form.nodeId, form.selectedCrewRoles.length])

  const updateCrewOverride = (role: BridgeCrewRole, patch: Partial<CrewOverrideInput>) => {
    setForm((current) => ({
      ...current,
      crewOverrides: {
        ...current.crewOverrides,
        [role]: {
          ...current.crewOverrides[role],
          ...patch,
        },
      },
    }))
  }

  const toggleCrewRole = (role: BridgeCrewRole) => {
    setForm((current) => {
      const hasRole = current.selectedCrewRoles.includes(role)
      return {
        ...current,
        selectedCrewRoles: hasRole
          ? current.selectedCrewRoles.filter((entry) => entry !== role)
          : [...current.selectedCrewRoles, role],
      }
    })
  }

  const handleLaunch = async () => {
    if (form.selectedCrewRoles.length === 0) {
      setMessage({ type: "error", text: "Select at least one bridge crew role to launch." })
      return
    }

    setIsLaunching(true)
    setMessage(null)
    try {
      const selectedOverrides = Object.fromEntries(
        form.selectedCrewRoles.map((role) => [role, form.crewOverrides[role]]),
      )

      const response = await fetch("/api/ship-yard/launch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          nodeId: form.nodeId,
          nodeUrl: form.nodeUrl || null,
          saneBootstrap: form.deploymentProfile === "local_starship_build" ? form.saneBootstrap : undefined,
          deploymentProfile: form.deploymentProfile,
          provisioningMode: form.provisioningMode,
          advancedNodeTypeOverride: form.advancedNodeTypeOverride,
          nodeType: form.nodeType,
          config: {
            infrastructure: form.infrastructure,
          },
          crewRoles: form.selectedCrewRoles,
          crewOverrides: selectedOverrides,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        const suggestedCommands = Array.isArray(payload?.details?.suggestedCommands)
          ? payload.details.suggestedCommands.filter(
              (command: unknown): command is string =>
                typeof command === "string" && command.trim().length > 0,
            )
          : []

        if (typeof payload?.deployment?.id === "string") {
          setSelectedShipDeploymentId(payload.deployment.id)
        }

        setMessage({
          type: "error",
          text: typeof payload?.error === "string" ? payload.error : "Ship launch failed",
          ...(suggestedCommands.length > 0 ? { suggestedCommands } : {}),
        })
        await fetchShips()
        return
      }

      if (typeof payload?.deployment?.id === "string") {
        setSelectedShipDeploymentId(payload.deployment.id)
      }

      setMessage({ type: "success", text: "Ship launched. Bridge crew bootstrap complete." })
      setStepIndex(0)
      setForm(createInitialFormState())
      await fetchShips()
      await fetchBridgeCrew()
    } catch (error) {
      console.error("Ship launch failed:", error)
      setMessage({ type: "error", text: "Ship launch failed" })
    } finally {
      setIsLaunching(false)
    }
  }

  const saveCrewDraft = async (crewId: string) => {
    const draft = crewDrafts[crewId]
    if (!draft) return

    setSavingCrewId(crewId)
    try {
      const response = await fetch(`/api/bridge-crew/${crewId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          content: draft.content,
          status: draft.status,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({
          type: "error",
          text: typeof payload?.error === "string" ? payload.error : "Failed to save bridge crew update",
        })
        return
      }

      setMessage({ type: "success", text: "Bridge crew profile updated." })
      await fetchBridgeCrew()
    } catch (error) {
      console.error("Bridge crew update failed:", error)
      setMessage({ type: "error", text: "Failed to save bridge crew update" })
    } finally {
      setSavingCrewId(null)
    }
  }

  return (
    <PageLayout
      title="Ship Yard"
      description="Launch ships, bootstrap bridge crew command, and prepare mission-ready fleet operations."
      actions={
        <button
          type="button"
          onClick={fetchShips}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        >
          <Compass className="h-4 w-4" />
          Refresh Fleet
        </button>
      }
    >
      <div className="space-y-4">
        {message && (
          <InlineNotice variant={message.type}>
            <div className="space-y-2">
              <p>{message.text}</p>
              {message.suggestedCommands && message.suggestedCommands.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs">
                  {message.suggestedCommands.map((command) => (
                    <li key={command}>
                      <code>{command}</code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </InlineNotice>
        )}

        <SurfaceCard className="border-cyan-400/35 bg-gradient-to-br from-cyan-50/70 via-white to-indigo-50/70 dark:from-cyan-500/10 dark:via-white/[0.03] dark:to-indigo-500/10">
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isComplete = index < stepIndex
              const isActive = index === stepIndex
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                    isActive
                      ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:text-cyan-200"
                      : isComplete
                        ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                        : "border-slate-300/70 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {step.title}
                </button>
              )
            })}
          </div>

          <div className="mt-4 rounded-xl border border-slate-300/70 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="readout text-cyan-700 dark:text-cyan-300">{currentStep.subtitle}</p>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{currentStep.title}</h2>
              </div>
              <span className="readout text-slate-500 dark:text-slate-400">
                {stepIndex + 1} / {steps.length}
              </span>
            </div>

            {currentStep.id === "mission" && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Ship Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder="USS-OrchWiz-01"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mission Brief</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                    rows={3}
                    placeholder="Primary mission objective for this ship deployment..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node ID</span>
                  <input
                    type="text"
                    value={form.nodeId}
                    onChange={(e) => setForm((current) => ({ ...current, nodeId: e.target.value }))}
                    placeholder="ship-node-001"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node URL (optional)</span>
                  <input
                    type="url"
                    value={form.nodeUrl}
                    onChange={(e) => setForm((current) => ({ ...current, nodeUrl: e.target.value }))}
                    placeholder="https://ship.example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <div className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Target Profile</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          deploymentProfile: "local_starship_build",
                          saneBootstrap: true,
                          nodeType: "local",
                          advancedNodeTypeOverride: false,
                          infrastructure: defaultInfrastructureConfig("local_starship_build"),
                        }))
                      }
                      className={`rounded-lg border p-3 text-left ${
                        form.deploymentProfile === "local_starship_build"
                          ? "border-violet-500/45 bg-violet-500/10"
                          : "border-slate-300/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <Server className="h-4 w-4 text-violet-500" />
                        Local Starship Build
                      </span>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Local kind/minikube launch profile.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          deploymentProfile: "cloud_shipyard",
                          nodeType: current.advancedNodeTypeOverride ? current.nodeType : "cloud",
                          infrastructure: defaultInfrastructureConfig("cloud_shipyard"),
                        }))
                      }
                      className={`rounded-lg border p-3 text-left ${
                        form.deploymentProfile === "cloud_shipyard"
                          ? "border-cyan-500/45 bg-cyan-500/10"
                          : "border-slate-300/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <Cloud className="h-4 w-4 text-cyan-500" />
                        Cloud Shipyard
                      </span>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Existing Kubernetes cloud target.</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentStep.id === "environment" && (
              <div className="space-y-3">
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Provisioning Mode</span>
                  <select
                    value={form.provisioningMode}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        provisioningMode: e.target.value as ProvisioningMode,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  >
                    <option value="terraform_ansible">Terraform + Ansible</option>
                    <option value="terraform_only" disabled>Terraform only (coming soon)</option>
                    <option value="ansible_only" disabled>Ansible only (coming soon)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {provisioningModeLabels[form.provisioningMode]}
                  </p>
                </label>

                {form.deploymentProfile === "cloud_shipyard" && (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.advancedNodeTypeOverride}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          advancedNodeTypeOverride: e.target.checked,
                          nodeType: e.target.checked ? current.nodeType : "cloud",
                        }))
                      }
                    />
                    Advanced node type override (allow hybrid)
                  </label>
                )}

                {form.deploymentProfile === "cloud_shipyard" && form.advancedNodeTypeOverride && (
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node Type Override</span>
                    <select
                      value={form.nodeType}
                      onChange={(e) => setForm((current) => ({ ...current, nodeType: e.target.value as NodeType }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    >
                      <option value="cloud">Cloud</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>
                )}

                {form.deploymentProfile === "local_starship_build" && (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.saneBootstrap}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          saneBootstrap: e.target.checked,
                        }))
                      }
                    />
                    Sane Bootstrap (assisted checks/install guidance; no cluster auto-create)
                  </label>
                )}

                <div className="rounded-lg border border-slate-300/70 bg-slate-100/70 px-3 py-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  <span className="readout text-slate-500 dark:text-slate-400">Derived node type</span>
                  <div className="mt-1">
                    {deploymentProfileLabels[form.deploymentProfile]} {"->"} {derivedNodeType.toUpperCase()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedInfrastructure((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  <Shield className="h-3.5 w-3.5" />
                  {showAdvancedInfrastructure ? "Hide advanced infrastructure" : "Show advanced infrastructure"}
                </button>

                {showAdvancedInfrastructure && (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Infrastructure Kind</span>
                      <select
                        value={form.infrastructure.kind}
                        disabled={form.deploymentProfile === "cloud_shipyard"}
                        onChange={(e) => {
                          const selectedKind = e.target.value as InfrastructureKind
                          const nextKind =
                            form.deploymentProfile === "cloud_shipyard" ? "existing_k8s" : selectedKind
                          setForm((current) => ({
                            ...current,
                            infrastructure: {
                              ...current.infrastructure,
                              kind: nextKind,
                              kubeContext: kubeContextForKind(nextKind),
                            },
                          }))
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                      >
                        {form.deploymentProfile === "cloud_shipyard" ? (
                          <option value="existing_k8s">Existing Kubernetes</option>
                        ) : (
                          <>
                            <option value="kind">KIND</option>
                            <option value="minikube">Minikube</option>
                          </>
                        )}
                      </select>
                    </label>
                    {(
                      [
                        ["kubeContext", "Kube Context"],
                        ["namespace", "Namespace"],
                        ["terraformWorkspace", "Terraform Workspace"],
                        ["terraformEnvDir", "Terraform Env Dir"],
                        ["ansibleInventory", "Ansible Inventory"],
                        ["ansiblePlaybook", "Ansible Playbook"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
                        <input
                          type="text"
                          value={form.infrastructure[key]}
                          onChange={(e) =>
                            setForm((current) => ({
                              ...current,
                              infrastructure: {
                                ...current.infrastructure,
                                [key]: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {currentStep.id === "crew" && (
              <div className="space-y-3">
                {BRIDGE_CREW_ROLE_ORDER.map((role) => {
                  const selected = form.selectedCrewRoles.includes(role)
                  const template = form.crewOverrides[role]
                  return (
                    <div
                      key={role}
                      className={`rounded-lg border p-3 ${
                        selected
                          ? "border-cyan-500/40 bg-cyan-500/8"
                          : "border-slate-300/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
                      }`}
                    >
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleCrewRole(role)}
                        />
                        <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {role.toUpperCase()} • {crewRoleLabels[role]}
                        </span>
                      </label>

                      {selected && (
                        <div className="mt-3 grid grid-cols-1 gap-2">
                          <input
                            type="text"
                            value={template.name}
                            onChange={(e) => updateCrewOverride(role, { name: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            placeholder="Crew name"
                          />
                          <input
                            type="text"
                            value={template.description}
                            onChange={(e) => updateCrewOverride(role, { description: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            placeholder="Crew description"
                          />
                          <textarea
                            value={template.content}
                            onChange={(e) => updateCrewOverride(role, { content: e.target.value })}
                            rows={3}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            placeholder="Crew runtime prompt content"
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {currentStep.id === "review" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="readout text-slate-500 dark:text-slate-400">Ship</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">{form.name || "Unnamed ship"}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {deploymentProfileLabels[form.deploymentProfile]} • {provisioningModeLabels[form.provisioningMode]}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Node {form.nodeId || "n/a"} • {derivedNodeType.toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Bridge crew roles selected: {form.selectedCrewRoles.length}
                  </p>
                  {form.deploymentProfile === "local_starship_build" && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Sane Bootstrap: {form.saneBootstrap ? "Enabled" : "Disabled"}
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                  Launch will create a ship deployment and bootstrap selected bridge crew agents.
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                disabled={stepIndex === 0}
                className="rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
              >
                Back
              </button>

              {stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
                  disabled={!canAdvance}
                  className="rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-40 dark:border-cyan-300/45 dark:text-cyan-200"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={isLaunching || !canAdvance}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-500/45 bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-40 dark:border-emerald-300/45 dark:text-emerald-200"
                >
                  {isLaunching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                  Launch Ship
                </button>
              )}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Ship Roster</h2>
            {selectedShip && (
              <span className="readout text-slate-500 dark:text-slate-400">
                Active selection: {selectedShip.name}
              </span>
            )}
          </div>

          {isLoadingShips ? (
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ship deployments...
            </div>
          ) : ships.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No ships launched yet"
                description="Run the Ship Yard wizard to create your first ship deployment and bridge crew."
              />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {ships.map((ship) => (
                <button
                  key={ship.id}
                  type="button"
                  onClick={() => setSelectedShipDeploymentId(ship.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    ship.id === selectedShipDeploymentId
                      ? "border-cyan-500/45 bg-cyan-500/10"
                      : "border-slate-300/70 bg-white/70 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ship.name}</p>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClasses[ship.status]}`}>
                      {ship.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {ship.nodeType.toUpperCase()} • {deploymentProfileLabels[ship.deploymentProfile]}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Node: {ship.nodeId}</p>
                </button>
              ))}
            </div>
          )}
        </SurfaceCard>

        {selectedShipDeploymentId && (
          <SurfaceCard>
            <div className="mb-4 rounded-xl border border-slate-300/70 bg-white/75 p-3 dark:border-white/12 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Bridge Connections
                </h2>
                <Link
                  href={`/bridge-connections?shipDeploymentId=${selectedShipDeploymentId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-700 dark:text-cyan-200"
                >
                  Open Connections
                </Link>
              </div>

              {isLoadingConnectionSummary ? (
                <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading connection status...
                </div>
              ) : connectionSummary ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    Total {connectionSummary.total}
                  </span>
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    Enabled {connectionSummary.enabled}
                  </span>
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    Auto Relay {connectionSummary.autoRelay}
                  </span>
                  {connectionSummary.lastDeliveryStatus && (
                    <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                      Last {connectionSummary.lastDeliveryStatus}
                    </span>
                  )}
                  {connectionSummary.lastDeliveryAt && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {new Date(connectionSummary.lastDeliveryAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  No connection data available for this ship yet.
                </p>
              )}
            </div>

            <ShipQuartermasterPanel
              shipDeploymentId={selectedShipDeploymentId}
              shipName={selectedShip?.name || undefined}
              className="mb-4"
            />

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Bridge Crew Editor</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchConnectionSummary}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sync Connections
                </button>
                <button
                  type="button"
                  onClick={fetchBridgeCrew}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sync Crew
                </button>
              </div>
            </div>

            {isLoadingCrew ? (
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading bridge crew...
              </div>
            ) : bridgeCrew.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No bridge crew found"
                  description="This ship has no active bridge crew records."
                />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {bridgeCrew.map((member) => {
                  const draft = crewDrafts[member.id]
                  if (!draft) return null
                  return (
                    <div key={member.id} className="rounded-lg border border-slate-300/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-[family-name:var(--font-mono)] text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {member.callsign} • {crewRoleLabels[member.role]}
                        </p>
                        <select
                          value={draft.status}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: {
                                ...current[member.id],
                                status: e.target.value as "active" | "inactive",
                              },
                            }))
                          }
                          className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-100"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], name: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                        <input
                          type="text"
                          value={draft.description}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], description: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                        <textarea
                          value={draft.content}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], content: e.target.value },
                            }))
                          }
                          rows={3}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </div>

                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => saveCrewDraft(member.id)}
                          disabled={savingCrewId === member.id}
                          className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                        >
                          {savingCrewId === member.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Save Crew Profile
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SurfaceCard>
        )}
      </div>
    </PageLayout>
  )
}
