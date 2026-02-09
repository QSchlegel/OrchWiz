"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Edge, Node, NodeMouseHandler, NodeTypes } from "reactflow"
import { MarkerType } from "reactflow"
import { Activity, AlertTriangle, ArrowRightLeft, Focus } from "lucide-react"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import { ContextFlowNode, type ContextFlowNodeData, type ContextNodeTone } from "./ContextFlowNode"
import { analyzeSubagentContexts, type SubagentContextAnalysis } from "@/lib/subagents/context-analysis"

interface Subagent {
  id: string
  name: string
  description: string | null
  content: string
  path: string | null
  isShared: boolean
  createdAt: string
}

interface ContextOrchestrationBoardProps {
  subagents: Subagent[]
  className?: string
  selectedAgentId?: string | null
  onSelectedAgentIdChange?: (nextId: string | null) => void
  hideAgentSelector?: boolean
}

interface NodeDetailEntry {
  tone: ContextNodeTone
  title: string
  subtitle?: string
  body?: string
  stats: Array<{ label: string; value: string }>
}

const nodeTypes: NodeTypes = {
  contextNode: ContextFlowNode,
}

const CONTEXT_SOURCES = [
  {
    key: "system-governance",
    title: "System Governance",
    subtitle: "Global safety and policy constraints",
    meta: "Global layer",
    body: "Baseline rules and policy checks applied before agent instructions.",
  },
  {
    key: "workspace-state",
    title: "Workspace State",
    subtitle: "Project files, branch state, and task context",
    meta: "Workspace layer",
    body: "Repository context and active workspace state available to all agents.",
  },
  {
    key: "runtime-memory",
    title: "Session Memory",
    subtitle: "Prior interactions and transient decision state",
    meta: "Memory layer",
    body: "Conversation history and execution artifacts used for continuity.",
  },
  {
    key: "tool-envelope",
    title: "Tool Envelope",
    subtitle: "Available APIs, commands, and execution permissions",
    meta: "Execution layer",
    body: "Tooling and runtime permissions that define what each agent can execute.",
  },
]

const toneClasses: Record<ContextNodeTone, string> = {
  source: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  agent: "border-indigo-500/30 bg-indigo-500/10 text-indigo-100",
  layer: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100",
  output: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  risk: "border-rose-500/30 bg-rose-500/10 text-rose-100",
}

const toneLabels: Record<ContextNodeTone, string> = {
  source: "Global Source",
  agent: "Agent",
  layer: "Context Layer",
  output: "Output Context",
  risk: "Risk Signal",
}

function buildComposedPrompt(analysis: SubagentContextAnalysis): string {
  if (analysis.sections.length === 0) {
    return "No structured sections detected yet. Add headings or clear context blocks to compose a stable prompt."
  }

  return analysis.sections
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
    .trim()
}

function trimForNode(text: string, maxLength = 86): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function toAgentMeta(analysis: SubagentContextAnalysis): string {
  return `${analysis.sections.length} layers · ${analysis.wordCount} words`
}

