import test from "node:test"
import assert from "node:assert/strict"
import {
  deriveRoundStatus,
  parseDirective,
  parseRoundSource,
  parseRoundsQueryTake,
  selectLeadStationKey,
  summarizeRound,
} from "./rounds"

test("selectLeadStationKey prefers XO then fallback order", () => {
  assert.equal(
    selectLeadStationKey([
      { stationKey: "eng", status: "success" },
      { stationKey: "ops", status: "success" },
    ]),
    "ops",
  )

  assert.equal(
    selectLeadStationKey([
      { stationKey: "sec", status: "failed" },
      { stationKey: "med", status: "offline" },
    ]),
    null,
  )
})

test("deriveRoundStatus distinguishes completed, partial, and failed", () => {
  assert.equal(
    deriveRoundStatus([
      { status: "success" },
      { status: "success" },
      { status: "offline" },
    ]),
    "completed",
  )

  assert.equal(
    deriveRoundStatus([
      { status: "success" },
      { status: "failed" },
      { status: "offline" },
    ]),
    "partial",
  )

  assert.equal(
    deriveRoundStatus([
      { status: "failed" },
      { status: "offline" },
    ]),
    "failed",
  )
})

test("summarizeRound reports lead and per-status counts", () => {
  const summary = summarizeRound({
    leadStationKey: "xo",
    results: [
      { status: "success" },
      { status: "offline" },
      { status: "failed" },
    ],
  })

  assert.match(summary, /Lead XO/)
  assert.match(summary, /Success 1/)
  assert.match(summary, /offline 1/)
  assert.match(summary, /failed 1/)
})

test("parseDirective trims and rejects empty content", () => {
  assert.equal(parseDirective("  "), null)
  assert.equal(parseDirective(42), null)
  assert.equal(parseDirective("  hello bridge  "), "hello bridge")
})

test("parseRoundsQueryTake clamps to supported range", () => {
  assert.equal(parseRoundsQueryTake(null), 120)
  assert.equal(parseRoundsQueryTake("0"), 1)
  assert.equal(parseRoundsQueryTake("999"), 200)
  assert.equal(parseRoundsQueryTake("60"), 60)
})

test("parseRoundSource supports operator/system", () => {
  assert.equal(parseRoundSource("system"), "system")
  assert.equal(parseRoundSource("anything"), "operator")
})
