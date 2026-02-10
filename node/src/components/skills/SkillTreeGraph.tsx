"use client"

import { useMemo } from "react"
import type { Edge, Node } from "reactflow"
import { MarkerType } from "reactflow"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import type { SkillGraphGroupId, SkillGraphResponse } from "@/lib/skills/types"

const GROUP_ORDER: SkillGraphGroupId[] = ["installed", "curated", "experimental", "custom", "system"]

function groupColumn(groupId: SkillGraphGroupId): number {
  const index = GROUP_ORDER.indexOf(groupId)
  return index >= 0 ? index : GROUP_ORDER.length
}

interface SkillTreeGraphProps {
  graph: SkillGraphResponse
  selectedSkillId: string | null
  query: string
  onSelectSkill: (skillId: string) => void
}

export function SkillTreeGraph(props: SkillTreeGraphProps) {
  const normalizedQuery = props.query.trim().toLowerCase()

  const filteredGraph = useMemo(() => {
    if (!normalizedQuery) {
      return props.graph
    }

    const allowedSkillNodeIds = new Set(
      props.graph.nodes
        .filter((node) => node.nodeType === "skill")
        .filter((node) => node.label.toLowerCase().includes(normalizedQuery))
        .map((node) => node.id),
    )

    const nodes = props.graph.nodes.filter((node) => {
      if (node.nodeType === "group") {
        return true
      }
      return allowedSkillNodeIds.has(node.id)
    })

    const edges = props.graph.edges.filter((edge) => allowedSkillNodeIds.has(edge.target))

    return {
      ...props.graph,
      nodes,
      edges,
      stats: {
        ...props.graph.stats,
        totalSkills: nodes.filter((node) => node.nodeType === "skill").length,
      },
    }
  }, [normalizedQuery, props.graph])

  const nodes = useMemo<Node[]>(() => {
    const byGroup = new Map<SkillGraphGroupId, number>()

    return filteredGraph.nodes.map((node) => {
      if (node.nodeType === "group") {
        const column = groupColumn(node.groupId)
        return {
          id: node.id,
          position: {
            x: column * 280,
            y: 0,
          },
          draggable: false,
          data: {
            label: (
              <div className="max-w-[220px]">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">{node.label}</p>
              </div>
            ),
          },
          style: {
            minWidth: 220,
            borderRadius: 12,
            border: "1px solid rgba(30, 41, 59, 0.15)",
            background: "rgba(248, 250, 252, 0.9)",
            color: "#0f172a",
            padding: 10,
          },
        }
      }

      const current = byGroup.get(node.groupId) || 0
      byGroup.set(node.groupId, current + 1)

      const selected = node.skillId === props.selectedSkillId
      const column = groupColumn(node.groupId)

      return {
        id: node.id,
        position: {
          x: column * 280,
          y: 90 + current * 92,
        },
        draggable: false,
        data: {
          label: (
            <div className="max-w-[220px]">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{node.label}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {node.source?.replaceAll("_", " ") || "skill"}
                {node.isInstalled ? " · installed" : ""}
              </p>
            </div>
          ),
        },
        style: {
          minWidth: 220,
          borderRadius: 12,
          border: selected ? "2px solid rgba(6, 182, 212, 0.9)" : "1px solid rgba(30, 41, 59, 0.12)",
          background: selected ? "rgba(6, 182, 212, 0.12)" : "rgba(255, 255, 255, 0.96)",
          color: "#0f172a",
          padding: 10,
          boxShadow: selected ? "0 0 0 2px rgba(6, 182, 212, 0.15)" : "none",
        },
      }
    })
  }, [filteredGraph.nodes, props.selectedSkillId])

  const edges = useMemo<Edge[]>(() => {
    return filteredGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: {
        stroke: "rgba(59, 130, 246, 0.55)",
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "rgba(59, 130, 246, 0.55)",
      },
    }))
  }, [filteredGraph.edges])

  const handleNodeClick = (_event: unknown, node: Node) => {
    const graphNode = filteredGraph.nodes.find((item) => item.id === node.id)
    if (!graphNode || graphNode.nodeType !== "skill" || !graphNode.skillId) {
      return
    }

    props.onSelectSkill(graphNode.skillId)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="rounded border border-slate-200 bg-white/70 px-2 py-1 dark:border-white/10 dark:bg-white/[0.03]">
          Skills: {filteredGraph.stats.totalSkills}
        </span>
        <span className="rounded border border-slate-200 bg-white/70 px-2 py-1 dark:border-white/10 dark:bg-white/[0.03]">
          Installed: {filteredGraph.stats.installedCount}
        </span>
        <span className="rounded border border-slate-200 bg-white/70 px-2 py-1 dark:border-white/10 dark:bg-white/[0.03]">
          System: {filteredGraph.stats.systemCount}
        </span>
      </div>

      <FlowCanvas
        nodes={nodes}
        edges={edges}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        showMiniMap
        className="h-[560px]"
      />
    </div>
  )
}
