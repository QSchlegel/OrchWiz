export const LANDING_XO_FEATURE_KEY = "landing-xo"
export const LANDING_XO_DEFAULT_STAGE = "public-preview"

export interface LandingXoFeatureMetadata {
  key: string
  stage: string
}

function normalizeBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false
  }

  return fallback
}

function normalizeStage(value: string | undefined): string {
  if (!value) {
    return LANDING_XO_DEFAULT_STAGE
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : LANDING_XO_DEFAULT_STAGE
}

export function isLandingXoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return normalizeBoolean(env.LANDING_XO_ENABLED, true)
}

export function landingXoFeatureMetadata(env: NodeJS.ProcessEnv = process.env): LandingXoFeatureMetadata {
  return {
    key: LANDING_XO_FEATURE_KEY,
    stage: normalizeStage(env.LANDING_XO_STAGE),
  }
}
