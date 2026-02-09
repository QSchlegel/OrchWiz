"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  Cpu,
  Layers,
  Server,
} from "lucide-react"
import {
  SUBSYSTEM_GROUP_CONFIG,
  type TopologyComponent,
  type SubsystemEdge,
} from "@/lib/uss-k8s/topology"

interface ComponentDetailPanelProps {
  component: TopologyComponent | null
  components: TopologyComponent[]
  edges: SubsystemEdge[]
  componentIcons: Record<string, React.ElementType>
  onHighlightNode: (id: string) => void
  drilldownConfig?: NodeDrilldownConfig | null
  onDrilldownConfigChange?: (patch: Partial<NodeDrilldownConfig>) => void
}

const edgeTypeIndicators: Record<string, { color: string; dotColor: string }> = {
  control: { color: "text-cyan-300", dotColor: "bg-cyan-400" },
  data: { color: "text-slate-300", dotColor: "bg-slate-400" },
  telemetry: { color: "text-violet-300", dotColor: "bg-violet-400" },
  alert: { color: "text-rose-300", dotColor: "bg-rose-400" },
}

export interface NodeDrilldownConfig {
  runMode: "auto" | "manual"
  targetHealth: "nominal" | "degraded" | "maintenance"
  logLevel: "info" | "debug" | "warn" | "error"
  pollIntervalSec: number
  sampleRate: number
  autoRemediate: boolean
  notes: string
}

export const DEFAULT_NODE_DRILLDOWN_CONFIG: NodeDrilldownConfig = {
  runMode: "auto",
  targetHealth: "nominal",
  logLevel: "info",
  pollIntervalSec: 30,
  sampleRate: 25,
  autoRemediate: true,
  notes: "",
}

