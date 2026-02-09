import type { Edge, Node } from "reactflow"
import { MarkerType } from "reactflow"
import { USS_K8S_COMMAND_TIER_BY_NODE } from "@/lib/uss-k8s/topology"

export interface StationInput {
  id: string
  name: string
  role: string
  status: "online" | "busy" | "offline"
  load?: number
  focus?: string
}

export interface TaskInput {
  id: string
  name: string
  status?: string
  eta?: string
  assignedTo?: string
  sessionId?: string
}

export interface SessionInput {
  id: string
  title: string
  status?: string
  mode?: string
  meta?: string
}

export interface DeploymentInput {
  id: string
  name: string
  status: string
  nodeType?: string
  deploymentProfile?: string
  provisioningMode?: string
  meta?: string
}

export interface ApplicationInput {
  id: string
  name: string
  status: string
  applicationType?: string
  nodeType?: string
  deploymentProfile?: string
  provisioningMode?: string
}

export interface AnchorInput {
  id: string
  label: string
  status?: "nominal" | "warning" | "critical"
  detail?: string
}

const activeStatuses = new Set(["active", "running", "deploying", "updating", "thinking"])

const edgeStyleForStatus = (status?: string) => {
  if (status && activeStatuses.has(status)) {
    return { stroke: "rgba(34, 211, 238, 0.7)", strokeWidth: 2 }
  }
  if (status === "failed") {
    return { stroke: "rgba(244, 63, 94, 0.7)", strokeWidth: 2 }
  }
  if (status === "completed") {
    return { stroke: "rgba(52, 211, 153, 0.6)", strokeWidth: 2 }
  }
  return { stroke: "rgba(148, 163, 184, 0.5)", strokeWidth: 1.5 }
}

export function mapStationsToNodes(stations: StationInput[], selectedId?: string): Node[] {
  return stations.map((station) => ({
    id: station.id,
    type: "stationNode",
    data: {
      title: station.name,
      role: station.role,
      status: station.status,
      load: station.load,
      meta: station.focus,
    },
    position: { x: 0, y: 0 },
    selected: station.id === selectedId,
  }))
}

export function mapTasksToNodes(tasks: TaskInput[], selectedId?: string): Node[] {
  return tasks.map((task) => ({
    id: task.id,
    type: "taskNode",
    data: {
      title: task.name || "Untitled Task",
      status: normalizeTaskStatus(task.status),
      eta: task.eta,
    },
    position: { x: 0, y: 0 },
    selected: task.id === selectedId,
  }))
}

export function mapSessionsToNodes(sessions: SessionInput[], selectedId?: string): Node[] {
  return sessions.map((session) => ({
    id: session.id,
    type: "sessionNode",
    data: {
      title: session.title,
      status: session.status,
      mode: session.mode,
      meta: session.meta,
    },
    position: { x: 0, y: 0 },
    selected: session.id === selectedId,
  }))
}

export function mapDeploymentsToNodes(deployments: DeploymentInput[], selectedId?: string): Node[] {
  return deployments.map((deployment) => ({
    id: deployment.id,
    type: "deploymentNode",
    data: {
      title: deployment.name,
      status: deployment.status,
      nodeType: deployment.nodeType,
      deploymentProfile: deployment.deploymentProfile,
      provisioningMode: deployment.provisioningMode,
      meta: deployment.meta,
    },
    position: { x: 0, y: 0 },
    selected: deployment.id === selectedId,
  }))
}

export function mapApplicationsToNodes(applications: ApplicationInput[], selectedId?: string): Node[] {
  return applications.map((app) => ({
    id: app.id,
    type: "applicationNode",
    data: {
      title: app.name,
      status: app.status,
      nodeType: app.nodeType,
      appType: app.applicationType,
      deploymentProfile: app.deploymentProfile,
      provisioningMode: app.provisioningMode,
    },
    position: { x: 0, y: 0 },
    selected: app.id === selectedId,
  }))
}

export function mapAnchorsToNodes(anchors: AnchorInput[]): Node[] {
  return anchors.map((anchor) => ({
    id: anchor.id,
    type: "systemNode",
    data: {
      title: anchor.label,
      status: anchor.status || "nominal",
      detail: anchor.detail,
    },
    position: { x: 0, y: 0 },
  }))
}

export function buildTaskToStationEdges(tasks: TaskInput[], stations: StationInput[]): Edge[] {
  const stationIds = new Set(stations.map((station) => station.id))
  return tasks
    .filter((task) => task.assignedTo && stationIds.has(task.assignedTo))
    .map((task) => ({
      id: `edge-task-${task.id}`,
      source: task.id,
      target: task.assignedTo as string,
      animated: activeStatuses.has(normalizeTaskStatus(task.status)),
      style: edgeStyleForStatus(task.status),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStyleForStatus(task.status).stroke,
      },
    }))
}

export function buildTaskToSessionEdges(tasks: TaskInput[], sessions: SessionInput[]): Edge[] {
  const sessionIds = new Set(sessions.map((session) => session.id))
  return tasks
    .filter((task) => task.sessionId && sessionIds.has(task.sessionId))
    .map((task) => ({
      id: `edge-task-${task.id}`,
      source: task.sessionId as string,
      target: task.id,
      animated: activeStatuses.has(normalizeTaskStatus(task.status)),
      style: edgeStyleForStatus(task.status),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStyleForStatus(task.status).stroke,
      },
    }))
}

