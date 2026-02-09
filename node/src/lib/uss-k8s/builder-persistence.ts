import type { BuilderState } from "./builder-types"

const BUILDER_DRAFT_KEY = "orchwiz:uss-k8s-builder-draft"

export interface BuilderDraft {
  shipName: string
  shipDescription: string
  topologyId: string | null
  components: BuilderState["components"]
  edges: BuilderState["edges"]
  positions: BuilderState["positions"]
  hierarchy: BuilderState["hierarchy"]
  savedAt: string
}

export function saveDraft(state: BuilderState): void {
  if (typeof window === "undefined") return
  const draft: BuilderDraft = {
    shipName: state.shipName,
    shipDescription: state.shipDescription,
    topologyId: state.topologyId,
    components: state.components,
    edges: state.edges,
    positions: state.positions,
    hierarchy: state.hierarchy,
    savedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // localStorage full or unavailable
  }
}

export function loadDraft(): BuilderDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(BUILDER_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BuilderDraft
    if (!parsed.components || !parsed.edges) return null
    return parsed
  } catch {
    return null
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(BUILDER_DRAFT_KEY)
}
