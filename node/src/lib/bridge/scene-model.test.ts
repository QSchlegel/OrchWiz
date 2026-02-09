import test from "node:test"
import assert from "node:assert/strict"
import {
  BRIDGE_WIDE_SHOT,
  formatBridgeTelemetry,
  getBridgeCameraShot,
  getBridgeStationAnchors,
  interpolateBridgeCameraPose,
} from "./scene-model"

test("getBridgeStationAnchors returns all canonical station keys", () => {
  const anchors = getBridgeStationAnchors()
  assert.deepEqual(Object.keys(anchors).sort(), ["cou", "eng", "med", "ops", "sec", "xo"])
})

test("getBridgeCameraShot returns deterministic station shot", () => {
  const first = getBridgeCameraShot("eng")
  const second = getBridgeCameraShot("eng")
  assert.deepEqual(first, second)
  assert.deepEqual(first.position, [8.8, 3.6, 11.4])
})

test("getBridgeCameraShot falls back to canonical wide shot for null key", () => {
  const fallback = getBridgeCameraShot(null)
  assert.deepEqual(fallback, BRIDGE_WIDE_SHOT)
})

test("interpolateBridgeCameraPose converges and stays finite with unsafe inputs", () => {
  let current = {
    position: [0, 0, 0] as [number, number, number],
    lookAt: [0, 0, -5] as [number, number, number],
    fov: 60,
  }
  const target = {
    position: [10, 4, -20] as [number, number, number],
    lookAt: [0, 1, -30] as [number, number, number],
    fov: 44,
  }

  for (let index = 0; index < 120; index += 1) {
    current = interpolateBridgeCameraPose(current, target, 1 / 60)
  }

  assert.ok(Math.abs(current.position[0] - target.position[0]) < 0.01)
  assert.ok(Math.abs(current.lookAt[2] - target.lookAt[2]) < 0.01)
  assert.ok(Math.abs(current.fov - target.fov) < 0.01)

  const unsafe = interpolateBridgeCameraPose(
    {
      position: [Number.NaN, Number.POSITIVE_INFINITY, 0],
      lookAt: [0, Number.NaN, 1],
      fov: Number.NaN,
    },
    target,
    99,
    999,
  )
  assert.ok(unsafe.position.every((value) => Number.isFinite(value)))
  assert.ok(unsafe.lookAt.every((value) => Number.isFinite(value)))
  assert.ok(Number.isFinite(unsafe.fov))
})

function buildTelemetryInput() {
  return {
    operatorLabel: "captain.very.long.operator@example.com",
    stardate: "2026.040",
    missionStats: { active: 12, completed: 4, failed: 1 },
    systems: [
      { label: "Sensor Grid", state: "nominal", detail: "Live feed stable" },
      { label: "Comms Array", state: "warning", detail: "Packet jitter elevated" },
      { label: "Core Systems", state: "critical", detail: "Thermal spike detected" },
    ],
    workItems: [
      {
        name: "very-long-incident-name-that-should-be-trimmed-for-screen-readability",
        status: "failed",
        eta: "now",
      },
      { name: "deploy-eu-west", status: "active", eta: "4m" },
      { name: "sync-k8s-config", status: "pending", eta: "8m" },
    ],
    stations: [
      { stationKey: "xo", callsign: "XO-CB01", status: "online", load: 34, focus: "Command", queue: ["a"] },
      { stationKey: "ops", callsign: "OPS-ARX", status: "busy", load: 72, focus: "Routing", queue: ["a", "b"] },
      { stationKey: "eng", callsign: "ENG-GEO", status: "online", load: 62, focus: "Incidents", queue: [] },
      { stationKey: "sec", callsign: "SEC-KOR", status: "online", load: 40, focus: "Policy", queue: [] },
      { stationKey: "med", callsign: "MED-BEV", status: "online", load: 35, focus: "Diagnostics", queue: [] },
      { stationKey: "cou", callsign: "COU-DEA", status: "busy", load: 59, focus: "Comms", queue: ["a"] },
    ] as const,
    selectedStationKey: "cou" as const,
    commsFeed: [
      {
        speaker: "operator",
        text: "reroute packet stream to fallback and update status board",
        timestamp: "2026-02-09T12:00:00.000Z",
        kind: "directive" as const,
      },
      {
        speaker: "COU-DEA",
        text: "Reroute complete, jitter now stable in under 3s",
        timestamp: "2026-02-09T12:00:03.000Z",
        kind: "response" as const,
      },
    ],
    lastEventAt: Date.parse("2026-02-09T12:00:04.000Z"),
  }
}

test("formatBridgeTelemetry outputs bounded screen blocks", () => {
  const telemetry = formatBridgeTelemetry(buildTelemetryInput())

  assert.ok(telemetry.mainScreen.lines.length <= 7)
  assert.ok(telemetry.mainScreen.lines.every((line) => line.length <= 64))
  assert.ok(telemetry.systemsScreen.lines.length <= 5)
  assert.ok(telemetry.queueScreen.lines.length <= 5)
  assert.equal(Object.keys(telemetry.stationScreens).length, 6)
  assert.ok(Object.values(telemetry.stationScreens).every((screen) => screen.lines.length <= 5))
  assert.ok(telemetry.tickerLine.length <= 112)
})

test("formatBridgeTelemetry prioritizes critical and warning alerts deterministically", () => {
  const telemetry = formatBridgeTelemetry(buildTelemetryInput())

  assert.ok(telemetry.mainScreen.lines[4].startsWith("SYS CRITICAL Core Systems"))
  assert.ok(telemetry.systemsScreen.lines[1].startsWith("CRITICAL Core Systems"))
  assert.ok(telemetry.systemsScreen.lines[2].startsWith("WARNING Comms Array"))
  assert.ok(telemetry.queueScreen.lines[1].startsWith("FAILED"))
  assert.ok(telemetry.queueScreen.lines[2].startsWith("ACTIVE"))
})

test("formatBridgeTelemetry uses comms fallback when no transcript entries exist", () => {
  const input = buildTelemetryInput()
  input.commsFeed = []
  input.lastEventAt = Date.parse("2026-02-09T12:08:00.000Z")

  const telemetry = formatBridgeTelemetry(input)

  assert.equal(telemetry.mainScreen.lines[6], "COMMS NO COMMS")
  assert.ok(telemetry.tickerLine.startsWith("NO COMMS"))
  assert.ok(telemetry.tickerLine.includes("12:08:00"))
})

test("formatBridgeTelemetry keeps station screen defaults when fields are missing", () => {
  const input = buildTelemetryInput()
  input.stations = [
    { stationKey: "xo", callsign: "XO-CB01" },
    { stationKey: "ops", callsign: "OPS-ARX" },
    { stationKey: "eng", callsign: "ENG-GEO" },
    { stationKey: "sec", callsign: "SEC-KOR" },
    { stationKey: "med", callsign: "MED-BEV" },
    { stationKey: "cou", callsign: "COU-DEA" },
  ]

  const telemetry = formatBridgeTelemetry(input)
  const xo = telemetry.stationScreens.xo

  assert.ok(xo.lines[0].includes("ONLINE"))
  assert.ok(xo.lines[2].includes("QDEPTH 0"))
  assert.ok(xo.lines[3].includes("QUEUE CLEAR"))
  assert.ok(xo.lines[4].includes("Standing by"))
})
