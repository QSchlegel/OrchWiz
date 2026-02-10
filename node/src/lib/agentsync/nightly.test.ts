import test from "node:test"
import assert from "node:assert/strict"
import { isDueNightly, resolveNightlyState } from "./nightly"

test("isDueNightly returns true when current local hour matches and no prior run exists", () => {
  const due = isDueNightly({
    now: new Date("2026-02-10T07:00:00.000Z"), // 02:00 in America/New_York (EST)
    timezone: "America/New_York",
    nightlyHour: 2,
    lastNightlyRunAt: null,
  })

  assert.equal(due, true)
})

test("isDueNightly enforces once-per-local-day execution", () => {
  const due = isDueNightly({
    now: new Date("2026-02-10T07:00:00.000Z"),
    timezone: "America/New_York",
    nightlyHour: 2,
    lastNightlyRunAt: new Date("2026-02-10T06:15:00.000Z"),
  })

  assert.equal(due, false)
})

test("resolveNightlyState normalizes invalid timezone and disabled flags", () => {
  const now = new Date("2026-02-10T02:00:00.000Z")

  const disabled = resolveNightlyState({
    userId: "u1",
    timezone: "Invalid/Timezone",
    nightlyEnabled: false,
    nightlyHour: 2,
    now,
  })
  assert.equal(disabled.timezone, "UTC")
  assert.equal(disabled.due, false)

  const enabled = resolveNightlyState({
    userId: "u2",
    timezone: "UTC",
    nightlyEnabled: true,
    nightlyHour: 2,
    now,
  })
  assert.equal(enabled.due, true)
})

