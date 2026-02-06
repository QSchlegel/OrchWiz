import type { Edge, Node } from "reactflow"
import { MarkerType } from "reactflow"

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
  meta?: string
}

export interface ApplicationInput {
  id: string
  name: string
  status: string
  applicationType?: string
  nodeType?: string
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
