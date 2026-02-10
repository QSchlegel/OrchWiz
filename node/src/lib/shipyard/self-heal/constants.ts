export const SHIPYARD_SELF_HEAL_FEATURE_KEY = "shipyard-self-heal"
export const SHIPYARD_SELF_HEAL_FEATURE_STAGE = "beta"

export interface ShipyardFeatureMetadata {
  key: string
  stage: string
}

export function shipyardSelfHealFeatureMetadata(): ShipyardFeatureMetadata {
  return {
    key: SHIPYARD_SELF_HEAL_FEATURE_KEY,
    stage: SHIPYARD_SELF_HEAL_FEATURE_STAGE,
  }
}
