import assert from "node:assert/strict"
import test from "node:test"
import {
  captureWindowSnapshot,
  dockWindowState,
  maximizeWindowState,
  restoreDockedWindowState,
  restoreWindowStateFromSnapshot,
  toggleWindowBodyCollapsed,
} from "./window-state"

const baseWindow = {
  x: 120,
  y: 96,
  width: 480,
  minHeight: 260,
  collapsed: false,
  bodyCollapsed: false,
}

test("maximizeWindowState and restoreWindowStateFromSnapshot roundtrip bounds", () => {
  const snapshot = captureWindowSnapshot(baseWindow)
  const maximized = maximizeWindowState(baseWindow, { width: 1360, height: 820 })

  assert.equal(maximized.x, 16)
  assert.equal(maximized.y, 16)
  assert.equal(maximized.width, 1328)
  assert.equal(maximized.minHeight, 788)
  assert.equal(maximized.collapsed, false)
  assert.equal(maximized.bodyCollapsed, false)

  const restored = restoreWindowStateFromSnapshot(maximized, snapshot)
  assert.equal(restored.x, baseWindow.x)
  assert.equal(restored.y, baseWindow.y)
  assert.equal(restored.width, baseWindow.width)
  assert.equal(restored.minHeight, baseWindow.minHeight)
})

test("toggleWindowBodyCollapsed toggles body state", () => {
  const collapsed = toggleWindowBodyCollapsed(baseWindow)
  assert.equal(collapsed.bodyCollapsed, true)

  const expanded = toggleWindowBodyCollapsed(collapsed)
  assert.equal(expanded.bodyCollapsed, false)
})

test("dock and restore helpers keep dock behavior consistent", () => {
  const docked = dockWindowState(baseWindow)
  assert.equal(docked.collapsed, true)

  const restored = restoreDockedWindowState(docked)
  assert.equal(restored.collapsed, false)
})
