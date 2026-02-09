import test from "node:test"
import assert from "node:assert/strict"
import {
  applyForwardedBridgeStationEvents,
  buildCanonicalBridgeStations,
  type BridgeCrewLike,
} from "./stations"

test("buildCanonicalBridgeStations always returns six canonical stations", () => {
  const stations = buildCanonicalBridgeStations([])

  assert.equal(stations.length, 6)
  assert.deepEqual(
    stations.map((station) => station.stationKey),
    ["xo", "ops", "eng", "sec", "med", "cou"],
  )
})

test("buildCanonicalBridgeStations enriches matching station by prefix", () => {
  const subagents: BridgeCrewLike[] = [
    {
      id: "subagent-ops",
      callsign: "OPS-ARX",
      description: "Operations queue automation",
    },
  ]

  const stations = buildCanonicalBridgeStations(subagents)
  const ops = stations.find((station) => station.stationKey === "ops")

  assert.ok(ops)
  assert.equal(ops.id, "subagent-ops")
  assert.equal(ops.name, "OPS-ARX")
  assert.equal(ops.subagentId, "subagent-ops")
  assert.equal(ops.subagentDescription, "Operations queue automation")
})

test("applyForwardedBridgeStationEvents merges by station id and station key", () => {
  const stations = buildCanonicalBridgeStations([])
  const xo = stations.find((station) => station.stationKey === "xo")
  assert.ok(xo)

  const next = applyForwardedBridgeStationEvents(stations, [
    {
      id: "evt-1",
      payload: {
        stationId: xo.id,
        load: 88,
        focus: "Escalating to engineering",
      },
    },
    {
      id: "evt-2",
      payload: {
        stationKey: "eng",
        status: "busy",
      },
    },
  ])

  const nextXo = next.find((station) => station.stationKey === "xo")
  const nextEng = next.find((station) => station.stationKey === "eng")

  assert.ok(nextXo)
  assert.ok(nextEng)
  assert.equal(nextXo.load, 88)
  assert.equal(nextXo.focus, "Escalating to engineering")
  assert.equal(nextEng.status, "busy")
})
