import { useCallback, useEffect, useReducer, useRef } from "react"
import type { XYPosition } from "reactflow"
import type {
  CommandHierarchyTier,
  EdgeType,
  SubsystemEdge,
  TopologyComponent,
} from "./topology"
import { USS_K8S_COMMAND_HIERARCHY } from "./topology"
import type { BuilderAction, BuilderState, BuilderTool, ComponentTemplate } from "./builder-types"
import { clearDraft, loadDraft, saveDraft } from "./builder-persistence"

let nextId = 1

function generateId(): string {
  return `custom-${Date.now().toString(36)}-${(nextId++).toString(36)}`
}

function createInitialState(
  components: TopologyComponent[],
  edges: SubsystemEdge[],
): BuilderState {
  return {
    mode: "view",
    tool: "select",
    components: [...components],
    edges: [...edges],
    positions: {},
    hierarchy: [...USS_K8S_COMMAND_HIERARCHY],
    shipName: "USS-K8S",
    shipDescription: "",
    topologyId: null,
    connectSource: null,
    isDirty: false,
    lastSavedAt: null,
  }
}

function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "ENTER_BUILD":
      return { ...state, mode: "build", tool: "select" }

    case "EXIT_BUILD":
      return { ...state, mode: "view", tool: "select", connectSource: null }

    case "SET_TOOL":
      return { ...state, tool: action.tool, connectSource: null }

    case "ADD_COMPONENT": {
      const id = action.id || generateId()
      const newComponent: TopologyComponent = {
        id,
        label: action.label || action.template.defaultLabel,
        sublabel: action.template.defaultSublabel,
        group: action.template.group,
        componentType: action.template.componentType,
      }
      return {
        ...state,
        components: [...state.components, newComponent],
        positions: { ...state.positions, [id]: action.position },
        isDirty: true,
      }
    }

    case "REMOVE_COMPONENT":
      return {
        ...state,
        components: state.components.filter((c) => c.id !== action.id),
        edges: state.edges.filter((e) => e.source !== action.id && e.target !== action.id),
        positions: Object.fromEntries(
          Object.entries(state.positions).filter(([k]) => k !== action.id),
        ),
        isDirty: true,
      }

    case "UPDATE_COMPONENT":
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
        isDirty: true,
      }

    case "ADD_EDGE": {
      const exists = state.edges.some(
        (e) => e.source === action.source && e.target === action.target,
      )
      if (exists) return state
      const newEdge: SubsystemEdge = {
        source: action.source,
        target: action.target,
        edgeType: action.edgeType,
        label: action.label,
        animated: action.animated,
      }
      return {
        ...state,
        edges: [...state.edges, newEdge],
        connectSource: null,
        isDirty: true,
      }
    }

    case "REMOVE_EDGE":
      return {
        ...state,
        edges: state.edges.filter(
          (e) => !(e.source === action.source && e.target === action.target),
        ),
        isDirty: true,
      }

    case "UPDATE_POSITION":
      return {
        ...state,
        positions: { ...state.positions, [action.id]: action.position },
        isDirty: true,
      }

    case "SET_CONNECT_SOURCE":
      return { ...state, connectSource: action.id }

    case "LOAD_TOPOLOGY":
      return {
        ...state,
        mode: "build",
        tool: "select",
        components: [...action.components],
        edges: [...action.edges],
        positions: action.positions ? { ...action.positions } : {},
        hierarchy: action.hierarchy ? [...action.hierarchy] : [...USS_K8S_COMMAND_HIERARCHY],
        shipName: action.shipName || "USS-K8S",
        shipDescription: action.shipDescription || "",
        topologyId: action.topologyId ?? null,
        connectSource: null,
        isDirty: false,
        lastSavedAt: null,
      }

    case "MARK_SAVED":
      return {
        ...state,
        isDirty: false,
        lastSavedAt: new Date(),
        topologyId: action.topologyId ?? state.topologyId,
      }

    case "SET_SHIP_NAME":
      return { ...state, shipName: action.name, isDirty: true }

    case "SET_SHIP_DESCRIPTION":
      return { ...state, shipDescription: action.description, isDirty: true }

    case "RESET":
      return createInitialState([], [])

    default:
      return state
  }
}

