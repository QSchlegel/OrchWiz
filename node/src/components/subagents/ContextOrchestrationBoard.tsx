"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Edge, Node, NodeMouseHandler, NodeTypes, ReactFlowInstance } from "reactflow"
import { MarkerType } from "reactflow"
import { Activity, AlertTriangle, ArrowRightLeft, ChevronLeft, ChevronRight, Focus, Maximize2, Minimize2 } from "lucide-react"
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
  agentId?: string
  editable?: boolean
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
  source: "border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200",
  agent: "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100",
  layer: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-100",
  output: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
  risk: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100",
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

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length
}

function resolveContextWindowTokens(): number {
  const raw = process.env.NEXT_PUBLIC_CONTEXT_WINDOW_TOKENS
  const parsed = Number.parseInt(raw || "258000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 258000
  }
  return parsed
}

function formatCompactTokens(value: number): string {
  if (value >= 1000) {
    const compact = value / 1000
    const decimals = compact >= 100 ? 0 : 1
    return `${compact.toFixed(decimals)}k`
  }
  return String(value)
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
  const aggregateWarningCount = useMemo(
    () => analyses.reduce((sum, analysis) => sum + analysis.risks.filter((risk) => risk.level === "warning").length, 0),
    [analyses],
  )
  const [payloadOverrides, setPayloadOverrides] = useState<Record<string, string>>({})
  const effectiveAgentWordCountById = useMemo(() => {
    const base = new Map<string, number>()
    analyses.forEach((analysis) => {
      base.set(analysis.subagentId, analysis.wordCount)
    })

    Object.entries(payloadOverrides).forEach(([nodeId, overrideText]) => {
      if (!nodeId.startsWith("section-")) {
        return
      }

      const matchingSubagent = subagents.find((subagent) => nodeId.startsWith(`section-${subagent.id}-`))
      if (!matchingSubagent) {
        return
      }

      const analysis = analysisById.get(matchingSubagent.id)
      if (!analysis) {
        return
      }

      const section = analysis.sections.find((candidate) => `section-${matchingSubagent.id}-${candidate.id}` === nodeId)
      if (!section) {
        return
      }

      const previousWords = section.wordCount
      const overrideWords = countWords(overrideText)
      const currentTotal = base.get(matchingSubagent.id) || 0
      base.set(matchingSubagent.id, Math.max(currentTotal - previousWords + overrideWords, 0))
    })

    return base
  }, [analyses, analysisById, payloadOverrides, subagents])
  const aggregateWordCount = useMemo(
    () => Array.from(effectiveAgentWordCountById.values()).reduce((sum, words) => sum + words, 0),
    [effectiveAgentWordCountById],
  )
  const aggregateTokenCount = useMemo(
    () => Math.ceil(aggregateWordCount * 1.3),
    [aggregateWordCount],
  )
  const contextWindowTokens = useMemo(() => resolveContextWindowTokens(), [])
  const contextUsedRatio = useMemo(
    () => Math.min(aggregateTokenCount / contextWindowTokens, 1),
    [aggregateTokenCount, contextWindowTokens],
  )
  const contextUsedPercent = useMemo(
    () => Math.round(contextUsedRatio * 100),
    [contextUsedRatio],
  )
  const contextLeftPercent = useMemo(
    () => Math.max(0, 100 - contextUsedPercent),
    [contextUsedPercent],
  )
  const compositionRows = useMemo(
    () =>
      subagents
        .map((subagent) => {
          const words = effectiveAgentWordCountById.get(subagent.id) || 0
          const share = aggregateWordCount > 0 ? (words / aggregateWordCount) * 100 : 0
          return {
            id: subagent.id,
            name: subagent.name,
            words,
            share,
          }
        })
        .sort((left, right) => right.words - left.words),
    [aggregateWordCount, effectiveAgentWordCountById, subagents],
  )

  const isSelectionControlled = selectedAgentIdProp !== undefined
  const [internalSelectedAgentId, setInternalSelectedAgentId] = useState<string | null>(subagents[0]?.id || null)
  const selectedAgentId = isSelectionControlled ? selectedAgentIdProp : internalSelectedAgentId
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(selectedAgentId ? `agent-${selectedAgentId}` : null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isEditingPayload, setIsEditingPayload] = useState(false)
  const [payloadDraft, setPayloadDraft] = useState("")
  const boardRef = useRef<HTMLDivElement | null>(null)
  const reactFlowRef = useRef<ReactFlowInstance | null>(null)

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
    const subagentIdSet = new Set(subagents.map((subagent) => subagent.id))

    const sourceNodeIds: string[] = []
    CONTEXT_SOURCES.forEach((source, index) => {
      const nodeId = `source-${source.key}`
      sourceNodeIds.push(nodeId)
      nodes.push({
        id: nodeId,
        type: "contextNode",
        position: { x: 24, y: 48 + index * 138 },
        selected: focusedNodeId === nodeId,
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
      const agentWords = effectiveAgentWordCountById.get(subagent.id) || 0
      const relativeSharePercent = aggregateWordCount > 0
        ? Math.round((agentWords / aggregateWordCount) * 100)
        : 0
      nodes.push({
        id: nodeId,
        type: "contextNode",
        position: { x: 360, y: 48 + index * 138 },
        selected: subagent.id === selectedAgentId,
        data: {
          title: subagent.name,
          subtitle: analysis?.summary || "No prompt summary available.",
          meta: analysis ? toAgentMeta(analysis) : "No analysis",
          badge: `${relativeSharePercent}%`,
          tone: "agent",
          agentId: subagent.id,
        },
      })

      details.set(nodeId, {
        tone: "agent",
        title: subagent.name,
        subtitle: subagent.description || "No description set.",
        body: subagent.content || "No prompt content available.",
        agentId: subagent.id,
        editable: true,
        stats: [
          { label: "Usage", value: `${effectiveAgentWordCountById.get(subagent.id) || 0} words` },
          { label: "Tokens", value: `~${Math.ceil((effectiveAgentWordCountById.get(subagent.id) || 0) * 1.3)}` },
          { label: "Layers", value: analysis ? String(analysis.sections.length) : "0" },
          { label: "Dependencies", value: analysis ? String(analysis.dependencies.length) : "0" },
          { label: "Warnings", value: String(riskCount) },
          { label: "Shared", value: subagent.isShared ? "Yes" : "No" },
          { label: "Path", value: subagent.path || "Not set" },
        ],
      })

      if (!selectedAgentId || subagent.id === selectedAgentId) {
        sourceNodeIds.forEach((sourceNodeId) => {
          edges.push({
            id: `edge-${sourceNodeId}-${nodeId}`,
            source: sourceNodeId,
            target: nodeId,
            sourceHandle: "source-right",
            targetHandle: "target-left",
            animated: false,
            type: "smoothstep",
            style: {
              stroke: subagent.id === selectedAgentId ? "var(--context-edge-source-active)" : "var(--context-edge-source-muted)",
              strokeWidth: subagent.id === selectedAgentId ? 2 : 1.4,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: subagent.id === selectedAgentId
                ? "var(--context-edge-source-marker-active)"
                : "var(--context-edge-source-marker-muted)",
            },
          })
        })
      }

      const dependencies = analysis?.dependencies || []
      if (!selectedAgentId || subagent.id === selectedAgentId) {
        dependencies.forEach((dependencyId) => {
          edges.push({
            id: `edge-handoff-${subagent.id}-${dependencyId}`,
            source: `agent-${subagent.id}`,
            target: `agent-${dependencyId}`,
            sourceHandle: "source-left",
            targetHandle: "target-left",
            type: "smoothstep",
            animated: true,
            pathOptions: {
              offset: 220,
              borderRadius: 14,
            },
            style: {
              stroke: "var(--context-edge-handoff)",
              strokeWidth: 2,
              zIndex: 0,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "var(--context-edge-handoff)",
            },
          })
        })
      }

      if (selectedAgentId && subagent.id === selectedAgentId && dependencies.length > 0) {
        const directDependencySet = new Set(dependencies)
        const reachable = new Set<string>()
        const queue = [...dependencies]

        while (queue.length > 0) {
          const dependencyId = queue.shift()
          if (!dependencyId || reachable.has(dependencyId) || !subagentIdSet.has(dependencyId)) {
            continue
          }
          reachable.add(dependencyId)
          const nestedDependencies = analysisById.get(dependencyId)?.dependencies || []
          nestedDependencies.forEach((nestedId) => {
            if (!reachable.has(nestedId)) {
              queue.push(nestedId)
            }
          })
        }

        Array.from(reachable)
          .filter((dependencyId) => !directDependencySet.has(dependencyId) && dependencyId !== subagent.id)
          .forEach((dependencyId) => {
            edges.push({
              id: `edge-handoff-transitive-${subagent.id}-${dependencyId}`,
              source: `agent-${subagent.id}`,
              target: `agent-${dependencyId}`,
              sourceHandle: "source-left",
              targetHandle: "target-left",
              type: "smoothstep",
              animated: false,
              pathOptions: {
                offset: 260,
                borderRadius: 14,
              },
              style: {
                stroke: "var(--context-edge-transitive)",
                strokeWidth: 1.8,
                strokeDasharray: "6 4",
                zIndex: 0,
              },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "var(--context-edge-transitive)",
              },
            })
          })
      }
    })

    const aggregateNodeCenterY = 48 + Math.max((subagents.length - 1) * 138 * 0.5, 70)
    const aggregateNodeId = "output-aggregate-all-agents"
    nodes.push({
      id: aggregateNodeId,
      type: "contextNode",
      position: { x: 1120, y: aggregateNodeCenterY - 220 },
      data: {
        title: "Total Context (All Agents)",
        subtitle: "Aggregated context footprint across the full board",
        meta: `${aggregateWarningCount} warnings`,
        badge: `${aggregateWordCount} words`,
        tone: "output",
      },
    })
    details.set(aggregateNodeId, {
      tone: "output",
      title: "Total Context (All Agents)",
      subtitle: `${subagents.length} agents aggregated`,
      body: "Combined context size across all visible agents on this board.",
      stats: [
        { label: "Agents", value: String(subagents.length) },
        { label: "Words", value: String(aggregateWordCount) },
        { label: "Tokens", value: `~${aggregateTokenCount}` },
        { label: "Warnings", value: String(aggregateWarningCount) },
      ],
    })

    subagents.forEach((subagent) => {
      if (selectedAgentId && subagent.id !== selectedAgentId) {
        return
      }
      edges.push({
        id: `edge-aggregate-${subagent.id}`,
        source: `agent-${subagent.id}`,
        target: aggregateNodeId,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        type: "smoothstep",
        style: {
          stroke: "var(--context-edge-aggregate)",
          strokeWidth: 1.6,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "var(--context-edge-aggregate)",
        },
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
          agentId: selectedAgentId,
          editable: true,
          stats: [
            { label: "Coverage", value: `${Math.round(section.coverage * 100)}%` },
            { label: "Type", value: section.type },
          ],
        })

        edges.push({
          id: `edge-selected-agent-${sectionNodeId}`,
          source: `agent-${selectedAgentId}`,
          target: sectionNodeId,
          sourceHandle: "source-right",
          targetHandle: "target-left",
          animated: false,
          type: "smoothstep",
          style: {
            stroke: "var(--context-edge-section)",
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--context-edge-section)",
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
          sourceHandle: "source-right",
          targetHandle: "target-left",
          type: "smoothstep",
          style: {
            stroke: "var(--context-edge-output)",
            strokeWidth: 1.8,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--context-edge-output)",
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
          sourceHandle: "source-right",
          targetHandle: "target-left",
          type: "smoothstep",
          animated: risk.level === "warning",
          style: {
            stroke: "var(--context-edge-risk)",
            strokeWidth: 1.8,
            strokeDasharray: "6 4",
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "var(--context-edge-risk)",
          },
        })
      })
    }

    if (focusedNodeId?.startsWith("source-")) {
      const nodeDepth = new Map<string, number>()
      const edgeDepth = new Map<string, number>()
      const queue = [focusedNodeId]
      nodeDepth.set(focusedNodeId, 0)

      while (queue.length > 0) {
        const current = queue.shift()
        if (!current) {
          continue
        }
        const currentDepth = nodeDepth.get(current) ?? 0

        edges.forEach((edge) => {
          if (edge.source !== current) {
            return
          }

          const nextDepth = currentDepth + 1
          edgeDepth.set(edge.id, nextDepth)
          if (!nodeDepth.has(edge.target)) {
            nodeDepth.set(edge.target, nextDepth)
            queue.push(edge.target)
          }
        })
      }

      nodes.forEach((node) => {
        const depth = nodeDepth.get(node.id)
        if (depth !== undefined) {
          node.selected = true
          const activeOpacity = depth <= 1 ? 1 : depth === 2 ? 0.5 : 0.22
          node.style = {
            ...node.style,
            opacity: activeOpacity,
          }
        } else {
          node.style = {
            ...node.style,
            opacity: 0.22,
          }
        }
      })

      edges.forEach((edge) => {
        const depth = edgeDepth.get(edge.id)
        if (depth !== undefined) {
          const baseStrokeWidth =
            (edge.style?.strokeWidth && typeof edge.style.strokeWidth === "number")
              ? edge.style.strokeWidth
              : 1.6

          const baseColor =
            (edge.style?.stroke && typeof edge.style.stroke === "string")
              ? edge.style.stroke
              : "var(--context-edge-transitive)"

          edge.animated = depth === 1
          const activeOpacity = depth <= 1 ? 1 : depth === 2 ? 0.5 : 0.22
          edge.style = {
            ...edge.style,
            stroke: baseColor,
            strokeWidth: baseStrokeWidth + 0.8,
            opacity: activeOpacity,
          }
          edge.markerEnd = {
            type: MarkerType.ArrowClosed,
            color: baseColor,
          }
          return
        }

        edge.animated = false
        edge.style = {
          ...edge.style,
          opacity: 0.22,
        }
      })
    }

    return {
      nodes,
      edges,
      details,
    }
  }, [aggregateTokenCount, aggregateWarningCount, aggregateWordCount, analysisById, effectiveAgentWordCountById, focusedNodeId, selectedAgentId, subagents])

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

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === boardRef.current)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  useEffect(() => {
    const instance = reactFlowRef.current
    if (!instance) {
      return
    }

    const timer = window.setTimeout(() => {
      instance.fitView({ padding: 0.18, duration: 260 })
    }, 60)

    return () => window.clearTimeout(timer)
  }, [isFullscreen, graph.nodes, graph.edges])

  const selectedAnalysis = selectedAgentId ? analysisById.get(selectedAgentId) : null
  const selectedEffectiveWordCount = selectedAgentId
    ? (effectiveAgentWordCountById.get(selectedAgentId) || 0)
    : 0
  const focusedDetail = focusedNodeId ? graph.details.get(focusedNodeId) : null
  const baseActiveDetail =
    focusedDetail
    || (selectedAgentId ? graph.details.get(`agent-${selectedAgentId}`) : null)
    || null
  const overrideBody = focusedNodeId ? payloadOverrides[focusedNodeId] : undefined
  const activeDetail = baseActiveDetail
    ? {
      ...baseActiveDetail,
      body: overrideBody ?? baseActiveDetail.body,
    }
    : null

  useEffect(() => {
    setIsEditingPayload(false)
    setPayloadDraft(activeDetail?.body || "")
  }, [activeDetail?.title, activeDetail?.body, activeDetail?.tone])

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    const nodeData = node.data as ContextFlowNodeData
    if (nodeData.agentId) {
      setSelectedAgentId(nodeData.agentId)
    }
    setFocusedNodeId(node.id)
  }

  const canEditPayload = Boolean(activeDetail?.editable && activeDetail.agentId && focusedNodeId && activeDetail.body !== undefined)
  const hasOverride = Boolean(focusedNodeId && payloadOverrides[focusedNodeId] !== undefined)

  const handleSavePayload = useCallback(async () => {
    if (!activeDetail?.editable || !focusedNodeId || activeDetail.body === undefined) {
      return
    }
    setPayloadOverrides((current) => ({
      ...current,
      [focusedNodeId]: payloadDraft,
    }))
    setIsEditingPayload(false)
  }, [activeDetail, focusedNodeId, payloadDraft])

  const handleFullscreenToggle = useCallback(async () => {
    const boardElement = boardRef.current
    if (!boardElement) {
      return
    }
    try {
      if (document.fullscreenElement === boardElement) {
        await document.exitFullscreen()
      } else {
        await boardElement.requestFullscreen()
      }
    } catch {
      // Ignore fullscreen errors (for example when blocked by browser policy).
    }
  }, [])

  const selectedAgentIndex = selectedAgentId
    ? subagents.findIndex((subagent) => subagent.id === selectedAgentId)
    : -1
  const hasPrevAgent = selectedAgentIndex > 0
  const hasNextAgent = selectedAgentIndex >= 0 && selectedAgentIndex < subagents.length - 1

  const handlePrevAgent = useCallback(() => {
    if (!hasPrevAgent) {
      return
    }
    const previousAgentId = subagents[selectedAgentIndex - 1]?.id || null
    setSelectedAgentId(previousAgentId)
    setFocusedNodeId(previousAgentId ? `agent-${previousAgentId}` : null)
  }, [hasPrevAgent, selectedAgentIndex, setSelectedAgentId, subagents])

  const handleNextAgent = useCallback(() => {
    if (!hasNextAgent) {
      return
    }
    const nextAgentId = subagents[selectedAgentIndex + 1]?.id || null
    setSelectedAgentId(nextAgentId)
    setFocusedNodeId(nextAgentId ? `agent-${nextAgentId}` : null)
  }, [hasNextAgent, selectedAgentIndex, setSelectedAgentId, subagents])

  if (subagents.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center text-slate-600 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-400 ${className}`}>
        <p className="text-base font-medium text-slate-800 dark:text-slate-200">Context board is empty</p>
        <p className="mt-1 text-sm">Create the first subagent to visualize context composition and handoff flows.</p>
      </div>
    )
  }

  return (
    <div
      ref={boardRef}
      className={`space-y-4 ${isFullscreen ? "h-screen overflow-auto bg-slate-100/95 p-4 sm:p-6 dark:bg-slate-950/95" : ""} ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Context Orchestration Board</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Engineer agent context as a composed graph: global sources, handoffs, section layers, and final output context.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Aggregated context size: {aggregateWordCount} words (~{aggregateTokenCount} tokens)
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Context window: {contextUsedPercent}% used ({contextLeftPercent}% left) · {formatCompactTokens(aggregateTokenCount)} / {formatCompactTokens(contextWindowTokens)} tokens
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevAgent}
            disabled={!hasPrevAgent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100 dark:enabled:hover:bg-white/[0.09]"
            aria-label="Select previous agent"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev Agent
          </button>
          <button
            type="button"
            onClick={handleNextAgent}
            disabled={!hasNextAgent}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition enabled:hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100 dark:enabled:hover:bg-white/[0.09]"
            aria-label="Select next agent"
          >
            Next Agent
            <ChevronRight className="h-4 w-4" />
          </button>
          {!hideAgentSelector && (
            <>
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
            </>
          )}
          <button
            type="button"
            onClick={handleFullscreenToggle}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100 dark:hover:bg-white/[0.09]"
            aria-label={isFullscreen ? "Exit fullscreen mode" : "Enter fullscreen mode"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? "Exit Full Screen" : "Full Screen"}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 ${isFullscreen ? "h-[calc(100vh-8.5rem)] xl:grid-cols-[minmax(0,1fr)_380px]" : "xl:grid-cols-[minmax(0,1fr)_350px]"}`}>
        <div className="rounded-2xl border border-slate-300/90 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <FlowCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              reactFlowRef.current = instance
            }}
            onNodeClick={handleNodeClick}
            onPaneClick={() => {
              if (selectedAgentId) {
                setFocusedNodeId(`agent-${selectedAgentId}`)
              } else {
                setFocusedNodeId(null)
              }
            }}
            showMiniMap
            miniMapWidth={132}
            miniMapHeight={88}
            nodesDraggable={false}
            className={isFullscreen ? "!h-[calc(100vh-13.6rem)] min-h-[560px]" : "!h-[640px]"}
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

        <aside className={`rounded-2xl border border-slate-300/90 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.05] ${isFullscreen ? "overflow-auto" : ""}`}>
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
                      className="rounded-lg border border-slate-300/80 bg-slate-50 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <p className="uppercase tracking-[0.13em] text-[10px] text-slate-600 dark:text-slate-400">{stat.label}</p>
                      <p className="mt-1 break-words text-slate-900 dark:text-slate-200">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeDetail.body && (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
                      Context Payload
                    </p>
                    {canEditPayload && !isEditingPayload && (
                      <div className="flex items-center gap-1.5">
                        {hasOverride && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!focusedNodeId) return
                              setPayloadOverrides((current) => {
                                const next = { ...current }
                                delete next[focusedNodeId]
                                return next
                              })
                            }}
                            className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                          >
                            Clear Override
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPayloadDraft(activeDetail.body || "")
                            setIsEditingPayload(true)
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                        >
                          Edit Override
                        </button>
                      </div>
                    )}
                    {canEditPayload && isEditingPayload && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPayloadDraft(activeDetail.body || "")
                            setIsEditingPayload(false)
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSavePayload()}
                          disabled={payloadDraft.trim() === (activeDetail.body || "").trim()}
                          className="rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                        >
                          Save Override
                        </button>
                      </div>
                    )}
                  </div>
                  {hasOverride && (
                    <p className="mb-1 text-[11px] text-amber-500 dark:text-amber-300">
                      Manual override active for this node.
                    </p>
                  )}
                  {isEditingPayload ? (
                    <textarea
                      value={payloadDraft}
                      onChange={(event) => setPayloadDraft(event.target.value)}
                      rows={10}
                      className="max-h-[380px] w-full rounded-xl border border-slate-300/80 bg-white p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
                    />
                  ) : (
                    <pre className="max-h-[350px] overflow-auto rounded-xl border border-slate-300/80 bg-white p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                      {activeDetail.body}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 space-y-2 rounded-xl border border-slate-300/80 bg-slate-50/95 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">
              <Focus className="h-3.5 w-3.5" />
              Composition Snapshot
            </div>
            <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
              <p className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-indigo-400" />
                {selectedAnalysis
                  ? `${selectedEffectiveWordCount} words · ~${Math.ceil(selectedEffectiveWordCount * 1.3)} tokens`
                  : "No agent selected"}
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

          <div className="mt-4 space-y-2 rounded-xl border border-slate-300/80 bg-slate-50/95 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-600 dark:text-slate-400">Context Composition Diagram</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {aggregateWordCount} words · ~{aggregateTokenCount} tokens
              </p>
            </div>
            <div className="space-y-2">
              {compositionRows.map((row) => {
                const isActive = row.id === selectedAgentId
                return (
                  <div key={row.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <p className={`truncate ${isActive ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
                        {row.name}
                      </p>
                      <p className="shrink-0 text-slate-500 dark:text-slate-400">
                        {row.words}w ({Math.round(row.share)}%)
                      </p>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all ${isActive ? "bg-indigo-500" : "bg-cyan-500/80"}`}
                        style={{ width: `${Math.max(row.share, row.words > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