export function ComponentDetailPanel({
  component,
  components,
  edges,
  componentIcons,
  onHighlightNode,
  drilldownConfig,
  onDrilldownConfigChange,
}: ComponentDetailPanelProps) {
  const [drilldownTab, setDrilldownTab] = useState<"readout" | "configure">("readout")

  useEffect(() => {
    setDrilldownTab("readout")
  }, [component?.id])

  if (!component) {
    return (
      <div className="mt-6 flex flex-col items-center gap-5 text-slate-600 sm:mt-10 dark:text-slate-400">
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-cyan-500/4 blur-2xl" />
          <div className="relative rounded-xl border border-slate-300/70 bg-white/80 p-6 dark:border-white/12 dark:bg-white/[0.03]">
            <Layers className="h-8 w-8 text-slate-500 dark:text-slate-400" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No component selected</p>
          <p className="mt-1.5 max-w-[220px] text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
            Click a node in the topology or select an agent from the side panels
          </p>
        </div>
      </div>
    )
  }

  const cfg = SUBSYSTEM_GROUP_CONFIG[component.group]
  const Icon = componentIcons[component.id] || Server
  const incomingEdges = edges.filter((e) => e.target === component.id)
  const outgoingEdges = edges.filter((e) => e.source === component.id)
  const config = { ...DEFAULT_NODE_DRILLDOWN_CONFIG, ...(drilldownConfig || {}) }
  const updateConfig = (patch: Partial<NodeDrilldownConfig>) => {
    onDrilldownConfigChange?.(patch)
  }
  const connectedTo = [...incomingEdges.map((edge) => edge.source), ...outgoingEdges.map((edge) => edge.target)]
  const drilldownReadout = {
    componentId: component.id,
    status: component.status || "nominal",
    subsystem: component.group,
    type: component.componentType,
    incomingLinks: incomingEdges.length,
    outgoingLinks: outgoingEdges.length,
    connectedTo: Array.from(new Set(connectedTo)),
    lastInspection: new Date().toISOString(),
  }

  return (
    <div className="mt-3 flex flex-col gap-5 animate-slide-in sm:mt-4">
      {/* Component header */}
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2.5 ${cfg.bgColor} ${cfg.borderColor} border`}>
          <Icon className={`h-5 w-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-50">{component.label}</h3>
            <span className={`shrink-0 readout rounded border px-2 py-0.5 ${cfg.borderColor} ${cfg.color}`}>
              {component.group}
            </span>
          </div>
          {component.sublabel && (
            <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">{component.sublabel}</p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="bridge-divider" />

      {/* Properties grid */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/12 dark:bg-white/[0.04]">
          <div className="mb-1.5 flex items-center gap-1.5 readout text-slate-600 dark:text-slate-300">
            <Activity className="h-3 w-3" /> Subsystem
          </div>
          <p className="text-[13px] text-slate-900 dark:text-slate-100">{cfg.label}</p>
        </div>
        <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/12 dark:bg-white/[0.04]">
          <div className="mb-1.5 flex items-center gap-1.5 readout text-slate-600 dark:text-slate-300">
            <Cpu className="h-3 w-3" /> Type
          </div>
          <p className="text-[13px] capitalize text-slate-900 dark:text-slate-100">{component.componentType}</p>
        </div>
      </div>

      {component.subagentId && (
        <div className="rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-500/12 to-transparent p-3 dark:border-cyan-300/30 dark:from-cyan-500/[0.14]">
          <div className="mb-1.5 flex items-center gap-1.5 readout text-cyan-700 dark:text-cyan-100">
            <Bot className="h-3 w-3" /> Linked Subagent
          </div>
          <p className="text-[13px] text-slate-900 font-[family-name:var(--font-mono)] dark:text-slate-100">{component.subagentName}</p>
          {component.subagentDescription && (
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-700 dark:text-slate-200">{component.subagentDescription}</p>
          )}
        </div>
      )}

      {/* Connections — Incoming */}
      {incomingEdges.length > 0 && (
        <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <h4 className="mb-2 flex items-center gap-2 readout text-slate-700 dark:text-slate-200">
            <ArrowDownLeft className="h-3 w-3 text-emerald-400" />
            Incoming
            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">{incomingEdges.length}</span>
          </h4>
          <div className="space-y-1.5">
            {incomingEdges.map((e) => {
              const other = components.find((c) => c.id === e.source)
              const indicator = edgeTypeIndicators[e.edgeType]
              return (
                <button
                  key={`in-${e.source}-${e.target}`}
                  type="button"
                  onClick={() => onHighlightNode(e.source)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-300/70 bg-white px-3 py-2 text-[12px] hover:border-cyan-500/40 hover:bg-cyan-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:hover:border-cyan-300/40 dark:hover:bg-slate-900/80 dark:focus-visible:ring-cyan-400/60"
                >
                  <span className="truncate font-[family-name:var(--font-mono)] text-slate-800 dark:text-slate-100">
                    {other?.label || e.source}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {e.label && <span className="hidden text-slate-500 sm:inline dark:text-slate-300">{e.label}</span>}
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${indicator?.dotColor || "bg-slate-400"}`} />
                      <span className={`readout ${indicator?.color || "text-slate-400"}`}>
                        {e.edgeType}
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Connections — Outgoing */}
      {outgoingEdges.length > 0 && (
        <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <h4 className="mb-2 flex items-center gap-2 readout text-slate-700 dark:text-slate-200">
            <ArrowUpRight className="h-3 w-3 text-amber-400" />
            Outgoing
            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">{outgoingEdges.length}</span>
          </h4>
          <div className="space-y-1.5">
            {outgoingEdges.map((e) => {
              const other = components.find((c) => c.id === e.target)
              const indicator = edgeTypeIndicators[e.edgeType]
              return (
                <button
                  key={`out-${e.source}-${e.target}`}
                  type="button"
                  onClick={() => onHighlightNode(e.target)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-300/70 bg-white px-3 py-2 text-[12px] hover:border-cyan-500/40 hover:bg-cyan-50/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:hover:border-cyan-300/40 dark:hover:bg-slate-900/80 dark:focus-visible:ring-cyan-400/60"
                >
                  <span className="truncate font-[family-name:var(--font-mono)] text-slate-800 dark:text-slate-100">
                    {other?.label || e.target}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {e.label && <span className="hidden text-slate-500 sm:inline dark:text-slate-300">{e.label}</span>}
                    <span className="flex items-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${indicator?.dotColor || "bg-slate-400"}`} />
                      <span className={`readout ${indicator?.color || "text-slate-400"}`}>
                        {e.edgeType}
                      </span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
        <p className="readout italic text-slate-600 dark:text-slate-300">No connections defined</p>
      )}

      <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="readout text-slate-700 dark:text-slate-200">Node Drill Down</h4>
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 p-1 dark:border-white/12 dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setDrilldownTab("readout")}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                drilldownTab === "readout"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.1]"
              }`}
            >
              Readout
            </button>
            <button
              type="button"
              onClick={() => setDrilldownTab("configure")}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                drilldownTab === "configure"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.1]"
              }`}
            >
              Configure
            </button>
          </div>
        </div>

        {drilldownTab === "readout" ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 dark:border-white/12 dark:bg-slate-950/70">
                <p className="readout text-slate-600 dark:text-slate-300">Health Target</p>
                <p className="mt-1 text-[12px] capitalize text-slate-900 dark:text-slate-100">{config.targetHealth}</p>
              </div>
              <div className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 dark:border-white/12 dark:bg-slate-950/70">
                <p className="readout text-slate-600 dark:text-slate-300">Run Mode</p>
                <p className="mt-1 text-[12px] uppercase text-slate-900 dark:text-slate-100">{config.runMode}</p>
              </div>
            </div>
            <pre className="max-h-44 overflow-auto rounded-md border border-slate-300/70 bg-white/85 p-2.5 text-[11px] leading-relaxed text-slate-700 dark:border-white/12 dark:bg-slate-950/75 dark:text-slate-200">
{JSON.stringify(drilldownReadout, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="readout">Run Mode</span>
                <select
                  value={config.runMode}
                  onChange={(event) => updateConfig({ runMode: event.target.value as NodeDrilldownConfig["runMode"] })}
                  className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="readout">Target Health</span>
                <select
                  value={config.targetHealth}
                  onChange={(event) => updateConfig({ targetHealth: event.target.value as NodeDrilldownConfig["targetHealth"] })}
                  className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
                >
                  <option value="nominal">Nominal</option>
                  <option value="degraded">Degraded</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="readout">Log Level</span>
                <select
                  value={config.logLevel}
                  onChange={(event) => updateConfig({ logLevel: event.target.value as NodeDrilldownConfig["logLevel"] })}
                  className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
                >
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="readout">Poll (sec)</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={config.pollIntervalSec}
                  onChange={(event) => updateConfig({ pollIntervalSec: Number(event.target.value) || 5 })}
                  className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                <span className="readout">Sample Rate (%)</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={config.sampleRate}
                  onChange={(event) => updateConfig({ sampleRate: Math.max(1, Math.min(100, Number(event.target.value) || 1)) })}
                  className="rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
                />
              </label>

              <label className="flex items-center gap-2 self-end rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-800 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100">
                <input
                  type="checkbox"
                  checked={config.autoRemediate}
                  onChange={(event) => updateConfig({ autoRemediate: event.target.checked })}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500/60"
                />
                Auto-remediate alerts
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-[11px] text-slate-700 dark:text-slate-300">
              <span className="readout">Node Notes</span>
              <textarea
                value={config.notes}
                onChange={(event) => updateConfig({ notes: event.target.value })}
                rows={3}
                placeholder="Add runtime notes, playbook links, or rollout constraints..."
                className="resize-y rounded-md border border-slate-300/70 bg-white/85 px-2.5 py-2 text-[12px] text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-slate-950/70 dark:text-slate-100 dark:focus-visible:ring-cyan-400/60"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
