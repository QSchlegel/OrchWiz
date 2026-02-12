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
  allowedSkillIds?: string[]
  importableSkillIds?: string[]
  activeGroupId?: SkillGraphGroupId | null
  onSelectSkill: (skillId: string) => void
  onToggleGroup?: (groupId: SkillGraphGroupId) => void
  className?: string
  showMiniMap?: boolean
}

export function SkillTreeGraph(props: SkillTreeGraphProps) {
  const importableSkillIds = useMemo(
    () => new Set(props.importableSkillIds || []),
    [props.importableSkillIds],
  )

  const filteredGraph = useMemo(() => {
    const allowedSkillIds = new Set(props.allowedSkillIds || [])
    const hasAllowedList = allowedSkillIds.size > 0 || Array.isArray(props.allowedSkillIds)

    const skillNodes = props.graph.nodes
      .filter((node) => node.nodeType === "skill")
      .filter((node) => {
        if (!hasAllowedList) {
          return true
        }

        return Boolean(node.skillId && allowedSkillIds.has(node.skillId))
      })

    const allowedSkillNodeIds = new Set(skillNodes.map((node) => node.id))
    const nodes = props.graph.nodes.filter((node) => node.nodeType === "group" || allowedSkillNodeIds.has(node.id))
    const edges = props.graph.edges.filter((edge) => allowedSkillNodeIds.has(edge.target))

    const groupedCounts: Record<SkillGraphGroupId, number> = {
      installed: 0,
      curated: 0,
      experimental: 0,
      custom: 0,
      system: 0,
    }

    for (const node of skillNodes) {
      groupedCounts[node.groupId] += 1
    }

    return {
      ...props.graph,
      nodes,
      edges,
      stats: {
        totalSkills: skillNodes.length,
        installedCount: skillNodes.filter((node) => node.isInstalled).length,
        systemCount: skillNodes.filter((node) => node.source === "system").length,
        groupedCounts,
      },
    }
  }, [props.allowedSkillIds, props.graph])

  const nodes = useMemo<Node[]>(() => {
    const byGroup = new Map<SkillGraphGroupId, number>()

    return filteredGraph.nodes.map((node) => {
      if (node.nodeType === "group") {
        const column = groupColumn(node.groupId)
        const isActiveGroup = props.activeGroupId === node.groupId
        const isDimmed = Boolean(props.activeGroupId && !isActiveGroup)
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
            border: isActiveGroup ? "2px solid rgba(14, 116, 144, 0.85)" : "1px solid rgba(30, 41, 59, 0.15)",
            background: isActiveGroup ? "rgba(14, 116, 144, 0.14)" : "rgba(248, 250, 252, 0.9)",
            color: "#0f172a",
            padding: 10,
            opacity: isDimmed ? 0.42 : 1,
          },
        }
      }

      const current = byGroup.get(node.groupId) || 0
      byGroup.set(node.groupId, current + 1)

      const selected = node.skillId === props.selectedSkillId
      const column = groupColumn(node.groupId)
      const isDimmed = Boolean(props.activeGroupId && props.activeGroupId !== node.groupId)
      const isImportable = Boolean(node.skillId && importableSkillIds.has(node.skillId))

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
              {isImportable ? (
                <span className="mt-1 inline-flex rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                  importable
                </span>
              ) : null}
            </div>
          ),
        },
        style: {
          minWidth: 220,
          borderRadius: 12,
          border: selected
            ? "2px solid rgba(6, 182, 212, 0.9)"
            : isImportable
              ? "1px solid rgba(6, 182, 212, 0.45)"
              : "1px solid rgba(30, 41, 59, 0.12)",
          background: selected
            ? "rgba(6, 182, 212, 0.12)"
            : isImportable
              ? "rgba(236, 254, 255, 0.95)"
              : "rgba(255, 255, 255, 0.96)",
          color: "#0f172a",
          padding: 10,
          boxShadow: selected ? "0 0 0 2px rgba(6, 182, 212, 0.15)" : "none",
          opacity: isDimmed ? 0.48 : 1,
        },
      }
    })
  }, [filteredGraph.nodes, importableSkillIds, props.activeGroupId, props.selectedSkillId])

  const edges = useMemo<Edge[]>(() => {
    return filteredGraph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: {
        stroke: "rgba(59, 130, 246, 0.35)",
        strokeWidth: 1.3,
        opacity: (() => {
          if (!props.activeGroupId) {
            return 0.85
          }

          const sourceGroup = edge.source.replace("group:", "") as SkillGraphGroupId
          return sourceGroup === props.activeGroupId ? 0.9 : 0.28
        })(),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "rgba(59, 130, 246, 0.35)",
      },
    }))
  }, [filteredGraph.edges, props.activeGroupId])

  const handleNodeClick = (_event: unknown, node: Node) => {
    const graphNode = filteredGraph.nodes.find((item) => item.id === node.id)
    if (!graphNode) {
      return
    }

    if (graphNode.nodeType === "group") {
      props.onToggleGroup?.(graphNode.groupId)
      return
    }

    if (!graphNode.skillId) {
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
        {props.activeGroupId ? (
          <span className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-300">
            Group filter: {props.activeGroupId}
          </span>
        ) : null}
      </div>

      <FlowCanvas
        nodes={nodes}
        edges={edges}
        onNodeClick={handleNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        showMiniMap={props.showMiniMap ?? false}
        className={props.className || "h-[420px]"}
      />
    </div>
  )
}
