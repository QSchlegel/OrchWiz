import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeNightlyHour,
  normalizeTimezone,
  parseBearerToken,
  parseScope,
  parseTake,
} from "@/lib/agentsync/route-helpers"

test("parseScope defaults to selected_agent and accepts bridge_crew", () => {
  assert.equal(parseScope(undefined), "selected_agent")
  assert.equal(parseScope("selected_agent"), "selected_agent")
  assert.equal(parseScope("bridge_crew"), "bridge_crew")
})

test("parseTake clamps to supported bounds", () => {
  assert.equal(parseTake(null), 30)
  assert.equal(parseTake("0"), 1)
  assert.equal(parseTake("999"), 100)
  assert.equal(parseTake("42"), 42)
})

test("parseBearerToken extracts bearer value", () => {
  assert.equal(parseBearerToken(null), null)
  assert.equal(parseBearerToken("Token abc"), null)
  assert.equal(parseBearerToken("Bearer abc123"), "abc123")
})

test("preferences helpers normalize timezone and hour", () => {
  assert.equal(normalizeTimezone("UTC"), "UTC")
  assert.equal(normalizeTimezone(""), "UTC")
  assert.equal(normalizeNightlyHour(-5), 0)
  assert.equal(normalizeNightlyHour(33), 23)
  assert.equal(normalizeNightlyHour("2"), 2)
})
