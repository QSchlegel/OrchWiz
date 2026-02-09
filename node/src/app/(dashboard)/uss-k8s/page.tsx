"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react"
import { useSession } from "@/lib/auth-client"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  ChevronDown,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Focus,
  Heart,
  MessageSquare,
  Monitor,
  PanelRightClose,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Signal,
  Wrench,
  Zap,
} from "lucide-react"
import { OrchestrationSurface } from "@/components/orchestration/OrchestrationSurface"
import { FlowCanvas } from "@/components/flow/FlowCanvas"
import {
  K8sNode,
  ObservabilityNode,
  RuntimeNode,
  StationNode,
  SystemNode,
} from "@/components/flow/nodes"
import { buildSubsystemEdgesFiltered, mapSubsystemToNodes } from "@/lib/flow/mappers"
import {
  clearNodePositions,
  layoutUssK8sTopology,
  mergeCustomPositions,
  readNodePositions,
  writeNodePositions,
} from "@/lib/uss-k8s/layout"
import {
  GROUP_ORDER,
  SUBSYSTEM_GROUP_CONFIG,
  USS_K8S_COMMAND_HIERARCHY,
  USS_K8S_COMMAND_TIER_BY_NODE,
  USS_K8S_COMPONENTS,
  USS_K8S_EDGES,
  type EdgeType,
  type SubsystemGroup,
  type TopologyComponent,
} from "@/lib/uss-k8s/topology"
import { LoadingSkeleton } from "@/components/uss-k8s/LoadingSkeleton"
import { BridgeCrewCard } from "@/components/uss-k8s/BridgeCrewCard"
import {
  ComponentDetailPanel,
  DEFAULT_NODE_DRILLDOWN_CONFIG,
  type NodeDrilldownConfig,
} from "@/components/uss-k8s/ComponentDetailPanel"
import { TopologyControls } from "@/components/uss-k8s/TopologyControls"
import { DockableWindow } from "@/components/uss-k8s/DockableWindow"
import { FocusModeDock } from "@/components/uss-k8s/FocusModeDock"
import { FocusModeDrawer } from "@/components/uss-k8s/FocusModeDrawer"
import {
  addDockWindow,
  readDockWindows,
  removeDockWindow,
  WINDOW_DOCK_RESTORE_EVENT,
  type DockRestoreEventDetail,
  type DockScope,
} from "@/lib/window-dock"
import { applyNodeChanges, type Node, type NodeChange, type ReactFlowInstance, type XYPosition } from "reactflow"

const nodeTypes = {
  stationNode: StationNode,
  systemNode: SystemNode,
  observabilityNode: ObservabilityNode,
  k8sNode: K8sNode,
  runtimeNode: RuntimeNode,
}

const groupIcons: Record<SubsystemGroup, React.ElementType> = {
  users: MessageSquare,
  bridge: Bot,
  openclaw: Zap,
  obs: Eye,
  k8s: Cpu,
}

const componentIcons: Record<string, React.ElementType> = {
  qs: MessageSquare,
  ui: Monitor,
  xo: Shield,
  ops: Settings,
  eng: Wrench,
  sec: Shield,
  med: Heart,
  cou: Radio,
  gw: Zap,
  cron: Activity,
  state: Server,
  lf: Eye,
  ch: Server,
  loki: BarChart3,
  prom: Activity,
  graf: BarChart3,
  evt: Signal,
  app: Cpu,
  nodes: Cpu,
}

const ALL_EDGE_TYPES = new Set<EdgeType>(["control", "data", "telemetry", "alert"])

const EDGE_TYPE_BY_LINK = new Map(
  USS_K8S_EDGES.map((edge) => [`${edge.source}->${edge.target}`, edge.edgeType] as const),
)

const COMMAND_TIER_CLASSES: Record<number, string> = {
  1: "border-amber-500/45 bg-amber-500/12 text-amber-700 dark:border-amber-300/45 dark:text-amber-100",
  2: "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-100",
  3: "border-sky-500/45 bg-sky-500/12 text-sky-700 dark:border-sky-300/45 dark:text-sky-100",
  4: "border-emerald-500/45 bg-emerald-500/12 text-emerald-700 dark:border-emerald-300/45 dark:text-emerald-100",
  5: "border-rose-500/45 bg-rose-500/12 text-rose-700 dark:border-rose-300/45 dark:text-rose-100",
  6: "border-violet-500/45 bg-violet-500/12 text-violet-700 dark:border-violet-300/45 dark:text-violet-100",
}

const floatingPanelClass =
  "rounded-xl border border-slate-300/75 bg-white/88 shadow-[0_10px_28px_rgba(15,23,42,0.18)] backdrop-blur-lg dark:border-white/12 dark:bg-slate-950/78"

type MobileSection = "topology" | "detail" | "crew" | "observability"
type DesktopWindowId = "hierarchy" | "operator" | "crew" | "detail" | "legend"

interface DesktopWindowState {
  x: number
  y: number
  width: number
  minHeight: number
  z: number
  collapsed: boolean
}

interface DesktopWindowMeta {
  subtitle: string
  title: string
}

const MOBILE_SECTIONS: { key: MobileSection; label: string; icon: React.ElementType }[] = [
  { key: "topology", label: "Topology", icon: Cpu },
  { key: "detail", label: "Detail", icon: Activity },
  { key: "crew", label: "Crew", icon: Bot },
  { key: "observability", label: "Observability", icon: Eye },
]

const WINDOW_DOCK_SCOPE: DockScope = "uss-k8s"

const DESKTOP_WINDOW_META: Record<DesktopWindowId, DesktopWindowMeta> = {
  hierarchy: { subtitle: "Command Context", title: "Command Hierarchy" },
  operator: { subtitle: "Bridge Operator", title: "Bridge Runtime Status" },
  crew: { subtitle: "Command Context", title: "Bridge Crew" },
  detail: { subtitle: "Selected Component", title: "Component Detail" },
  legend: { subtitle: "Topology Workspace", title: "Topology Group Legend" },
}

const FOCUS_DOCK_ITEMS: { id: DesktopWindowId; icon: React.ElementType; label: string }[] = [
  { id: "hierarchy", icon: Activity, label: "Command Hierarchy" },
  { id: "operator", icon: Shield, label: "Bridge Runtime Status" },
  { id: "crew", icon: Bot, label: "Bridge Crew" },
  { id: "detail", icon: Cpu, label: "Component Detail" },
  { id: "legend", icon: Eye, label: "Topology Group Legend" },
]

function isDesktopWindowId(value: string): value is DesktopWindowId {
  return value === "hierarchy" || value === "operator" || value === "crew" || value === "detail" || value === "legend"
}

