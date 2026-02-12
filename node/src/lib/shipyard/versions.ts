export const SHIP_VERSION_CATALOG = [
  {
    version: "v1",
    label: "Launch Baseline",
  },
  {
    version: "v2",
    label: "Current Release",
  },
] as const

export type ShipVersion = (typeof SHIP_VERSION_CATALOG)[number]["version"]

export const SHIP_BASELINE_VERSION: ShipVersion = SHIP_VERSION_CATALOG[0].version
export const SHIP_LATEST_VERSION: ShipVersion = SHIP_VERSION_CATALOG[SHIP_VERSION_CATALOG.length - 1].version

const SHIP_VERSION_ORDER = new Map<ShipVersion, number>(
  SHIP_VERSION_CATALOG.map((entry, index) => [entry.version, index]),
)

export function isKnownShipVersion(value: unknown): value is ShipVersion {
  if (typeof value !== "string") return false
  return SHIP_VERSION_ORDER.has(value as ShipVersion)
}

export function resolveShipVersion(value: unknown): ShipVersion {
  if (isKnownShipVersion(value)) {
    return value
  }
  return SHIP_BASELINE_VERSION
}

export function shipVersionNeedsUpgrade(
  currentVersion: unknown,
  targetVersion: ShipVersion = SHIP_LATEST_VERSION,
): boolean {
  const resolvedCurrent = resolveShipVersion(currentVersion)
  const currentRank = SHIP_VERSION_ORDER.get(resolvedCurrent) ?? 0
  const targetRank = SHIP_VERSION_ORDER.get(targetVersion) ?? 0
  return currentRank < targetRank
}

export function latestShipVersion(): ShipVersion {
  return SHIP_LATEST_VERSION
}
