import test from "node:test"
import assert from "node:assert/strict"
import {
  VOICE_UNDO_DELAY_MS,
  normalizeVoiceTranscript,
  resolveStationFromTranscript,
} from "./voice"

test("VOICE_UNDO_DELAY_MS uses 2.5s hold window", () => {
  assert.equal(VOICE_UNDO_DELAY_MS, 2500)
})

test("normalizeVoiceTranscript compacts whitespace", () => {
  assert.equal(normalizeVoiceTranscript("  hello\n  bridge  "), "hello bridge")
  assert.equal(normalizeVoiceTranscript(42), "")
})

test("resolveStationFromTranscript routes by station keywords", () => {
  const available = ["xo", "ops", "eng", "sec", "med", "cou"] as const

  assert.equal(
    resolveStationFromTranscript({
      transcript: "engineering please run incident triage",
      availableStationKeys: [...available],
    }),
    "eng",
  )

  assert.equal(
    resolveStationFromTranscript({
      transcript: "security run policy review",
      availableStationKeys: [...available],
    }),
    "sec",
  )

  assert.equal(
    resolveStationFromTranscript({
      transcript: "",
      availableStationKeys: [...available],
      fallbackStationKey: "xo",
    }),
    "xo",
  )
})

test("resolveStationFromTranscript falls back when keyword station unavailable", () => {
  assert.equal(
    resolveStationFromTranscript({
      transcript: "engineering triage",
      availableStationKeys: ["xo", "ops"],
      fallbackStationKey: "xo",
    }),
    "xo",
  )
})