function createInitialDesktopWindows(stageWidth: number, stageHeight: number): Record<DesktopWindowId, DesktopWindowState> {
  const hierarchyWidth = Math.max(620, Math.min(920, stageWidth - 420))
  const operatorWidth = 360
  const crewWidth = 332
  const detailWidth = 360
  const legendWidth = Math.max(420, Math.min(700, stageWidth - 120))

  return {
    hierarchy: { x: 16, y: 16, width: hierarchyWidth, minHeight: 120, z: 3, collapsed: false },
    operator: { x: Math.max(16, stageWidth - operatorWidth - 16), y: 16, width: operatorWidth, minHeight: 220, z: 4, collapsed: false },
    crew: { x: 16, y: 160, width: crewWidth, minHeight: Math.max(320, stageHeight - 176), z: 5, collapsed: false },
    detail: { x: Math.max(16, stageWidth - detailWidth - 16), y: 250, width: detailWidth, minHeight: Math.max(320, stageHeight - 266), z: 6, collapsed: false },
    legend: {
      x: Math.max(16, (stageWidth - legendWidth) / 2),
      y: Math.max(16, stageHeight - 72),
      width: legendWidth,
      minHeight: 64,
      z: 2,
      collapsed: false,
    },
  }
}

function formatStardate(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  const day = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
  return `${date.getFullYear()}.${String(day).padStart(3, "0")}`
}

