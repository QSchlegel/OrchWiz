import test from "node:test"
import assert from "node:assert/strict"
import {
  buildAutoEventPath,
  buildOpsTrackerRollups,
  buildOpsTrackerRunWindow,
  buildShipAgentContext,
  dedupeOpsTrackerEvents,
  filterOpsTrackerEventsByForwardedPolicy,
  normalizeOpsTrackerEvent,
} from "./index"

test("timezone boundaries bucket events into local date", () => {
  const event = normalizeOpsTrackerEvent({
    eventId: "evt-1",
    occurredAt: "2026-02-19T01:30:00.000Z",
    source: "manual",
    title: "Timezone boundary",
    summary: "",
    timezone: "America/Los_Angeles",
  })

  assert.equal(event.eventDate, "2026-02-18")
})

test("dedupe is deterministic and prefers non-forwarded records", () => {
  const base = {
    eventId: "same-id",
    occurredAt: "2026-02-19T10:00:00.000Z",
    source: "verification" as const,
    title: "Verification",
    summary: "",
  }

  const forwarded = normalizeOpsTrackerEvent({
    ...base,
    isForwarded: true,
  })
  const local = normalizeOpsTrackerEvent({
    ...base,
    isForwarded: false,
  })

  const deduped = dedupeOpsTrackerEvents([forwarded, local, forwarded])
  assert.equal(deduped.length, 1)
  assert.equal(deduped[0].isForwarded, false)
})

test("forwarded policy includes forwarded by default and can disable them", () => {
  const local = normalizeOpsTrackerEvent({
    eventId: "local",
    occurredAt: "2026-02-19T11:00:00.000Z",
    source: "deployment",
    title: "Local",
    summary: "",
    isForwarded: false,
  })

  const forwarded = normalizeOpsTrackerEvent({
    eventId: "forwarded",
    occurredAt: "2026-02-19T11:05:00.000Z",
    source: "deployment",
    title: "Forwarded",
    summary: "",
    isForwarded: true,
  })

  assert.equal(filterOpsTrackerEventsByForwardedPolicy([local, forwarded]).length, 2)
  assert.equal(filterOpsTrackerEventsByForwardedPolicy([local, forwarded], false).length, 1)
})

test("private events are excluded from ship/fleet rollups", () => {
  const publicEvent = normalizeOpsTrackerEvent({
    eventId: "public-1",
    occurredAt: "2026-02-19T12:00:00.000Z",
    source: "manual",
    title: "Public",
    summary: "",
    shipDeploymentId: "ship-1",
    agentId: "xo-cb01",
    visibility: "public",
  })

  const privateEvent = normalizeOpsTrackerEvent({
    eventId: "private-1",
    occurredAt: "2026-02-19T13:00:00.000Z",
    source: "manual",
    title: "Private",
    summary: "",
    shipDeploymentId: "ship-1",
    agentId: "xo-cb01",
    visibility: "private",
  })

  const rollups = buildOpsTrackerRollups({
    events: [publicEvent, privateEvent],
    timezone: "UTC",
    generatedAt: new Date("2026-02-19T23:00:00.000Z"),
  })

  assert.equal(rollups.agentRollups.length, 1)
  assert.equal(rollups.agentRollups[0].totalPoints, 2)

  assert.equal(rollups.shipRollups.length, 1)
  assert.equal(rollups.shipRollups[0].totalPoints, 1)

  assert.equal(rollups.fleetRollups.length, 1)
  assert.equal(rollups.fleetRollups[0].totalPoints, 1)
})

test("agent context includes bridge crew and quartermaster", () => {
  const context = buildShipAgentContext({
    shipIds: ["ship-1"],
    bridgeCrewByShip: {
      "ship-1": ["xo-cb01", "ops-arx"],
    },
    includeQuartermaster: true,
  })

  assert.equal(context.length, 1)
  assert.deepEqual(context[0].agentIds, ["ops-arx", "qtm-lgr", "xo-cb01"])
})

test("ship and fleet totals match lower-scope public events", () => {
  const events = [
    normalizeOpsTrackerEvent({
      eventId: "e1",
      occurredAt: "2026-02-19T10:00:00.000Z",
      source: "verification",
      title: "E1",
      summary: "",
      shipDeploymentId: "ship-1",
      agentId: "xo-cb01",
      points: 1,
    }),
    normalizeOpsTrackerEvent({
      eventId: "e2",
      occurredAt: "2026-02-19T10:30:00.000Z",
      source: "deployment",
      title: "E2",
      summary: "",
      shipDeploymentId: "ship-1",
      agentId: "qtm-lgr",
      points: 1,
    }),
    normalizeOpsTrackerEvent({
      eventId: "e3",
      occurredAt: "2026-02-19T11:00:00.000Z",
      source: "verification",
      title: "E3",
      summary: "",
      shipDeploymentId: "ship-2",
      agentId: "ops-arx",
      points: 1,
    }),
  ]

  const rollups = buildOpsTrackerRollups({
    events,
    timezone: "UTC",
    generatedAt: new Date("2026-02-19T23:00:00.000Z"),
  })

  const shipTotal = rollups.shipRollups.reduce((acc, row) => acc + row.totalPoints, 0)
  const fleetTotal = rollups.fleetRollups.reduce((acc, row) => acc + row.totalPoints, 0)
  const agentTotal = rollups.agentRollups.reduce((acc, row) => acc + row.totalPoints, 0)

  assert.equal(shipTotal, fleetTotal)
  assert.equal(shipTotal, agentTotal)
})

test("default backfill window is 90 days and deterministic", () => {
  const window = buildOpsTrackerRunWindow({
    now: new Date("2026-02-19T12:00:00.000Z"),
  })

  assert.equal(window.backfillDays, 90)
  assert.equal(window.fromDate, "2025-11-22")
  assert.equal(window.toDate, "2026-02-19")

  const event = normalizeOpsTrackerEvent({
    eventId: "path-check",
    occurredAt: "2026-02-19T12:00:00.000Z",
    source: "deployment",
    title: "Path",
    summary: "",
    shipDeploymentId: "ship-1",
    timezone: "UTC",
  })

  assert.equal(buildAutoEventPath(event), "kb/ships/ship-1/ops-tracker/events/auto/2026/02/19/deployment-path-check.md")
})

test("missing ship binding falls back to fleet auto event path", () => {
  const event = normalizeOpsTrackerEvent({
    eventId: "fleet-only",
    occurredAt: "2026-02-19T09:00:00.000Z",
    source: "security_audit",
    title: "Fleet event",
    summary: "",
    shipDeploymentId: null,
    timezone: "UTC",
  })

  assert.equal(buildAutoEventPath(event), "kb/fleet/ops-tracker/events/auto/2026/02/19/security_audit-fleet-only.md")
})
