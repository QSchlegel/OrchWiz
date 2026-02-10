import assert from "node:assert/strict"
import test from "node:test"
import {
  clearHetznerCatalogCache,
  fetchHetznerCatalog,
} from "@/lib/shipyard/cloud/providers/hetzner/catalog"

const originalFetch = globalThis.fetch

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

test("fetchHetznerCatalog maps API payload into catalog shape", async () => {
  clearHetznerCatalogCache()

  let callCount = 0
  globalThis.fetch = (async (input: string | URL) => {
    callCount += 1
    const url = String(input)
    if (url.includes("/locations")) {
      return jsonResponse({
        locations: [
          {
            id: 1,
            name: "nbg1",
            description: "Nuremberg",
            network_zone: "eu-central",
          },
        ],
      })
    }

    if (url.includes("/server_types")) {
      return jsonResponse({
        server_types: [
          {
            id: 10,
            name: "cx22",
            description: "2 vCPU, 4 GB RAM",
            cores: 2,
            memory: 4,
            disk: 40,
            architecture: "x86",
            prices: [
              {
                location: "nbg1",
                price_hourly: {
                  net: "0.013",
                  gross: "0.015",
                },
              },
            ],
            available_for_migration: true,
          },
        ],
      })
    }

    if (url.includes("/images")) {
      return jsonResponse({
        images: [
          {
            id: 20,
            name: "ubuntu-24.04",
            description: "Ubuntu 24.04",
            type: "system",
            architecture: "x86",
          },
        ],
      })
    }

    return new Response("{}", { status: 404 })
  }) as typeof fetch

  try {
    const catalog = await fetchHetznerCatalog({
      token: "token-1",
      forceRefresh: true,
    })

    assert.equal(catalog.regions.length, 1)
    assert.equal(catalog.regions[0].name, "nbg1")
    assert.equal(catalog.machineTypes.length, 1)
    assert.equal(catalog.machineTypes[0].name, "cx22")
    assert.equal(catalog.machineTypes[0].priceHourlyEur, 0.013)
    assert.equal(catalog.images.length, 1)
    assert.equal(catalog.images[0].name, "ubuntu-24.04")
    assert.equal(callCount, 3)
  } finally {
    globalThis.fetch = originalFetch
    clearHetznerCatalogCache()
  }
})

test("fetchHetznerCatalog serves cached result for same token", async () => {
  clearHetznerCatalogCache()
  let callCount = 0

  globalThis.fetch = (async (input: string | URL) => {
    callCount += 1
    const url = String(input)
    if (url.includes("/locations")) {
      return jsonResponse({ locations: [] })
    }
    if (url.includes("/server_types")) {
      return jsonResponse({ server_types: [] })
    }
    return jsonResponse({ images: [] })
  }) as typeof fetch

  try {
    await fetchHetznerCatalog({ token: "token-1" })
    await fetchHetznerCatalog({ token: "token-1" })
    assert.equal(callCount, 3)
  } finally {
    globalThis.fetch = originalFetch
    clearHetznerCatalogCache()
  }
})
