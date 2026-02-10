import crypto from "node:crypto"
import type { CloudCatalog } from "@/lib/shipyard/cloud/types"

interface HetznerApiLocation {
  id: number
  name: string
  description: string
  network_zone: string | null
}

interface HetznerApiPrice {
  location: string
  price_hourly: {
    net: string
    gross: string
  }
}

interface HetznerApiServerType {
  id: number
  name: string
  description: string | null
  cores: number
  memory: number
  disk: number
  architecture: string | null
  prices: HetznerApiPrice[]
  available_for_migration: boolean
}

interface HetznerApiImage {
  id: number
  name: string | null
  description: string | null
  type: string
  architecture: string | null
}

interface HetznerListResponse<T> {
  [key: string]: T[]
}

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1"
const DEFAULT_CACHE_TTL_MS = 90_000

interface CatalogCacheEntry {
  expiresAt: number
  catalog: CloudCatalog
}

const catalogCache = new Map<string, CatalogCacheEntry>()

function cacheKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

async function fetchHetznerResource<T>(args: {
  token: string
  resourcePath: string
}): Promise<T[]> {
  const response = await fetch(`${HETZNER_API_BASE}${args.resourcePath}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const errorMessage =
      typeof json?.error?.message === "string"
        ? json.error.message
        : `Hetzner API request failed with status ${response.status}`
    throw new Error(errorMessage)
  }

  const values = Object.values(json as HetznerListResponse<T>)
  const arrayValue = values.find((entry) => Array.isArray(entry))
  return (arrayValue || []) as T[]
}

function parseFloatSafe(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function fetchHetznerCatalog(args: {
  token: string
  cacheTtlMs?: number
  forceRefresh?: boolean
}): Promise<CloudCatalog> {
  const ttlMs = args.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const key = cacheKey(args.token)
  const now = Date.now()

  const cached = catalogCache.get(key)
  if (cached && cached.expiresAt > now && !args.forceRefresh) {
    return cached.catalog
  }

  const [locations, serverTypes, images] = await Promise.all([
    fetchHetznerResource<HetznerApiLocation>({
      token: args.token,
      resourcePath: "/locations?per_page=100",
    }),
    fetchHetznerResource<HetznerApiServerType>({
      token: args.token,
      resourcePath: "/server_types?per_page=100",
    }),
    fetchHetznerResource<HetznerApiImage>({
      token: args.token,
      resourcePath: "/images?type=system&per_page=200",
    }),
  ])

  const catalog: CloudCatalog = {
    fetchedAt: new Date().toISOString(),
    regions: locations.map((location) => ({
      id: String(location.id),
      name: location.name,
      description: location.description,
      networkZone: location.network_zone,
    })),
    machineTypes: serverTypes.map((type) => {
      const knownLocations = type.prices.map((price) => price.location).filter(Boolean)
      const averagePrice =
        type.prices.length > 0
          ? type.prices
              .map((price) => parseFloatSafe(price.price_hourly?.net) || 0)
              .reduce((total, current) => total + current, 0) / type.prices.length
          : null
      return {
        id: String(type.id),
        name: type.name,
        description: type.description || type.name,
        cpu: type.cores,
        memoryGb: type.memory,
        diskGb: type.disk,
        architecture: type.architecture,
        locations: knownLocations,
        priceHourlyEur: averagePrice,
      }
    }),
    images: images.map((image) => ({
      id: String(image.id),
      name: image.name || image.description || String(image.id),
      type: image.type,
      description: image.description || image.name || "Hetzner image",
      architecture: image.architecture,
    })),
  }

  catalogCache.set(key, {
    expiresAt: now + ttlMs,
    catalog,
  })

  return catalog
}

export function clearHetznerCatalogCache(): void {
  catalogCache.clear()
}
