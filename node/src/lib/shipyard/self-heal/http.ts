import { NextResponse } from "next/server"
import {
  SHIPYARD_SELF_HEAL_FEATURE_KEY,
  SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  shipyardSelfHealFeatureMetadata,
  type ShipyardFeatureMetadata,
} from "./constants"

type JsonObject = Record<string, unknown>

function normalizeResponseInit(init?: number | ResponseInit): ResponseInit {
  if (typeof init === "number") {
    return { status: init }
  }

  return init || {}
}

export function withShipyardSelfHealFeature<T extends JsonObject>(
  payload: T,
): T & { feature: ShipyardFeatureMetadata } {
  return {
    ...payload,
    feature: shipyardSelfHealFeatureMetadata(),
  }
}

export function shipyardSelfHealJson<T extends JsonObject>(
  payload: T,
  init?: number | ResponseInit,
): NextResponse {
  const response = NextResponse.json(
    withShipyardSelfHealFeature(payload),
    normalizeResponseInit(init),
  )
  response.headers.set("X-Orchwiz-Feature-Key", SHIPYARD_SELF_HEAL_FEATURE_KEY)
  response.headers.set("X-Orchwiz-Feature-Stage", SHIPYARD_SELF_HEAL_FEATURE_STAGE)
  return response
}

export function shipyardSelfHealErrorJson(
  error: string,
  status: number,
  extra: JsonObject = {},
): NextResponse {
  return shipyardSelfHealJson(
    {
      error,
      ...extra,
    },
    status,
  )
}
