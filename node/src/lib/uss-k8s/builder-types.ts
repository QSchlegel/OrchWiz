import type { XYPosition } from "reactflow"
import type {
  CommandHierarchyTier,
  ComponentType,
  EdgeType,
  SubsystemEdge,
  SubsystemGroup,
  TopologyComponent,
} from "./topology"

export type BuilderMode = "view" | "build"

export type BuilderTool = "select" | "connect" | "delete"

export interface BuilderState {
  mode: BuilderMode
  tool: BuilderTool

  components: TopologyComponent[]
  edges: SubsystemEdge[]
  positions: Record<string, XYPosition>
  hierarchy: CommandHierarchyTier[]

  shipName: string
  shipDescription: string
  topologyId: string | null

  connectSource: string | null
  isDirty: boolean
  lastSavedAt: Date | null
}

export interface ComponentTemplate {
  componentType: ComponentType
  group: SubsystemGroup
  defaultLabel: string
  defaultSublabel: string
  description: string
}

export const COMPONENT_TEMPLATES: ComponentTemplate[] = [
  {
    componentType: "agent",
    group: "bridge",
    defaultLabel: "New Agent",
    defaultSublabel: "bridge crew member",
    description: "Add a bridge crew agent",
  },
  {
    componentType: "operator",
    group: "users",
    defaultLabel: "Operator Surface",
    defaultSublabel: "interface endpoint",
    description: "Add an operator interface",
  },
  {
    componentType: "ui",
    group: "users",
    defaultLabel: "UI Surface",
    defaultSublabel: "state reader",
    description: "Add a UI surface",
  },
  {
    componentType: "runtime",
    group: "openclaw",
    defaultLabel: "Runtime Service",
    defaultSublabel: "control plane service",
    description: "Add a runtime service",
  },
  {
    componentType: "observability",
    group: "obs",
    defaultLabel: "Observer",
    defaultSublabel: "telemetry sink",
    description: "Add an observability tool",
  },
  {
    componentType: "k8s-workload",
    group: "k8s",
    defaultLabel: "Workload",
    defaultSublabel: "k8s resource",
    description: "Add a Kubernetes workload",
  },
]

export type BuilderAction =
  | { type: "ENTER_BUILD" }
  | { type: "EXIT_BUILD" }
  | { type: "SET_TOOL"; tool: BuilderTool }
  | { type: "ADD_COMPONENT"; template: ComponentTemplate; position: XYPosition; id?: string; label?: string }
  | { type: "REMOVE_COMPONENT"; id: string }
  | { type: "UPDATE_COMPONENT"; id: string; patch: Partial<TopologyComponent> }
  | { type: "ADD_EDGE"; source: string; target: string; edgeType: EdgeType; label?: string; animated?: boolean }
  | { type: "REMOVE_EDGE"; source: string; target: string }
  | { type: "UPDATE_POSITION"; id: string; position: XYPosition }
  | { type: "SET_CONNECT_SOURCE"; id: string | null }
  | { type: "LOAD_TOPOLOGY"; components: TopologyComponent[]; edges: SubsystemEdge[]; positions?: Record<string, XYPosition>; hierarchy?: CommandHierarchyTier[]; shipName?: string; shipDescription?: string; topologyId?: string | null }
  | { type: "MARK_SAVED"; topologyId?: string }
  | { type: "SET_SHIP_NAME"; name: string }
  | { type: "SET_SHIP_DESCRIPTION"; description: string }
  | { type: "RESET" }