export function ContextOrchestrationBoard({
  subagents,
  className = "",
  selectedAgentId: selectedAgentIdProp,
  onSelectedAgentIdChange,
  hideAgentSelector = false,
}: ContextOrchestrationBoardProps) {
  const analyses = useMemo(() => analyzeSubagentContexts(subagents), [subagents])
  const analysisById = useMemo(
    () => new Map(analyses.map((analysis) => [analysis.subagentId, analysis])),
    [analyses]
  )

  const isSelectionControlled = selectedAgentIdProp !== undefined
  const [internalSelectedAgentId, setInternalSelectedAgentId] = useState<string | null>(subagents[0]?.id || null)
  const selectedAgentId = isSelectionControlled ? selectedAgentIdProp : internalSelectedAgentId
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(selectedAgentId ? `agent-${selectedAgentId}` : null)

  const setSelectedAgentId = useCallback(
    (nextId: string | null) => {
      if (!isSelectionControlled) {
        setInternalSelectedAgentId(nextId)
      }
      onSelectedAgentIdChange?.(nextId)
    },
    [isSelectionControlled, onSelectedAgentIdChange],
  )

  useEffect(() => {
    if (subagents.length === 0) {
      setSelectedAgentId(null)
      setFocusedNodeId(null)
      return
    }

    if (selectedAgentId && subagents.some((subagent) => subagent.id === selectedAgentId)) {
      return
    }

    setSelectedAgentId(subagents[0].id)
  }, [selectedAgentId, setSelectedAgentId, subagents])

  const graph = useMemo(() => {
    const nodes: Node<ContextFlowNodeData>[] = []
    const edges: Edge[] = []
    const details = new Map<string, NodeDetailEntry>()

    const sourceNodeIds: string[] = []
    CONTEXT_SOURCES.forEach((source, index) => {
      const nodeId = `source-${source.key}`
      sourceNodeIds.push(nodeId)
      nodes.push({
        id: nodeId,
        type: "contextNode",
        position: { x: 24, y: 48 + index * 138 },
        data: {
          title: source.title,
          subtitle: source.subtitle,
          meta: source.meta,
          tone: "source",
        },
      })
      details.set(nodeId, {
        tone: "source",
        title: source.title,
        subtitle: source.subtitle,
        body: source.body,
        stats: [{ label: "Influence", value: "All agents" }],
      })
    })

    subagents.forEach((subagent, index) => {
      const analysis = analysisById.get(subagent.id)
      const nodeId = `agent-${subagent.id}`
      const riskCount = analysis?.risks.filter((risk) => risk.level === "warning").length || 0
      nodes.push({
        id: nodeId,
        type: "contextNode",
        position: { x: 360, y: 48 + index * 138 },
        selected: subagent.id === selectedAgentId,
        data: {
          title: subagent.name,
          subtitle: analysis?.summary || "No prompt summary available.",
          meta: analysis ? toAgentMeta(analysis) : "No analysis",
          badge: analysis ? `${analysis.compositionScore}%` : undefined,
          tone: "agent",
          agentId: subagent.id,
        },
      })

      details.set(nodeId, {
        tone: "agent",
        title: subagent.name,
        subtitle: subagent.description || "No description set.",
        body: subagent.content || "No prompt content available.",
        stats: [
          { label: "Composition", value: analysis ? `${analysis.compositionScore}%` : "N/A" },
          { label: "Layers", value: analysis ? String(analysis.sections.length) : "0" },
          { label: "Dependencies", value: analysis ? String(analysis.dependencies.length) : "0" },
          { label: "Warnings", value: String(riskCount) },
          { label: "Shared", value: subagent.isShared ? "Yes" : "No" },
          { label: "Path", value: subagent.path || "Not set" },
        ],
      })

      sourceNodeIds.forEach((sourceNodeId) => {
        edges.push({
          id: `edge-${sourceNodeId}-${nodeId}`,
          source: sourceNodeId,
          target: nodeId,
          animated: false,
          type: "smoothstep",
          style: {
            stroke: subagent.id === selectedAgentId ? "rgba(34,211,238,0.62)" : "rgba(34,211,238,0.28)",
            strokeWidth: subagent.id === selectedAgentId ? 2 : 1.4,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: subagent.id === selectedAgentId ? "rgba(34,211,238,0.62)" : "rgba(34,211,238,0.3)",
          },
        })
      })

      const dependencies = analysis?.dependencies || []
      dependencies.forEach((dependencyId) => {
        edges.push({
          id: `edge-handoff-${subagent.id}-${dependencyId}`,
          source: `agent-${subagent.id}`,
          target: `agent-${dependencyId}`,
          type: "smoothstep",
          animated: true,
          label: "handoff",
          labelStyle: {
            fill: "var(--flow-edge-label)",
            fontSize: 10,
            fontWeight: 600,
          },
          labelBgPadding: [6, 2],
          labelBgBorderRadius: 8,
          labelBgStyle: {
            fill: "var(--flow-edge-label-bg)",
            opacity: 0.9,
          },
          style: {
            stroke: "rgba(251,191,36,0.76)",
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "rgba(251,191,36,0.76)",
          },
        })
      })
    })

    const selectedAnalysis = selectedAgentId ? analysisById.get(selectedAgentId) : null

    if (selectedAgentId && selectedAnalysis) {
      const visibleSections =
        selectedAnalysis.sections.length > 0
          ? selectedAnalysis.sections.slice(0, 8)
          : [
              {
                id: `${selectedAgentId}-fallback-section`,
                type: "instructions" as const,
                label: "Instructions",
                title: "Unstructured Prompt",
                content: "No headings detected. Add section headers to improve context composability.",
                wordCount: 0,
                coverage: 0,
              },
            ]

      const centerY = 48 + Math.max((visibleSections.length - 1) * 138 * 0.5, 70)

      visibleSections.forEach((section, index) => {
        const sectionNodeId = `section-${selectedAgentId}-${section.id}`
        nodes.push({
          id: sectionNodeId,
          type: "contextNode",
          position: { x: 760, y: 48 + index * 128 },
          data: {
            title: section.label,
            subtitle: trimForNode(section.title),
            meta: `${section.wordCount} words`,
            badge: `${Math.round(section.coverage * 100)}%`,
            tone: "layer",
            agentId: selectedAgentId,
          },
        })
        details.set(sectionNodeId, {
          tone: "layer",
          title: `${section.label} · ${section.title}`,
          subtitle: `${section.wordCount} words`,
          body: section.content,
          stats: [
            { label: "Coverage", value: `${Math.round(section.coverage * 100)}%` },
            { label: "Type", value: section.type },
          ],
        })

        edges.push({
          id: `edge-selected-agent-${sectionNodeId}`,
          source: `agent-${selectedAgentId}`,
          target: sectionNodeId,
          animated: false,
          type: "smoothstep",
          style: {
            stroke: "rgba(217,70,239,0.65)",
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "rgba(217,70,239,0.65)",
          },
        })
      })

      const outputNodeId = `output-${selectedAgentId}`
      nodes.push({
        id: outputNodeId,
        type: "contextNode",
        position: { x: 1120, y: centerY },
        data: {
          title: "Composed Output Context",
          subtitle: "Merged instruction stack ready for runtime",
          meta: `${selectedAnalysis.risks.filter((risk) => risk.level === "warning").length} warnings`,
          badge: `${selectedAnalysis.compositionScore}%`,
          tone: "output",
          agentId: selectedAgentId,
        },
      })
      details.set(outputNodeId, {
        tone: "output",
        title: "Composed Output Context",
        subtitle: `${selectedAnalysis.sections.length} sections merged`,
        body: buildComposedPrompt(selectedAnalysis),
        stats: [
          { label: "Composition", value: `${selectedAnalysis.compositionScore}%` },
          { label: "Dependencies", value: String(selectedAnalysis.dependencies.length) },
          { label: "Warnings", value: String(selectedAnalysis.risks.filter((risk) => risk.level === "warning").length) },
        ],
      })

      visibleSections.forEach((section) => {
        const sectionNodeId = `section-${selectedAgentId}-${section.id}`
        edges.push({
          id: `edge-${sectionNodeId}-${outputNodeId}`,
          source: sectionNodeId,
          target: outputNodeId,
          type: "smoothstep",
          style: {
            stroke: "rgba(16,185,129,0.6)",
            strokeWidth: 1.8,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "rgba(16,185,129,0.6)",
          },
        })
      })

      selectedAnalysis.risks.slice(0, 3).forEach((risk, index) => {
        const riskNodeId = `risk-${selectedAgentId}-${risk.id}`
        nodes.push({
          id: riskNodeId,
          type: "contextNode",
          position: { x: 1120, y: centerY + 180 + index * 118 },
          data: {
            title: risk.level === "warning" ? "Composition Risk" : "Composition Note",
            subtitle: trimForNode(risk.message, 94),
            meta: "Quality signal",
            badge: risk.level.toUpperCase(),
            tone: "risk",
            agentId: selectedAgentId,
          },
        })
        details.set(riskNodeId, {
          tone: "risk",
          title: risk.level === "warning" ? "Composition Risk" : "Composition Note",
          subtitle: risk.id,
          body: risk.message,
          stats: [{ label: "Severity", value: risk.level }],
        })

        edges.push({
          id: `edge-risk-${selectedAgentId}-${risk.id}`,
          source: `agent-${selectedAgentId}`,
          target: riskNodeId,
          type: "smoothstep",
          animated: risk.level === "warning",
          style: {
            stroke: "rgba(244,63,94,0.56)",
            strokeWidth: 1.8,
            strokeDasharray: "6 4",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "rgba(244,63,94,0.56)",
          },
        })
      })
    }

    return {
      nodes,
      edges,
      details,
    }
  }, [analysisById, selectedAgentId, subagents])

  useEffect(() => {
    if (!selectedAgentId) {
      setFocusedNodeId(null)
      return
    }

    setFocusedNodeId((current) => {
      if (current && graph.details.has(current)) {
        return current
      }
      return `agent-${selectedAgentId}`
    })
  }, [graph.details, selectedAgentId])

  const selectedAnalysis = selectedAgentId ? analysisById.get(selectedAgentId) : null
  const focusedDetail = focusedNodeId ? graph.details.get(focusedNodeId) : null
  const activeDetail =
    focusedDetail
    || (selectedAgentId ? graph.details.get(`agent-${selectedAgentId}`) : null)
    || null

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    const nodeData = node.data as ContextFlowNodeData
    if (nodeData.agentId) {
      setSelectedAgentId(nodeData.agentId)
    }
    setFocusedNodeId(node.id)
  }

  if (subagents.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-slate-600 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-400 ${className}`}>
        <p className="text-base font-medium text-slate-800 dark:text-slate-200">Context board is empty</p>
        <p className="mt-1 text-sm">Create the first subagent to visualize context composition and handoff flows.</p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Context Orchestration Board</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Engineer agent context as a composed graph: global sources, handoffs, section layers, and final output context.
          </p>
        </div>

        {!hideAgentSelector && (
          <div className="flex items-center gap-2">
            <label htmlFor="context-focus" className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              Focus Agent
            </label>
            <select
              id="context-focus"
              value={selectedAgentId || ""}
              onChange={(event) => {
                const nextId = event.target.value || null
                setSelectedAgentId(nextId)
                setFocusedNodeId(nextId ? `agent-${nextId}` : null)
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              {subagents.map((subagent) => (
                <option key={subagent.id} value={subagent.id}>
                  {subagent.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <FlowCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onPaneClick={() => {
              if (selectedAgentId) {
                setFocusedNodeId(`agent-${selectedAgentId}`)
              } else {
                setFocusedNodeId(null)
              }
            }}
            showMiniMap
            nodesDraggable={false}
            className="!h-[640px]"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              { label: "Global Source", tone: "source" as const },
              { label: "Agent", tone: "agent" as const },
              { label: "Context Layer", tone: "layer" as const },
              { label: "Composed Output", tone: "output" as const },
              { label: "Risk Signal", tone: "risk" as const },
            ]).map((legend) => (
              <span
                key={legend.label}
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClasses[legend.tone]}`}
              >
                {legend.label}
              </span>
            ))}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.05]">
          {!activeDetail ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">Select a node to inspect its context details.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${toneClasses[activeDetail.tone]}`}
                >
                  {toneLabels[activeDetail.tone]}
                </span>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{activeDetail.title}</h3>
                {activeDetail.subtitle && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{activeDetail.subtitle}</p>
                )}
              </div>

              {activeDetail.stats.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {activeDetail.stats.map((stat) => (
                    <div
                      key={`${activeDetail.title}-${stat.label}`}
                      className="rounded-lg border border-slate-200/70 bg-slate-50/90 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <p className="uppercase tracking-[0.13em] text-[10px] text-slate-500 dark:text-slate-500">{stat.label}</p>
                      <p className="mt-1 break-words text-slate-800 dark:text-slate-200">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeDetail.body && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
                    Context Payload
                  </p>
                  <pre className="max-h-[350px] overflow-auto rounded-xl border border-slate-200/80 bg-slate-50/85 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                    {activeDetail.body}
                  </pre>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
              <Focus className="h-3.5 w-3.5" />
              Composition Snapshot
            </div>
            <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <p className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-indigo-400" />
                {selectedAnalysis ? `${selectedAnalysis.compositionScore}% context completeness` : "No agent selected"}
              </p>
              <p className="flex items-center gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5 text-amber-400" />
                {selectedAnalysis ? `${selectedAnalysis.dependencies.length} inferred handoff path(s)` : "0 handoff paths"}
              </p>
              <p className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
                {selectedAnalysis
                  ? `${selectedAnalysis.risks.filter((risk) => risk.level === "warning").length} warning signal(s)`
                  : "0 warning signals"}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