export function useShipBuilder(
  initialComponents: TopologyComponent[],
  initialEdges: SubsystemEdge[],
) {
  const [state, dispatch] = useReducer(
    builderReducer,
    { components: initialComponents, edges: initialEdges },
    ({ components, edges }) => createInitialState(components, edges),
  )
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save draft when dirty
  useEffect(() => {
    if (!state.isDirty || state.mode !== "build") return
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => saveDraft(state), 2000)
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [state])

  const enterBuildMode = useCallback(() => dispatch({ type: "ENTER_BUILD" }), [])
  const exitBuildMode = useCallback(() => dispatch({ type: "EXIT_BUILD" }), [])
  const setTool = useCallback((tool: BuilderTool) => dispatch({ type: "SET_TOOL", tool }), [])

  const addComponent = useCallback(
    (template: ComponentTemplate, position: XYPosition, id?: string, label?: string) =>
      dispatch({ type: "ADD_COMPONENT", template, position, id, label }),
    [],
  )
  const removeComponent = useCallback(
    (id: string) => dispatch({ type: "REMOVE_COMPONENT", id }),
    [],
  )
  const updateComponent = useCallback(
    (id: string, patch: Partial<TopologyComponent>) =>
      dispatch({ type: "UPDATE_COMPONENT", id, patch }),
    [],
  )

  const addEdge = useCallback(
    (source: string, target: string, edgeType: EdgeType, label?: string, animated?: boolean) =>
      dispatch({ type: "ADD_EDGE", source, target, edgeType, label, animated }),
    [],
  )
  const removeEdge = useCallback(
    (source: string, target: string) => dispatch({ type: "REMOVE_EDGE", source, target }),
    [],
  )

  const updatePosition = useCallback(
    (id: string, position: XYPosition) => dispatch({ type: "UPDATE_POSITION", id, position }),
    [],
  )

  const setConnectSource = useCallback(
    (id: string | null) => dispatch({ type: "SET_CONNECT_SOURCE", id }),
    [],
  )

  const loadTopology = useCallback(
    (data: {
      components: TopologyComponent[]
      edges: SubsystemEdge[]
      positions?: Record<string, XYPosition>
      hierarchy?: CommandHierarchyTier[]
      shipName?: string
      shipDescription?: string
      topologyId?: string | null
    }) => dispatch({ type: "LOAD_TOPOLOGY", ...data }),
    [],
  )

  const markSaved = useCallback(
    (topologyId?: string) => {
      dispatch({ type: "MARK_SAVED", topologyId })
      clearDraft()
    },
    [],
  )

  const setShipName = useCallback(
    (name: string) => dispatch({ type: "SET_SHIP_NAME", name }),
    [],
  )
  const setShipDescription = useCallback(
    (description: string) => dispatch({ type: "SET_SHIP_DESCRIPTION", description }),
    [],
  )

  const restoreDraft = useCallback(() => {
    const draft = loadDraft()
    if (!draft) return false
    dispatch({
      type: "LOAD_TOPOLOGY",
      components: draft.components,
      edges: draft.edges,
      positions: draft.positions,
      hierarchy: draft.hierarchy,
      shipName: draft.shipName,
      shipDescription: draft.shipDescription,
      topologyId: draft.topologyId,
    })
    return true
  }, [])

  return {
    state,
    enterBuildMode,
    exitBuildMode,
    setTool,
    addComponent,
    removeComponent,
    updateComponent,
    addEdge,
    removeEdge,
    updatePosition,
    setConnectSource,
    loadTopology,
    markSaved,
    setShipName,
    setShipDescription,
    restoreDraft,
  }
}