export function buildEdgesToAnchors(items: { id: string; status?: string; anchorId?: string }[]): Edge[] {
  return items
    .filter((item) => item.anchorId)
    .map((item) => ({
      id: `edge-anchor-${item.id}`,
      source: item.anchorId as string,
      target: item.id,
      animated: activeStatuses.has(item.status || ""),
      style: edgeStyleForStatus(item.status),
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeStyleForStatus(item.status).stroke,
      },
    }))
}

export function normalizeTaskStatus(status?: string) {
  switch (status) {
    case "completed":
      return "completed"
    case "failed":
      return "failed"
    case "running":
    case "thinking":
      return "active"
    case "active":
      return "active"
    case "pending":
      return "pending"
    default:
      return "pending"
  }
}

// ── USS-K8S subsystem mappers ────────────────────────

export interface SubsystemNodeInput {
  id: string
  label: string
  sublabel?: string
  group: string
  componentType: string
  status?: string
}

export type SubsystemVisualVariant = "uss-k8s"

interface SubsystemMapOptions {
  visualVariant?: SubsystemVisualVariant
}

export interface SubsystemEdgeInput {
  source: string
  target: string
  label?: string
  animated?: boolean
  edgeType: "data" | "control" | "telemetry" | "alert"
}

const nodeTypeForComponent: Record<string, string> = {
  agent: "stationNode",
  runtime: "runtimeNode",
  observability: "observabilityNode",
  "k8s-workload": "k8sNode",
  operator: "systemNode",
  ui: "systemNode",
}

export function mapSubsystemToNodes(
  components: SubsystemNodeInput[],
  selectedId?: string,
  options: SubsystemMapOptions = {},
): Node[] {
  const visualVariant = options.visualVariant

  return components.map((c) => {
    const nodeType = nodeTypeForComponent[c.componentType] || "systemNode"
    const commandTier = visualVariant === "uss-k8s" ? USS_K8S_COMMAND_TIER_BY_NODE[c.id] : undefined

    if (nodeType === "stationNode") {
      return {
        id: c.id,
        type: "stationNode",
        data: {
          title: c.label,
          role: c.sublabel || "",
          status: c.status === "warning" ? "busy" : c.status === "critical" ? "offline" : "online",
          meta: c.group,
          visualVariant,
          commandTier,
        },
        position: { x: 0, y: 0 },
        selected: c.id === selectedId,
      }
    }

    return {
      id: c.id,
      type: nodeType,
      data: {
        title: c.label,
        sublabel: c.sublabel,
        status: c.status || "nominal",
        visualVariant,
        commandTier,
      },
      position: { x: 0, y: 0 },
      selected: c.id === selectedId,
    }
  })
}

const edgeStyleForType: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
  control: { stroke: "rgba(34, 211, 238, 0.76)", strokeWidth: 1.9 },
  data: { stroke: "rgba(148, 163, 184, 0.62)", strokeWidth: 1.7 },
  telemetry: { stroke: "rgba(167, 139, 250, 0.72)", strokeWidth: 1.8, strokeDasharray: "6 3" },
  alert: { stroke: "rgba(244, 63, 94, 0.82)", strokeWidth: 2.3 },
}

const edgeLabelStyle = { fill: "var(--flow-edge-label)", fontSize: 10.5, fontWeight: 500 }
const edgeLabelBgStyle = { fill: "var(--flow-edge-label-bg)", fillOpacity: 0.92 }
const edgeLabelBgPadding: [number, number] = [5, 3]

export function buildSubsystemEdges(edges: SubsystemEdgeInput[]): Edge[] {
  return edges.map((e) => {
    const style = edgeStyleForType[e.edgeType] || edgeStyleForType.data
    return {
      id: `sub-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: e.animated || e.edgeType === "alert",
      label: e.label,
      labelStyle: edgeLabelStyle,
      labelBgStyle: edgeLabelBgStyle,
      labelBgPadding: edgeLabelBgPadding,
      style,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: style.stroke,
      },
    }
  })
}

/**
 * Build subsystem edges with filtering and highlighting support.
 * - visibleEdgeTypes: only include edges of these types
 * - highlightNodeId: if set, dim edges not connected to this node
 */
export function buildSubsystemEdgesFiltered(
  edges: SubsystemEdgeInput[],
  visibleEdgeTypes?: Set<string>,
  highlightNodeId?: string | null,
): Edge[] {
  return edges
    .filter((e) => !visibleEdgeTypes || visibleEdgeTypes.has(e.edgeType))
    .map((e) => {
      const baseStyle = edgeStyleForType[e.edgeType] || edgeStyleForType.data
      const isConnected = !highlightNodeId || e.source === highlightNodeId || e.target === highlightNodeId

      const style = isConnected
        ? baseStyle
        : {
            ...baseStyle,
            stroke: baseStyle.stroke.replace(/,\s*[\d.]+\)$/, ", 0.24)"),
            strokeWidth: Math.max(1.15, baseStyle.strokeWidth - 0.55),
          }

      return {
        id: `sub-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        type: "smoothstep",
        animated: isConnected && (e.animated || e.edgeType === "alert"),
        label: isConnected ? e.label : undefined,
        labelStyle: edgeLabelStyle,
        labelBgStyle: edgeLabelBgStyle,
        labelBgPadding: edgeLabelBgPadding,
        style,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected
            ? (edgeStyleForType[e.edgeType] || edgeStyleForType.data).stroke
            : "var(--flow-edge-dim-marker)",
        },
      }
    })
}