export default function UssK8sPage() {
  const { data: session } = useSession()
  const [components, setComponents] = useState<TopologyComponent[]>(USS_K8S_COMPONENTS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null)
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<EdgeType>>(ALL_EDGE_TYPES)
  const [nodePositionOverrides, setNodePositionOverrides] = useState<Record<string, XYPosition>>(() =>
    typeof window !== "undefined" ? readNodePositions() : {},
  )
  const [searchTerm, setSearchTerm] = useState("")
  const [isCrewContextOpen, setIsCrewContextOpen] = useState(true)
  const [isObservabilityContextOpen, setIsObservabilityContextOpen] = useState(true)
  const [activeGroupFilter, setActiveGroupFilter] = useState<SubsystemGroup | null>(null)
  const [mobileSection, setMobileSection] = useState<MobileSection>("topology")
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem("orchwiz:uss-k8s-focus-mode") === "true"
  })
  const [focusDrawerId, setFocusDrawerId] = useState<DesktopWindowId | null>(null)
  const reactFlowRef = useRef<ReactFlowInstance | null>(null)
  const desktopStageRef = useRef<HTMLDivElement | null>(null)
  const draggingWindowRef = useRef<{
    id: DesktopWindowId
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const dockSyncedRef = useRef(false)
  const windowsSeededRef = useRef(false)
  const [desktopStageSize, setDesktopStageSize] = useState({ width: 1360, height: 820 })
  const [desktopWindows, setDesktopWindows] = useState<Record<DesktopWindowId, DesktopWindowState>>(() =>
    createInitialDesktopWindows(1360, 820),
  )
  const [activeWindowId, setActiveWindowId] = useState<DesktopWindowId>("detail")

  const loadTopology = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/uss-k8s/topology")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      if (Array.isArray(data.components)) {
        setComponents(data.components)
      }
    } catch (err) {
      console.error("Failed to load uss-k8s topology:", err)
      setError("Failed to load topology data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTopology()
  }, [loadTopology])

  useEffect(() => {
    const WINDOW_IDS: DesktopWindowId[] = ["hierarchy", "operator", "crew", "detail", "legend"]

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.key === "Escape") {
        if (focusDrawerId) {
          setFocusDrawerId(null)
          return
        }
        setSelectedId(null)
        setHighlightNodeId(null)
        return
      }

      // Cmd/Ctrl + 0: toggle focus mode
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault()
        toggleFocusMode()
        return
      }

      // Cmd/Ctrl + 1-5: toggle windows
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "5") {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        const windowId = WINDOW_IDS[index]
        if (!windowId) return

        if (focusMode) {
          setFocusDrawerId((prev) => (prev === windowId ? null : windowId))
        } else {
          const ws = desktopWindows[windowId]
          if (ws.collapsed) {
            restoreDesktopWindow(windowId)
          } else {
            collapseDesktopWindow(windowId)
          }
        }
        return
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [focusMode, focusDrawerId, desktopWindows, collapseDesktopWindow, restoreDesktopWindow, toggleFocusMode])

  const focusDesktopWindow = useCallback((id: DesktopWindowId) => {
    setDesktopWindows((previous) => {
      const maxZ = Math.max(...Object.values(previous).map((windowState) => windowState.z))
      return {
        ...previous,
        [id]: {
          ...previous[id],
          z: maxZ + 1,
        },
      }
    })
    setActiveWindowId(id)
  }, [])

  const restoreDesktopWindow = useCallback((id: DesktopWindowId) => {
    setDesktopWindows((previous) => {
      const maxZ = Math.max(...Object.values(previous).map((windowState) => windowState.z))
      return {
        ...previous,
        [id]: {
          ...previous[id],
          collapsed: false,
          z: maxZ + 1,
        },
      }
    })
    setActiveWindowId(id)
    removeDockWindow(WINDOW_DOCK_SCOPE, id)
  }, [])

  const collapseDesktopWindow = useCallback((id: string) => {
    if (!isDesktopWindowId(id)) return
    setDesktopWindows((previous) => ({
      ...previous,
      [id]: {
        ...previous[id],
        collapsed: true,
      },
    }))
    addDockWindow({
      scope: WINDOW_DOCK_SCOPE,
      id,
      label: DESKTOP_WINDOW_META[id].title,
    })
  }, [])

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev
      window.localStorage.setItem("orchwiz:uss-k8s-focus-mode", String(next))
      if (next) setFocusDrawerId(null)
      return next
    })
  }, [])

  const hideAllWindows = useCallback(() => {
    const ids: DesktopWindowId[] = ["hierarchy", "operator", "crew", "detail", "legend"]
    for (const id of ids) collapseDesktopWindow(id)
  }, [collapseDesktopWindow])

  const showAllWindows = useCallback(() => {
    const ids: DesktopWindowId[] = ["hierarchy", "operator", "crew", "detail", "legend"]
    for (const id of ids) restoreDesktopWindow(id)
  }, [restoreDesktopWindow])

  const handleWindowDragStart = useCallback((id: string, event: PointerEvent<HTMLDivElement>) => {
    if (!isDesktopWindowId(id)) return
    if (event.button !== 0) return

    const windowState = desktopWindows[id]
    if (!windowState) return

    focusDesktopWindow(id)
    draggingWindowRef.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: windowState.x,
      originY: windowState.y,
    }
  }, [desktopWindows, focusDesktopWindow])

  const handleWindowFocus = useCallback((id: string) => {
    if (!isDesktopWindowId(id)) return
    focusDesktopWindow(id)
  }, [focusDesktopWindow])

  useEffect(() => {
    const stage = desktopStageRef.current
    if (!stage) return

    const syncStageBounds = () => {
      const rect = stage.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      const width = Math.round(rect.width)
      const height = Math.round(rect.height)
      setDesktopStageSize({ width, height })

      setDesktopWindows((previous) => {
        const seed = windowsSeededRef.current ? previous : createInitialDesktopWindows(width, height)
        windowsSeededRef.current = true
        const next = { ...seed }

        ;(Object.keys(next) as DesktopWindowId[]).forEach((id) => {
          const maxWidth = Math.max(280, width - 32)
          const boundedWidth = Math.min(next[id].width, maxWidth)
          const maxX = Math.max(16, width - boundedWidth - 16)
          const maxY = Math.max(16, height - 64)

          next[id] = {
            ...next[id],
            width: boundedWidth,
            x: Math.min(Math.max(16, next[id].x), maxX),
            y: Math.min(Math.max(16, next[id].y), maxY),
          }
        })

        return next
      })
    }

    syncStageBounds()
    const observer = new ResizeObserver(syncStageBounds)
    observer.observe(stage)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const dockedWindows = readDockWindows(WINDOW_DOCK_SCOPE)
    if (dockSyncedRef.current || dockedWindows.length === 0) {
      dockSyncedRef.current = true
      return
    }

    setDesktopWindows((previous) => {
      const next = { ...previous }
      for (const dockItem of dockedWindows) {
        if (isDesktopWindowId(dockItem.id)) {
          next[dockItem.id] = {
            ...next[dockItem.id],
            collapsed: true,
          }
        }
      }
      return next
    })

    dockSyncedRef.current = true
  }, [])

  useEffect(() => {
    const handleWindowRestore = (event: Event) => {
      const detail = (event as CustomEvent<DockRestoreEventDetail>).detail
      if (!detail || detail.scope !== WINDOW_DOCK_SCOPE || !isDesktopWindowId(detail.id)) return
      restoreDesktopWindow(detail.id)
    }

    window.addEventListener(WINDOW_DOCK_RESTORE_EVENT, handleWindowRestore as EventListener)
    return () => {
      window.removeEventListener(WINDOW_DOCK_RESTORE_EVENT, handleWindowRestore as EventListener)
    }
  }, [restoreDesktopWindow])

  useEffect(() => {
    const handleWindowDragMove = (event: globalThis.PointerEvent) => {
      const dragState = draggingWindowRef.current
      if (!dragState) return

      const deltaX = event.clientX - dragState.startX
      const deltaY = event.clientY - dragState.startY
      setDesktopWindows((previous) => {
        const current = previous[dragState.id]
        if (!current) return previous

        const maxX = Math.max(16, desktopStageSize.width - current.width - 16)
        const maxY = Math.max(16, desktopStageSize.height - 64)
        const nextX = Math.min(Math.max(16, dragState.originX + deltaX), maxX)
        const nextY = Math.min(Math.max(16, dragState.originY + deltaY), maxY)
        if (nextX === current.x && nextY === current.y) return previous

        return {
          ...previous,
          [dragState.id]: {
            ...current,
            x: nextX,
            y: nextY,
          },
        }
      })
    }

    const handleWindowDragEnd = () => {
      draggingWindowRef.current = null
    }

    window.addEventListener("pointermove", handleWindowDragMove)
    window.addEventListener("pointerup", handleWindowDragEnd)
    window.addEventListener("pointercancel", handleWindowDragEnd)

    return () => {
      window.removeEventListener("pointermove", handleWindowDragMove)
      window.removeEventListener("pointerup", handleWindowDragEnd)
      window.removeEventListener("pointercancel", handleWindowDragEnd)
    }
  }, [desktopStageSize.height, desktopStageSize.width])

  const filteredComponents = useMemo(() => {
    let result = components

    if (activeGroupFilter) {
      result = result.filter((c) => c.group === activeGroupFilter)
    }

    if (!searchTerm.trim()) return result

    const term = searchTerm.toLowerCase()
    return result.filter(
      (c) =>
        c.label.toLowerCase().includes(term) ||
        c.sublabel?.toLowerCase().includes(term) ||
        c.id.toLowerCase().includes(term),
    )
  }, [components, searchTerm, activeGroupFilter])

  const topologyNodes = useMemo(() => {
    const mappedNodes = GROUP_ORDER.flatMap((groupKey) =>
      mapSubsystemToNodes(
        filteredComponents.filter((component) => component.group === groupKey).map((component) => ({
          ...component,
          status: component.status || "nominal",
        })),
        selectedId || undefined,
        { visualVariant: "uss-k8s" },
      ),
    )

    const layouted = layoutUssK8sTopology(mappedNodes)
    return mergeCustomPositions(layouted, nodePositionOverrides)
  }, [filteredComponents, selectedId, nodePositionOverrides])

  const topologyEdges = useMemo(() => {
    const edges = buildSubsystemEdgesFiltered(USS_K8S_EDGES, visibleEdgeTypes, highlightNodeId)

    return edges.map((edge) => {
      const edgeType = EDGE_TYPE_BY_LINK.get(`${edge.source}->${edge.target}`)
      const sourceTier = USS_K8S_COMMAND_TIER_BY_NODE[edge.source]
      const targetTier = USS_K8S_COMMAND_TIER_BY_NODE[edge.target]
      const isConnected = !highlightNodeId || edge.source === highlightNodeId || edge.target === highlightNodeId
      const isHierarchyControlEdge =
        edgeType === "control" &&
        sourceTier !== undefined &&
        targetTier !== undefined &&
        sourceTier <= targetTier &&
        isConnected

      if (!isHierarchyControlEdge) return edge

      const baseWidth = typeof edge.style?.strokeWidth === "number" ? edge.style.strokeWidth : 1.8
      return {
        ...edge,
        style: {
          ...edge.style,
          strokeWidth: baseWidth + 0.65,
          filter: "drop-shadow(0 0 4px rgba(34,211,238,0.35))",
        },
      }
    })
  }, [visibleEdgeTypes, highlightNodeId])

  const handleNodeClick = (_: unknown, node: Node) => {
    setSelectedId(node.id)
    setHighlightNodeId(node.id)
    restoreDesktopWindow("detail")
  }

  const handlePaneClick = useCallback(() => {
    setSelectedId(null)
    setHighlightNodeId(null)
  }, [])

  const handleFlowInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance
  }, [])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Only process position changes from dragging
      const positionChanges = changes.filter(
        (c): c is NodeChange & { type: "position"; id: string; position?: XYPosition } =>
          c.type === "position" && "position" in c && c.position !== undefined,
      )
      if (positionChanges.length === 0) return

      setNodePositionOverrides((prev) => {
        const next = { ...prev }
        for (const change of positionChanges) {
          if (change.position) {
            next[change.id] = change.position
          }
        }
        return next
      })
    },
    [],
  )

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node) => {
      // Persist all custom positions to localStorage after drag ends
      setNodePositionOverrides((current) => {
        writeNodePositions(current)
        return current
      })
    },
    [],
  )

  const handleResetNodeLayout = useCallback(() => {
    setNodePositionOverrides({})
    clearNodePositions()
  }, [])

  const panToNode = useCallback((nodeId: string) => {
    const instance = reactFlowRef.current
    if (!instance) return
    const targetNode = instance.getNodes().find((n) => n.id === nodeId)
    if (!targetNode) return
    instance.setCenter(
      targetNode.position.x + 80,
      targetNode.position.y + 40,
      { zoom: 1.1, duration: 600 },
    )
  }, [])

  const handleEdgeTypeToggle = (type: EdgeType) => {
    setVisibleEdgeTypes((previous) => {
      const next = new Set(previous)
      if (next.has(type)) {
        if (next.size > 1) next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const selected = useMemo(() => {
    return components.find((component) => component.id === selectedId) || null
  }, [components, selectedId])

  const bridgeCrew = useMemo(() => {
    return components.filter((component) => component.group === "bridge")
  }, [components])

  const observabilityComponents = useMemo(() => {
    return components.filter((component) => component.group === "obs")
  }, [components])

  const subsystemCounts = useMemo(
    () =>
      GROUP_ORDER.map((groupKey) => {
        const count = components.filter((component) => component.group === groupKey).length
        return { groupKey, count }
      }),
    [components],
  )

  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const edge of USS_K8S_EDGES) {
      counts[edge.source] = (counts[edge.source] || 0) + 1
      counts[edge.target] = (counts[edge.target] || 0) + 1
    }

    return counts
  }, [])

  const stardate = formatStardate(new Date())
  const operatorLabel = session?.user?.email || "Operator"
  const hasFilteredResults = filteredComponents.length > 0
  const hasActiveSearch = Boolean(searchTerm.trim())

  const activeHierarchyTier = useMemo(() => {
    if (highlightNodeId && USS_K8S_COMMAND_TIER_BY_NODE[highlightNodeId]) {
      return USS_K8S_COMMAND_TIER_BY_NODE[highlightNodeId]
    }
    if (selectedId && USS_K8S_COMMAND_TIER_BY_NODE[selectedId]) {
      return USS_K8S_COMMAND_TIER_BY_NODE[selectedId]
    }
    return null
  }, [highlightNodeId, selectedId])

  const selectAndHighlight = useCallback((id: string) => {
    setSelectedId(id)
    setHighlightNodeId(id)
    panToNode(id)
    restoreDesktopWindow("detail")
  }, [panToNode, restoreDesktopWindow])

  const selectAndHighlightMobile = useCallback((id: string) => {
    selectAndHighlight(id)
    setMobileSection("detail")
  }, [selectAndHighlight])

  const highlightLabel = useMemo(() => {
    if (!highlightNodeId) return null
    return components.find((c) => c.id === highlightNodeId)?.label || highlightNodeId
  }, [highlightNodeId, components])

  const hasActiveFilters = useMemo(() => {
    return (
      Boolean(searchTerm.trim()) ||
      visibleEdgeTypes.size !== ALL_EDGE_TYPES.size ||
      highlightNodeId !== null ||
      selectedId !== null ||
      activeGroupFilter !== null
    )
  }, [searchTerm, visibleEdgeTypes, highlightNodeId, selectedId, activeGroupFilter])

  const handleResetAll = useCallback(() => {
    setSearchTerm("")
    setVisibleEdgeTypes(ALL_EDGE_TYPES)
    setHighlightNodeId(null)
    setSelectedId(null)
    setActiveGroupFilter(null)
  }, [])

  const hierarchyPanel = (
    <div className="rounded-lg border border-slate-300/75 bg-white/72 px-3 py-3 dark:border-white/12 dark:bg-white/[0.03]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="readout text-slate-700 dark:text-slate-300">Command Hierarchy</span>
        <span className="readout text-slate-600 dark:text-slate-400">
          {activeHierarchyTier ? `Focused C${activeHierarchyTier}` : "Select a tier"}
        </span>
      </div>
      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {USS_K8S_COMMAND_HIERARCHY.map((tier) => {
          const isActive = activeHierarchyTier === tier.tier
          const anchorNodeId = tier.nodeIds[0]

          return (
            <button
              key={tier.tier}
              type="button"
              onClick={() => selectAndHighlight(anchorNodeId)}
              className={`flex min-h-[34px] shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
                isActive
                  ? COMMAND_TIER_CLASSES[tier.tier]
                  : "border-slate-300/75 bg-white/70 text-slate-700 hover:border-slate-400 hover:bg-white dark:border-white/12 dark:bg-transparent dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/[0.06]"
              }`}
              title={tier.description}
            >
              <span className={`readout rounded border px-1 py-0.5 ${COMMAND_TIER_CLASSES[tier.tier]}`}>
                C{tier.tier}
              </span>
              <span className="text-[12px] font-medium">{tier.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const groupLegend = (
    <div className="flex items-center gap-3 overflow-x-auto pb-1.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
      {GROUP_ORDER.map((groupKey) => {
        const config = SUBSYSTEM_GROUP_CONFIG[groupKey]
        const isActive = activeGroupFilter === groupKey

        return (
          <button
            key={groupKey}
            type="button"
            onClick={() => setActiveGroupFilter((prev) => (prev === groupKey ? null : groupKey))}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
              isActive
                ? `border ${config.borderColor} ${config.bgColor}`
                : "border border-transparent hover:border-slate-300/50 hover:bg-white/50 dark:hover:border-white/10 dark:hover:bg-white/[0.04]"
            }`}
          >
            <span className={`h-2 w-2 rounded-sm border ${config.bgColor} ${config.borderColor}`} />
            <span className="readout text-slate-700 dark:text-slate-300">{config.label}</span>
          </button>
        )
      })}
    </div>
  )

  const renderObservabilityList = (onSelect: (id: string) => void) => (
    <div className="space-y-2.5">
      {observabilityComponents.map((component) => {
        const isSelected = component.id === selectedId
        const Icon = componentIcons[component.id] || Eye

        return (
          <button
            key={component.id}
            type="button"
            onClick={() => onSelect(component.id)}
            className={`group relative w-full overflow-hidden rounded-lg border text-left transition-all duration-200 ${
              isSelected
                ? "border-violet-500/45 bg-gradient-to-r from-violet-500/12 to-transparent surface-glow-violet dark:border-violet-300/55 dark:from-violet-500/[0.16]"
                : "border-slate-300/75 bg-white/75 hover:border-violet-500/35 hover:bg-violet-50/70 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-violet-300/35 dark:hover:bg-white/[0.06]"
            }`}
          >
            <div
              className={`absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-sm bg-violet-400 transition-opacity duration-200 ${
                isSelected ? "opacity-100" : "opacity-35 group-hover:opacity-55"
              }`}
            />

            <div className="pl-4 pr-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex items-center gap-2.5">
                  <div
                    className={`rounded-md p-1.5 transition-colors duration-200 ${
                      isSelected
                        ? "bg-violet-500/15 dark:bg-violet-500/[0.16]"
                        : "bg-slate-200/70 group-hover:bg-violet-100 dark:bg-white/[0.06] dark:group-hover:bg-violet-500/10"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 ${
                        isSelected
                          ? "text-violet-700 dark:text-violet-100"
                          : "text-slate-600 group-hover:text-violet-600 dark:text-slate-300 dark:group-hover:text-violet-200"
                      }`}
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-mono)] text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                      {component.label}
                    </p>
                    <p className="mt-0.5 truncate text-[10.5px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      {component.sublabel}
                    </p>
                  </div>
                </div>

                <div className="ml-2 flex shrink-0 items-center gap-2">
                  {(connectionCounts[component.id] || 0) > 0 && (
                    <span
                      className={`readout rounded-md px-1.5 py-0.5 ${
                        isSelected
                          ? "bg-violet-500/20 text-violet-700 dark:text-violet-100"
                          : "bg-slate-200/80 text-slate-700 dark:bg-white/[0.08] dark:text-slate-200"
                      }`}
                    >
                      {connectionCounts[component.id]}
                    </span>
                  )}
                  <span
                    className={`h-2 w-2 rounded-full transition-shadow duration-300 ${
                      isSelected ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]" : "bg-emerald-400/70"
                    }`}
                  />
                </div>
              </div>
            </div>
          </button>
        )
      })}

      <div className="relative overflow-hidden rounded-lg border border-rose-400/35 bg-rose-500/[0.08] p-3.5">
        <div className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-sm bg-rose-400/70" />
        <div className="pl-2">
          <div className="readout mb-2 flex items-center gap-2 text-rose-700 dark:text-rose-200">
            <AlertTriangle className="h-3 w-3" />
            Alert Feedback Loop
          </div>
          <p className="font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-slate-800 dark:text-slate-200">
            Grafana → ENG-GEO → incident notes + action requests → XO-CB01
          </p>
        </div>
      </div>
    </div>
  )

  const desktopWindowStyles = useMemo<Record<DesktopWindowId, CSSProperties>>(() => {
    const crewHeight = Math.max(desktopWindows.crew.minHeight, desktopStageSize.height - desktopWindows.crew.y - 16)
    const detailHeight = Math.max(desktopWindows.detail.minHeight, desktopStageSize.height - desktopWindows.detail.y - 16)

    return {
      hierarchy: {
        left: desktopWindows.hierarchy.x,
        top: desktopWindows.hierarchy.y,
        width: desktopWindows.hierarchy.width,
        zIndex: desktopWindows.hierarchy.z,
      },
      operator: {
        left: desktopWindows.operator.x,
        top: desktopWindows.operator.y,
        width: desktopWindows.operator.width,
        zIndex: desktopWindows.operator.z,
      },
      crew: {
        left: desktopWindows.crew.x,
        top: desktopWindows.crew.y,
        width: desktopWindows.crew.width,
        height: crewHeight,
        zIndex: desktopWindows.crew.z,
      },
      detail: {
        left: desktopWindows.detail.x,
        top: desktopWindows.detail.y,
        width: desktopWindows.detail.width,
        height: detailHeight,
        zIndex: desktopWindows.detail.z,
      },
      legend: {
        left: desktopWindows.legend.x,
        top: desktopWindows.legend.y,
        width: desktopWindows.legend.width,
        zIndex: desktopWindows.legend.z,
      },
    }
  }, [desktopStageSize.height, desktopWindows])

  if (isLoading) {
    return <LoadingSkeleton />
  }

  return (
    <main className="uss-k8s-page relative flex min-h-[calc(100dvh-var(--theme-footer-height)-3.5rem)] flex-col overflow-y-auto overflow-x-hidden xl:h-full xl:min-h-0 xl:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="uss-orb-cyan orb-breathe absolute -left-16 -top-24 h-80 w-80 rounded-full blur-[100px]" />
        <div className="uss-orb-violet orb-breathe-alt absolute -right-24 top-1/2 h-96 w-96 rounded-full blur-[120px]" />
        <div className="uss-orb-rose orb-breathe-slow absolute bottom-0 left-1/3 h-72 w-72 rounded-full blur-[80px]" />
      </div>

      <div className="pointer-events-none absolute inset-0 bridge-grid opacity-15" />
      <div className="pointer-events-none absolute inset-0 bridge-scanlines opacity-[0.1]" />
      <div className="pointer-events-none absolute inset-0 bridge-vignette" />

      <div className="sticky top-0 z-30 border-b border-slate-300/70 bg-white/86 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
        <div className="mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div>
              <p className="readout text-cyan-700 dark:text-cyan-300">Topology Workspace</p>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                USS-K8S Architecture Topology
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="readout text-slate-700 dark:text-slate-300">
                {filteredComponents.length === components.length
                  ? `${components.length} Components`
                  : `${filteredComponents.length} / ${components.length}`}
              </span>

              {/* Desktop window controls */}
              <div className="hidden items-center gap-1 xl:flex">
                <button
                  type="button"
                  onClick={toggleFocusMode}
                  title={focusMode ? "Exit focus mode (⌘0)" : "Focus mode (⌘0)"}
                  className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
                    focusMode
                      ? "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:border-cyan-300/40 dark:text-cyan-200"
                      : "border-slate-300/70 bg-white/70 text-slate-600 hover:border-slate-400 hover:text-slate-800 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-slate-200"
                  }`}
                >
                  <Focus className="h-3 w-3" />
                  {focusMode ? "Exit Focus" : "Focus"}
                </button>
                {!focusMode && (
                  <>
                    <button
                      type="button"
                      onClick={showAllWindows}
                      title="Show all panels"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300/70 bg-white/70 text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-slate-200 dark:focus-visible:ring-cyan-400/60"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={hideAllWindows}
                      title="Hide all panels"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300/70 bg-white/70 text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-slate-200 dark:focus-visible:ring-cyan-400/60"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <TopologyControls
              visibleEdgeTypes={visibleEdgeTypes}
              onEdgeTypeToggle={handleEdgeTypeToggle}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              highlightNodeId={highlightNodeId}
              highlightLabel={highlightLabel}
              onClearHighlight={() => {
                setHighlightNodeId(null)
              }}
              onResetAll={handleResetAll}
              hasActiveFilters={hasActiveFilters}
              hasCustomLayout={Object.keys(nodePositionOverrides).length > 0}
              onResetLayout={handleResetNodeLayout}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 px-4 pb-4 pt-3 sm:px-6 sm:pb-4 lg:px-8">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] flex-col">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-rose-400/45 bg-rose-50/90 px-4 py-3 dark:border-rose-400/35 dark:bg-rose-500/10">
              <div className="flex items-center gap-2.5 text-rose-700 dark:text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-[13px] font-medium">{error}</span>
              </div>
              <button
                type="button"
                onClick={loadTopology}
                className="readout flex items-center gap-1.5 rounded-md border border-rose-400/50 bg-rose-500/10 px-3 py-1.5 text-rose-700 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 dark:border-rose-300/35 dark:text-rose-100"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}

          <div className="xl:flex xl:min-h-0 xl:flex-1 xl:flex-col">
            <section ref={desktopStageRef} className="relative hidden xl:min-h-0 xl:flex-1 xl:block">
              <div className="relative h-full min-h-0">
                <div className="absolute inset-0 overflow-hidden">
                  {hasFilteredResults ? (
                    <FlowCanvas
                      nodes={topologyNodes}
                      edges={topologyEdges}
                      nodeTypes={nodeTypes}
                      onNodeClick={handleNodeClick}
                      onPaneClick={handlePaneClick}
                      onInit={handleFlowInit}
                      onNodesChange={handleNodesChange}
                      onNodeDragStop={handleNodeDragStop}
                      showMiniMap
                      className="h-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6">
                      <div className="max-w-md rounded-xl border border-slate-300/75 bg-white/90 p-5 text-center dark:border-white/12 dark:bg-slate-950/78">
                        <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100">
                          {hasActiveSearch ? "No components match your search." : "No topology components available."}
                        </p>
                        <p className="mt-2 text-[12px] text-slate-700 dark:text-slate-300">
                          {hasActiveSearch
                            ? "Adjust the search term or clear the filter to view the full architecture map."
                            : "Reload topology data to repopulate the architecture map."}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                          {hasActiveSearch && (
                            <button
                              type="button"
                              onClick={() => setSearchTerm("")}
                              className="readout rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-cyan-700 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/45 dark:text-cyan-100 dark:focus-visible:ring-cyan-400/60"
                            >
                              Clear Search
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={loadTopology}
                            className="readout rounded-md border border-slate-400/45 bg-white/70 px-3 py-1.5 text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200"
                          >
                            Reload Topology
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pointer-events-none absolute inset-0">
                  {focusMode ? (
                    <>
                      <FocusModeDock
                        items={FOCUS_DOCK_ITEMS}
                        activeId={focusDrawerId}
                        onSelect={(id) => setFocusDrawerId((prev) => (prev === id ? null : id) as DesktopWindowId)}
                      />
                      <FocusModeDrawer
                        title={focusDrawerId ? DESKTOP_WINDOW_META[focusDrawerId].title : ""}
                        subtitle={focusDrawerId ? DESKTOP_WINDOW_META[focusDrawerId].subtitle : ""}
                        isOpen={focusDrawerId !== null}
                        onClose={() => setFocusDrawerId(null)}
                      >
                        {focusDrawerId === "hierarchy" && hierarchyPanel}
                        {focusDrawerId === "operator" && (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="readout text-cyan-700 dark:text-cyan-300">Bridge Operator</span>
                              <span className="readout text-slate-700 dark:text-slate-300">SD {stardate}</span>
                            </div>
                            <p className="mt-1.5 truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{operatorLabel}</p>
                            <div className="bridge-divider my-3" />
                            <div className="space-y-2">
                              {subsystemCounts.map(({ groupKey, count }) => {
                                const config = SUBSYSTEM_GROUP_CONFIG[groupKey]
                                const Icon = groupIcons[groupKey]
                                return (
                                  <div
                                    key={groupKey}
                                    className="flex items-center gap-2.5 rounded-md border border-slate-300/70 bg-white/72 px-2.5 py-2 dark:border-white/12 dark:bg-white/[0.04]"
                                  >
                                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                                    <span className="truncate text-[12px] text-slate-800 dark:text-slate-200">{config.label}</span>
                                    <span className="readout ml-auto rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                                      {count}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                        {focusDrawerId === "crew" && (
                          <div className="space-y-2.5">
                            {bridgeCrew.map((agent) => (
                              <BridgeCrewCard
                                key={agent.id}
                                agent={agent}
                                icon={componentIcons[agent.id] || Bot}
                                isSelected={agent.id === selectedId}
                                connectionCount={connectionCounts[agent.id] || 0}
                                onSelect={selectAndHighlight}
                              />
                            ))}
                          </div>
                        )}
                        {focusDrawerId === "detail" && (
                          <>
                            <ComponentDetailPanel
                              component={selected}
                              components={components}
                              edges={USS_K8S_EDGES}
                              componentIcons={componentIcons}
                              onHighlightNode={selectAndHighlight}
                            />
                            {isObservabilityContextOpen && <div className="mt-3">{renderObservabilityList(selectAndHighlight)}</div>}
                          </>
                        )}
                        {focusDrawerId === "legend" && groupLegend}
                      </FocusModeDrawer>
                    </>
                  ) : (
                  <>
                  {!desktopWindows.hierarchy.collapsed && (
                    <DockableWindow
                      id="hierarchy"
                      subtitle={DESKTOP_WINDOW_META.hierarchy.subtitle}
                      title={DESKTOP_WINDOW_META.hierarchy.title}
                      style={desktopWindowStyles.hierarchy}
                      bodyClassName="p-3"
                      onDragStart={handleWindowDragStart}
                      onCollapse={collapseDesktopWindow}
                      onFocus={handleWindowFocus}
                      isActive={activeWindowId === "hierarchy"}
                    >
                      {hierarchyPanel}
                    </DockableWindow>
                  )}

                  {!desktopWindows.operator.collapsed && (
                    <DockableWindow
                      id="operator"
                      subtitle={DESKTOP_WINDOW_META.operator.subtitle}
                      title={DESKTOP_WINDOW_META.operator.title}
                      style={desktopWindowStyles.operator}
                      bodyClassName="p-4"
                      onDragStart={handleWindowDragStart}
                      onCollapse={collapseDesktopWindow}
                      onFocus={handleWindowFocus}
                      isActive={activeWindowId === "operator"}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="readout text-cyan-700 dark:text-cyan-300">Bridge Operator</span>
                        <span className="readout text-slate-700 dark:text-slate-300">SD {stardate}</span>
                      </div>
                      <p className="mt-1.5 truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{operatorLabel}</p>

                      <div className="bridge-divider my-3" />

                      <div className="space-y-2">
                        {subsystemCounts.map(({ groupKey, count }) => {
                          const config = SUBSYSTEM_GROUP_CONFIG[groupKey]
                          const Icon = groupIcons[groupKey]

                          return (
                            <div
                              key={groupKey}
                              className="flex items-center gap-2.5 rounded-md border border-slate-300/70 bg-white/72 px-2.5 py-2 dark:border-white/12 dark:bg-white/[0.04]"
                            >
                              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                              <span className="truncate text-[12px] text-slate-800 dark:text-slate-200">{config.label}</span>
                              <span className="readout ml-auto rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                                {count}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </DockableWindow>
                  )}

                  {!desktopWindows.crew.collapsed && (
                    <DockableWindow
                      id="crew"
                      subtitle={DESKTOP_WINDOW_META.crew.subtitle}
                      title={DESKTOP_WINDOW_META.crew.title}
                      style={desktopWindowStyles.crew}
                      bodyClassName="h-[calc(100%-3rem)] overflow-y-auto p-4"
                      onDragStart={handleWindowDragStart}
                      onCollapse={collapseDesktopWindow}
                      onFocus={handleWindowFocus}
                      isActive={activeWindowId === "crew"}
                    >
                      <button
                        type="button"
                        onClick={() => setIsCrewContextOpen((previous) => !previous)}
                        aria-expanded={isCrewContextOpen}
                        className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60"
                      >
                        <div>
                          <p className="readout text-cyan-700 dark:text-cyan-300">Command Context</p>
                          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">Bridge Crew</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="readout rounded bg-slate-200/85 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                            {bridgeCrew.length} Agents
                          </span>
                          {isCrewContextOpen ? (
                            <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                          )}
                        </div>
                      </button>

                      {isCrewContextOpen && (
                        <div className="mt-3 space-y-2.5">
                          {bridgeCrew.map((agent) => (
                            <BridgeCrewCard
                              key={agent.id}
                              agent={agent}
                              icon={componentIcons[agent.id] || Bot}
                              isSelected={agent.id === selectedId}
                              connectionCount={connectionCounts[agent.id] || 0}
                              onSelect={selectAndHighlight}
                            />
                          ))}
                        </div>
                      )}
                    </DockableWindow>
                  )}

                  {!desktopWindows.detail.collapsed && (
                    <DockableWindow
                      id="detail"
                      subtitle={selected ? `${DESKTOP_WINDOW_META.detail.subtitle} App` : DESKTOP_WINDOW_META.detail.subtitle}
                      title={selected ? `${selected.label} Inspector` : DESKTOP_WINDOW_META.detail.title}
                      style={desktopWindowStyles.detail}
                      bodyClassName="h-[calc(100%-3rem)] overflow-y-auto p-4"
                      onDragStart={handleWindowDragStart}
                      onCollapse={collapseDesktopWindow}
                      onFocus={handleWindowFocus}
                      isActive={activeWindowId === "detail"}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="readout text-cyan-700 dark:text-cyan-300">Selected Component</p>
                          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                            Component Detail
                          </h2>
                        </div>
                        <span className="readout text-slate-700 dark:text-slate-300">
                          {selected ? SUBSYSTEM_GROUP_CONFIG[selected.group]?.label : "Select a node"}
                        </span>
                      </div>

                      <ComponentDetailPanel
                        component={selected}
                        components={components}
                        edges={USS_K8S_EDGES}
                        componentIcons={componentIcons}
                        onHighlightNode={selectAndHighlight}
                      />

                      <div className="bridge-divider mt-4" />

                      <button
                        type="button"
                        onClick={() => setIsObservabilityContextOpen((previous) => !previous)}
                        aria-expanded={isObservabilityContextOpen}
                        className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60"
                      >
                        <div>
                          <p className="readout text-cyan-700 dark:text-cyan-300">Feedback Context</p>
                          <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-50">Observability</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="readout rounded bg-slate-200/85 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                            {observabilityComponents.length} Services
                          </span>
                          {isObservabilityContextOpen ? (
                            <ChevronDown className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-700 dark:text-slate-300" />
                          )}
                        </div>
                      </button>

                      {isObservabilityContextOpen && <div className="mt-3">{renderObservabilityList(selectAndHighlight)}</div>}
                    </DockableWindow>
                  )}

                  {hasFilteredResults && !desktopWindows.legend.collapsed && (
                    <DockableWindow
                      id="legend"
                      subtitle={DESKTOP_WINDOW_META.legend.subtitle}
                      title={DESKTOP_WINDOW_META.legend.title}
                      style={desktopWindowStyles.legend}
                      bodyClassName="px-4 py-2.5"
                      onDragStart={handleWindowDragStart}
                      onCollapse={collapseDesktopWindow}
                      onFocus={handleWindowFocus}
                      isActive={activeWindowId === "legend"}
                    >
                      {groupLegend}
                    </DockableWindow>
                  )}
                  </>
                  )}
                </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 xl:hidden">
            <OrchestrationSurface
              level={4}
              className="border border-slate-300/60 bg-white/82 p-4 sm:p-5 dark:border-white/12 dark:bg-white/[0.02]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="readout text-cyan-700 dark:text-cyan-300">Bridge Operator</p>
                  <p className="text-[1.1rem] font-semibold tracking-tight text-slate-900 sm:text-[1.2rem] dark:text-slate-50">
                    {operatorLabel}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="readout rounded border border-slate-300/70 bg-white/70 px-2 py-1 text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
                    SD {stardate}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {subsystemCounts.map(({ groupKey, count }) => {
                  const config = SUBSYSTEM_GROUP_CONFIG[groupKey]
                  const Icon = groupIcons[groupKey]
                  return (
                    <div
                      key={groupKey}
                      className="flex items-center gap-2.5 rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.03]"
                    >
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      <span className="truncate text-[12px] text-slate-800 dark:text-slate-200">{config.label}</span>
                      <span className="readout ml-auto rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                        {count}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileSection("topology")}
                  className="readout rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-cyan-700 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/45 dark:text-cyan-100 dark:focus-visible:ring-cyan-400/60"
                >
                  Open Topology
                </button>
                {selected && (
                  <button
                    type="button"
                    onClick={() => setMobileSection("detail")}
                    className="flex min-w-0 items-center gap-2 rounded-md border border-slate-400/45 bg-white/70 px-3 py-1.5 text-[12px] text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200"
                  >
                    <span className="readout text-slate-600 dark:text-slate-300">Focused</span>
                    <span className="max-w-[170px] truncate font-medium text-slate-900 dark:text-slate-100">{selected.label}</span>
                  </button>
                )}
              </div>
            </OrchestrationSurface>

            <div className="z-20">
              <div className={`${floatingPanelClass} p-2`}>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {MOBILE_SECTIONS.map((section) => {
                    const Icon = section.icon
                    const active = mobileSection === section.key
                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => setMobileSection(section.key)}
                        className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:focus-visible:ring-cyan-400/60 ${
                          active
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "bg-white/80 text-slate-700 hover:bg-white dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.1]"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {section.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {mobileSection === "topology" && (
              <>
                <OrchestrationSurface
                  level={4}
                  className="border border-slate-300/60 bg-white/82 p-4 sm:p-5 dark:border-white/12 dark:bg-white/[0.02]"
                >
                  {hierarchyPanel}
                </OrchestrationSurface>

                {hasFilteredResults ? (
                  <>
                    <div className="overflow-hidden">
                      <FlowCanvas
                        nodes={topologyNodes}
                        edges={topologyEdges}
                        nodeTypes={nodeTypes}
                        onNodeClick={handleNodeClick}
                        onPaneClick={handlePaneClick}
                        onInit={handleFlowInit}
                        onNodesChange={handleNodesChange}
                        onNodeDragStop={handleNodeDragStop}
                        showMiniMap={false}
                        className="h-[clamp(320px,54vh,620px)] min-h-[320px]"
                      />
                    </div>
                    <div>{groupLegend}</div>
                  </>
                ) : (
                  <OrchestrationSurface
                    level={3}
                    className="border border-slate-300/60 bg-white/82 p-5 text-center dark:border-white/12 dark:bg-white/[0.02]"
                  >
                    <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100">
                      {hasActiveSearch ? "No components match your search." : "No topology components available."}
                    </p>
                    <p className="mt-2 text-[12px] text-slate-700 dark:text-slate-300">
                      {hasActiveSearch
                        ? "Adjust the search term or clear the filter to view the full architecture map."
                        : "Reload topology data to repopulate the architecture map."}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {hasActiveSearch && (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="readout rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-cyan-700 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/45 dark:text-cyan-100 dark:focus-visible:ring-cyan-400/60"
                        >
                          Clear Search
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={loadTopology}
                        className="readout rounded-md border border-slate-400/45 bg-white/70 px-3 py-1.5 text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200"
                      >
                        Reload Topology
                      </button>
                    </div>
                  </OrchestrationSurface>
                )}
              </>
            )}

            {mobileSection === "detail" && (
              <OrchestrationSurface
                level={4}
                className="border border-slate-300/60 bg-white/82 p-4 sm:p-5 dark:border-white/12 dark:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="readout text-cyan-700 dark:text-cyan-300">Selected Component</p>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                      Component Detail
                    </h2>
                  </div>
                  <span className="readout text-slate-700 dark:text-slate-300">
                    {selected ? SUBSYSTEM_GROUP_CONFIG[selected.group]?.label : "Select a node"}
                  </span>
                </div>

                <ComponentDetailPanel
                  component={selected}
                  components={components}
                  edges={USS_K8S_EDGES}
                  componentIcons={componentIcons}
                  onHighlightNode={selectAndHighlightMobile}
                />

                {!selected && bridgeCrew.length > 0 && (
                  <div className="mt-4">
                    <p className="readout text-slate-700 dark:text-slate-300">Quick Select</p>
                    <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {bridgeCrew.slice(0, 4).map((agent) => (
                        <button
                          key={`quick-${agent.id}`}
                          type="button"
                          onClick={() => selectAndHighlightMobile(agent.id)}
                          className="rounded-md border border-slate-300/75 bg-white/80 px-3 py-2 text-left text-[12px] text-slate-800 transition-colors hover:border-cyan-500/35 hover:bg-cyan-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:border-cyan-300/35 dark:hover:bg-white/[0.06] dark:focus-visible:ring-cyan-400/60"
                        >
                          <p className="font-medium">{agent.label}</p>
                          <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            {agent.sublabel}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </OrchestrationSurface>
            )}

            {mobileSection === "crew" && (
              <OrchestrationSurface
                level={4}
                className="border border-slate-300/60 bg-white/82 p-4 sm:p-5 dark:border-white/12 dark:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="readout text-cyan-700 dark:text-cyan-300">Command Context</p>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">Bridge Crew</h2>
                  </div>
                  <span className="readout rounded bg-slate-200/85 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                    {bridgeCrew.length} Agents
                  </span>
                </div>

                <div className="mt-3 space-y-2.5">
                  {bridgeCrew.map((agent) => (
                    <BridgeCrewCard
                      key={agent.id}
                      agent={agent}
                      icon={componentIcons[agent.id] || Bot}
                      isSelected={agent.id === selectedId}
                      connectionCount={connectionCounts[agent.id] || 0}
                      onSelect={selectAndHighlightMobile}
                    />
                  ))}
                </div>
              </OrchestrationSurface>
            )}

            {mobileSection === "observability" && (
              <OrchestrationSurface
                level={4}
                className="border border-slate-300/60 bg-white/82 p-4 sm:p-5 dark:border-white/12 dark:bg-white/[0.02]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="readout text-cyan-700 dark:text-cyan-300">Feedback Context</p>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">Observability</h2>
                  </div>
                  <span className="readout rounded bg-slate-200/85 px-1.5 py-0.5 text-slate-700 dark:bg-white/[0.1] dark:text-slate-200">
                    {observabilityComponents.length} Services
                  </span>
                </div>

                <div className="mt-3">{renderObservabilityList(selectAndHighlightMobile)}</div>
              </OrchestrationSurface>
            )}
          </section>
        </div>
      </div>
      </div>
    </main>
  )
}
