import assert from "node:assert/strict"
import test from "node:test"
import {
  resolveOpenClawRuntimeUiStations,
  resolveOpenClawRuntimeUrlForStation,
  resolveShipNamespace,
} from "./openclaw-runtime"

async function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("resolveShipNamespace prefers explicit infrastructure namespace", () => {
  assert.equal(
    resolveShipNamespace(
      {
        infrastructure: {
          namespace: "custom-ship-ns",
        },
      },
      "local_starship_build",
    ),
    "custom-ship-ns",
  )
})

test("resolveOpenClawRuntimeUrlForStation reads station map from OPENCLAW_UI_URLS", async () => {
  await withEnv(
    {
      OPENCLAW_UI_URLS: JSON.stringify({
        xo: "https://xo.example.com",
      }),
      OPENCLAW_UI_URL: undefined,
      OPENCLAW_GATEWAY_URL: undefined,
      OPENCLAW_GATEWAY_URLS: undefined,
      OPENCLAW_UI_URL_TEMPLATE: undefined,
      OPENCLAW_GATEWAY_URL_TEMPLATE: undefined,
      OPENCLAW_CLUSTER_SERVICE_URL_TEMPLATE: undefined,
    },
    async () => {
      const resolved = resolveOpenClawRuntimeUrlForStation({
        stationKey: "xo",
        namespace: "orchwiz-starship",
      })
      assert.equal(resolved.href, "https://xo.example.com")
      assert.equal(resolved.source, "openclaw_ui_urls")
    },
  )
})

test("resolveOpenClawRuntimeUrlForStation falls back to cluster template when no explicit URL exists", async () => {
  await withEnv(
    {
      OPENCLAW_UI_URLS: undefined,
      OPENCLAW_UI_URL_TEMPLATE: undefined,
      OPENCLAW_UI_URL: undefined,
      OPENCLAW_GATEWAY_URLS: undefined,
      OPENCLAW_GATEWAY_URL_TEMPLATE: undefined,
      OPENCLAW_GATEWAY_URL: undefined,
      OPENCLAW_CLUSTER_SERVICE_URL_TEMPLATE: "http://openclaw-{stationKey}.{namespace}.svc.cluster.local:18789",
    },
    async () => {
      const resolved = resolveOpenClawRuntimeUrlForStation({
        stationKey: "eng",
        namespace: "orchwiz-starship",
      })
      assert.equal(resolved.href, "http://openclaw-eng.orchwiz-starship.svc.cluster.local:18789")
      assert.equal(resolved.source, "cluster_service_fallback")
    },
  )
})

test("resolveOpenClawRuntimeUrlForStation honors explicit gateway singleton before cluster fallback", async () => {
  await withEnv(
    {
      OPENCLAW_UI_URL: undefined,
      OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
      OPENCLAW_GATEWAY_URLS: undefined,
      OPENCLAW_GATEWAY_URL_TEMPLATE: undefined,
      OPENCLAW_CLUSTER_SERVICE_URL_TEMPLATE: "http://openclaw-{stationKey}.{namespace}.svc.cluster.local:18789",
    },
    async () => {
      const resolved = resolveOpenClawRuntimeUrlForStation({
        stationKey: "sec",
        namespace: "orchwiz-starship",
      })
      assert.equal(resolved.href, "http://127.0.0.1:18789")
      assert.equal(resolved.source, "openclaw_gateway_url")
    },
  )
})

test("resolveOpenClawRuntimeUiStations always returns all six bridge stations", async () => {
  await withEnv(
    {
      OPENCLAW_UI_URLS: undefined,
      OPENCLAW_UI_URL_TEMPLATE: undefined,
      OPENCLAW_UI_URL: undefined,
      OPENCLAW_GATEWAY_URLS: undefined,
      OPENCLAW_GATEWAY_URL_TEMPLATE: undefined,
      OPENCLAW_GATEWAY_URL: undefined,
      OPENCLAW_CLUSTER_SERVICE_URL_TEMPLATE: undefined,
    },
    async () => {
      const stations = resolveOpenClawRuntimeUiStations({
        namespace: "orchwiz-starship",
      })
      assert.equal(stations.length, 6)
      assert.deepEqual(
        stations.map((station) => station.stationKey),
        ["xo", "ops", "eng", "sec", "med", "cou"],
      )
    },
  )
})
