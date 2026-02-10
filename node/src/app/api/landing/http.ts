import { NextResponse } from "next/server"
import {
  landingXoFeatureMetadata,
  LANDING_XO_FEATURE_KEY,
  type LandingXoFeatureMetadata,
} from "@/lib/landing/feature"

type JsonObject = Record<string, unknown>

function normalizeResponseInit(init?: number | ResponseInit): ResponseInit {
  if (typeof init === "number") {
    return { status: init }
  }

  return init || {}
}

function setFeatureHeaders(response: NextResponse, feature: LandingXoFeatureMetadata): NextResponse {
  response.headers.set("X-Orchwiz-Feature-Key", LANDING_XO_FEATURE_KEY)
  response.headers.set("X-Orchwiz-Feature-Stage", feature.stage)
  return response
}

export function withLandingFeature<T extends JsonObject>(
  payload: T,
  env: NodeJS.ProcessEnv = process.env,
): T & { feature: LandingXoFeatureMetadata } {
  return {
    ...payload,
    feature: landingXoFeatureMetadata(env),
  }
}

export function landingJson<T extends JsonObject>(
  payload: T,
  init?: number | ResponseInit,
  env: NodeJS.ProcessEnv = process.env,
): NextResponse {
  const feature = landingXoFeatureMetadata(env)
  const response = NextResponse.json(
    {
      ...payload,
      feature,
    },
    normalizeResponseInit(init),
  )
  return setFeatureHeaders(response, feature)
}

export function landingErrorJson(
  error: string,
  status: number,
  extra: JsonObject = {},
  env: NodeJS.ProcessEnv = process.env,
): NextResponse {
  return landingJson(
    {
      error,
      ...extra,
    },
    status,
    env,
  )
}

export function landingFeatureDisabledJson(
  env: NodeJS.ProcessEnv = process.env,
): NextResponse {
  return landingErrorJson(
    "Landing XO is disabled for this deployment.",
    503,
    {
      enabled: false,
      code: "LANDING_XO_DISABLED",
    },
    env,
  )
}
