export const WINDOW_STAGE_MARGIN = 16
export const WINDOW_HEADER_HEIGHT = 48

export interface WindowStageSize {
  width: number
  height: number
}

export interface WindowBoundsSnapshot {
  x: number
  y: number
  width: number
  minHeight: number
}

export interface WindowStateLike extends WindowBoundsSnapshot {
  collapsed: boolean
  bodyCollapsed: boolean
}

export function captureWindowSnapshot(windowState: Pick<WindowStateLike, "x" | "y" | "width" | "minHeight">): WindowBoundsSnapshot {
  return {
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    minHeight: windowState.minHeight,
  }
}

export function maximizeWindowState<T extends WindowStateLike>(windowState: T, stageSize: WindowStageSize): T {
  const width = Math.max(280, stageSize.width - WINDOW_STAGE_MARGIN * 2)
  const minHeight = Math.max(WINDOW_HEADER_HEIGHT, stageSize.height - WINDOW_STAGE_MARGIN * 2)

  return {
    ...windowState,
    x: WINDOW_STAGE_MARGIN,
    y: WINDOW_STAGE_MARGIN,
    width,
    minHeight,
    collapsed: false,
    bodyCollapsed: false,
  }
}

export function restoreWindowStateFromSnapshot<T extends WindowStateLike>(
  windowState: T,
  snapshot: WindowBoundsSnapshot | null | undefined,
): T {
  if (!snapshot) {
    return windowState
  }

  return {
    ...windowState,
    x: snapshot.x,
    y: snapshot.y,
    width: snapshot.width,
    minHeight: snapshot.minHeight,
  }
}

export function toggleWindowBodyCollapsed<T extends WindowStateLike>(windowState: T): T {
  return {
    ...windowState,
    bodyCollapsed: !windowState.bodyCollapsed,
  }
}

export function dockWindowState<T extends WindowStateLike>(windowState: T): T {
  return {
    ...windowState,
    collapsed: true,
  }
}

export function restoreDockedWindowState<T extends WindowStateLike>(windowState: T): T {
  return {
    ...windowState,
    collapsed: false,
  }
}
