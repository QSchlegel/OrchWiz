import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import test from "node:test"
import { NextResponse } from "next/server"
import {
  SHIPYARD_SELF_HEAL_FEATURE_KEY,
  SHIPYARD_SELF_HEAL_FEATURE_STAGE,
} from "./constants"
import { shipyardSelfHealErrorJson, shipyardSelfHealJson } from "./http"

test("shipyardSelfHealJson appends beta headers and feature metadata", async () => {
  const response = shipyardSelfHealJson({
    ok: true,
  })

  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("shipyardSelfHealErrorJson appends beta metadata for error payloads", async () => {
  const response = shipyardSelfHealErrorJson("Unauthorized", 401, { code: "UNAUTHORIZED" })
  assert.equal(response.status, 401)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), SHIPYARD_SELF_HEAL_FEATURE_KEY)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), SHIPYARD_SELF_HEAL_FEATURE_STAGE)

  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "Unauthorized")
  assert.equal(payload.code, "UNAUTHORIZED")
  assert.deepEqual(payload.feature, {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  })
})

test("non-self-heal responses do not include beta headers by default", async () => {
  const response = NextResponse.json({ ok: true })
  assert.equal(response.headers.get("X-Orchwiz-Feature-Key"), null)
  assert.equal(response.headers.get("X-Orchwiz-Feature-Stage"), null)
})

test("ship-yard launch routes do not import self-heal beta helper", async () => {
  const launchRoutePath = join(process.cwd(), "src/app/api/ship-yard/launch/route.ts")
  const launchSource = await readFile(launchRoutePath, "utf8")
  assert.equal(launchSource.includes("shipyard/self-heal/http"), false)
  assert.equal(launchSource.includes("X-Orchwiz-Feature-Key"), false)

  const loopRoutePath = join(process.cwd(), "src/app/api/ship-yard/launch/loop/route.ts")
  if (existsSync(loopRoutePath)) {
    const loopSource = await readFile(loopRoutePath, "utf8")
    assert.equal(loopSource.includes("shipyard/self-heal/http"), false)
    assert.equal(loopSource.includes("X-Orchwiz-Feature-Key"), false)
  }
})
