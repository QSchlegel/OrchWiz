"use client"

import { useCallback, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Cpu,
  Link2,
  Rocket,
  Ship,
  X,
} from "lucide-react"
import {
  COMPONENT_TEMPLATES,
  type ComponentTemplate,
} from "@/lib/uss-k8s/builder-types"
import {
  GROUP_ORDER,
  SUBSYSTEM_GROUP_CONFIG,
  USS_K8S_COMPONENTS,
  USS_K8S_EDGES,
  type EdgeType,
  type SubsystemEdge,
  type TopologyComponent,
} from "@/lib/uss-k8s/topology"

interface ShipBuilderWizardProps {
  onComplete: (data: {
    shipName: string
    shipDescription: string
    components: TopologyComponent[]
    edges: SubsystemEdge[]
  }) => void
  onCancel: () => void
}

type WizardStep = "name" | "crew" | "subsystems" | "connections" | "review"

const STEPS: { key: WizardStep; title: string; description: string; icon: React.ElementType }[] = [
  { key: "name", title: "Name Your Ship", description: "Choose a designation and mission brief", icon: Ship },
  { key: "crew", title: "Assemble Crew", description: "Select bridge crew agents", icon: Bot },
  { key: "subsystems", title: "Choose Subsystems", description: "Pick runtime and infrastructure", icon: Cpu },
  { key: "connections", title: "Wire It Up", description: "Define data flows and control channels", icon: Link2 },
  { key: "review", title: "Review & Launch", description: "Verify your ship configuration", icon: Rocket },
]

const defaultCrewIds = new Set(["xo", "ops", "eng", "sec", "med", "cou"])
const defaultSubsystemIds = new Set(["gw", "cron", "state", "lf", "ch", "loki", "prom", "graf", "evt", "app", "nodes"])

export function ShipBuilderWizard({ onComplete, onCancel }: ShipBuilderWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [shipName, setShipName] = useState("")
  const [shipDescription, setShipDescription] = useState("")
  const [useTemplate, setUseTemplate] = useState(true)
  const [selectedCrewIds, setSelectedCrewIds] = useState<Set<string>>(new Set(defaultCrewIds))
  const [selectedSubsystemIds, setSelectedSubsystemIds] = useState<Set<string>>(new Set(defaultSubsystemIds))
  const [edges, setEdges] = useState<SubsystemEdge[]>([...USS_K8S_EDGES])

  const step = STEPS[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === STEPS.length - 1

  const canAdvance = () => {
    if (step.key === "name") return shipName.trim().length > 0
    if (step.key === "crew") return selectedCrewIds.size > 0
    return true
  }

  const allSelectedIds = new Set([...selectedCrewIds, ...selectedSubsystemIds, "qs", "ui"])

  const selectedComponents = USS_K8S_COMPONENTS.filter((c) => allSelectedIds.has(c.id))
  const selectedEdges = edges.filter(
    (e) => allSelectedIds.has(e.source) && allSelectedIds.has(e.target),
  )

  const toggleCrew = useCallback((id: string) => {
    setSelectedCrewIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSubsystem = useCallback((id: string) => {
    setSelectedSubsystemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleComplete = () => {
    onComplete({
      shipName: shipName.trim(),
      shipDescription: shipDescription.trim(),
      components: selectedComponents,
      edges: selectedEdges,
    })
  }

  const crewComponents = USS_K8S_COMPONENTS.filter((c) => c.group === "bridge")
  const subsystemGroups = GROUP_ORDER
    .filter((g) => g !== "bridge" && g !== "users")
    .map((g) => ({
      group: g,
      config: SUBSYSTEM_GROUP_CONFIG[g],
      components: USS_K8S_COMPONENTS.filter((c) => c.group === g),
    }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 flex h-[min(680px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-300/75 bg-white/98 shadow-[0_24px_64px_rgba(15,23,42,0.25)] dark:border-white/12 dark:bg-slate-950/95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4 dark:border-white/8">
          <div>
            <p className="readout text-cyan-700 dark:text-cyan-300">Ship Builder Wizard</p>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {step.title}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-600 dark:text-slate-400">
              {step.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1 px-6 py-3">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                i <= currentStep
                  ? "bg-cyan-500 dark:bg-cyan-400"
                  : "bg-slate-200 dark:bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step.key === "name" && (
            <div className="space-y-4">
              <label className="flex flex-col gap-1.5 text-[12px] text-slate-700 dark:text-slate-300">
                <span className="readout">Ship Designation</span>
                <input
                  type="text"
                  value={shipName}
                  onChange={(e) => setShipName(e.target.value)}
                  placeholder="e.g., USS-Enterprise"
                  autoFocus
                  className="rounded-lg border border-slate-300/70 bg-white px-3 py-2.5 text-[14px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-[12px] text-slate-700 dark:text-slate-300">
                <span className="readout">Mission Brief (optional)</span>
                <textarea
                  value={shipDescription}
                  onChange={(e) => setShipDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe the ship's purpose and mission parameters..."
                  className="resize-y rounded-lg border border-slate-300/70 bg-white px-3 py-2.5 text-[13px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100"
                />
              </label>

              <div>
                <span className="readout text-slate-700 dark:text-slate-300">Starting Template</span>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUseTemplate(true)}
                    className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                      useTemplate
                        ? "border-cyan-500/45 bg-cyan-500/8 dark:border-cyan-300/40"
                        : "border-slate-300/60 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/25"
                    }`}
                  >
                    <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                      USS-K8S Default
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                      Start with the full topology
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseTemplate(false)
                      setSelectedCrewIds(new Set())
                      setSelectedSubsystemIds(new Set())
                      setEdges([])
                    }}
                    className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                      !useTemplate
                        ? "border-cyan-500/45 bg-cyan-500/8 dark:border-cyan-300/40"
                        : "border-slate-300/60 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/25"
                    }`}
                  >
                    <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">
                      Blank Ship
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                      Build from scratch
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {step.key === "crew" && (
            <div className="space-y-2.5">
              {crewComponents.map((agent) => {
                const isSelected = selectedCrewIds.has(agent.id)
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleCrew(agent.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? "border-cyan-500/45 bg-cyan-500/8 dark:border-cyan-300/40 dark:bg-cyan-500/[0.06]"
                        : "border-slate-300/60 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/25"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? "border-cyan-500 bg-cyan-500 text-white"
                          : "border-slate-300 dark:border-white/25"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-mono)] text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                        {agent.label}
                      </p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        {agent.sublabel}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {step.key === "subsystems" && (
            <div className="space-y-4">
              {subsystemGroups.map(({ group, config, components }) => (
                <div key={group}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-sm ${config.bgColor} ${config.borderColor} border`} />
                    <span className="readout text-slate-700 dark:text-slate-300">{config.label}</span>
                  </div>
                  <div className="space-y-1.5">
                    {components.map((comp) => {
                      const isSelected = selectedSubsystemIds.has(comp.id)
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => toggleSubsystem(comp.id)}
                          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                            isSelected
                              ? `${config.borderColor} ${config.bgColor}`
                              : "border-slate-300/60 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/25"
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              isSelected
                                ? "border-current bg-current text-white"
                                : "border-slate-300 dark:border-white/25"
                            }`}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12px] font-medium text-slate-900 dark:text-slate-100">
                              {comp.label}
                            </p>
                            {comp.sublabel && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                {comp.sublabel}
                              </p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {step.key === "connections" && (
            <div className="space-y-3">
              <p className="text-[12px] text-slate-600 dark:text-slate-400">
                {selectedEdges.length} connections will be created between your {selectedComponents.length} components.
                You can modify connections after the wizard in build mode.
              </p>
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {selectedEdges.map((edge) => {
                  const src = selectedComponents.find((c) => c.id === edge.source)
                  const tgt = selectedComponents.find((c) => c.id === edge.target)
                  return (
                    <div
                      key={`${edge.source}-${edge.target}`}
                      className="flex items-center gap-2 rounded-md border border-slate-300/60 px-2.5 py-1.5 text-[11px] dark:border-white/10"
                    >
                      <span className="truncate font-[family-name:var(--font-mono)] text-slate-800 dark:text-slate-200">
                        {src?.label || edge.source}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="truncate font-[family-name:var(--font-mono)] text-slate-800 dark:text-slate-200">
                        {tgt?.label || edge.target}
                      </span>
                      <span className="readout ml-auto shrink-0 text-slate-500">{edge.edgeType}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {step.key === "review" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-300/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="readout text-slate-600 dark:text-slate-400">Ship Designation</p>
                <p className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-slate-50">
                  {shipName}
                </p>
                {shipDescription && (
                  <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-400">
                    {shipDescription}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[20px] font-bold text-slate-900 dark:text-slate-50">
                    {selectedComponents.length}
                  </p>
                  <p className="readout text-slate-600 dark:text-slate-400">Components</p>
                </div>
                <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[20px] font-bold text-slate-900 dark:text-slate-50">
                    {selectedCrewIds.size}
                  </p>
                  <p className="readout text-slate-600 dark:text-slate-400">Crew</p>
                </div>
                <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 text-center dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[20px] font-bold text-slate-900 dark:text-slate-50">
                    {selectedEdges.length}
                  </p>
                  <p className="readout text-slate-600 dark:text-slate-400">Connections</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 px-6 py-4 dark:border-white/8">
          <button
            type="button"
            onClick={isFirst ? onCancel : () => setCurrentStep((s) => s - 1)}
            className="flex items-center gap-1.5 readout rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
          >
            <ArrowLeft className="h-3 w-3" />
            {isFirst ? "Cancel" : "Back"}
          </button>

          <span className="readout text-slate-500 dark:text-slate-500">
            {currentStep + 1} / {STEPS.length}
          </span>

          <button
            type="button"
            onClick={isLast ? handleComplete : () => setCurrentStep((s) => s + 1)}
            disabled={!canAdvance()}
            className={`flex items-center gap-1.5 readout rounded-md border px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
              canAdvance()
                ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 hover:bg-cyan-500/20 dark:border-cyan-300/45 dark:text-cyan-100"
                : "border-slate-300/40 bg-slate-100/50 text-slate-400 dark:border-white/8 dark:bg-white/[0.02] dark:text-slate-600"
            }`}
          >
            {isLast ? "Launch" : "Next"}
            {isLast ? <Rocket className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  )
}
