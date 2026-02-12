import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetBridgeState } from "./route"

function requestFor(url: string): NextRequest {
  const request = new Request(url, { method: "GET" })
  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(url),
    json: request.json.bind(request),
  } as unknown as NextRequest
}

function createBaseDeps(overrides: Record<string, unknown> = {}) {
  return {
    getSessionUser: async () => ({ id: "user-1" }),
    listAvailableShips: async () => [
      {
        id: "ship-1",
        name: "USS Test",
        status: "active",
        updatedAt: new Date("2026-02-12T12:00:00.000Z"),
        nodeId: "node-1",
        nodeType: "local",
        deploymentProfile: "local_starship_build",
      },
    ],
    findSelectedShipMonitoring: async () => ({
      id: "ship-1",
      status: "active",
      deploymentProfile: "local_starship_build",
      config: {
        monitoring: {
          grafanaUrl: "https://grafana.example.com",
          prometheusUrl: "https://prometheus.example.com",
          kubeviewUrl: "https://kubeview.example.com/kubeview",
        },
      },
    }),
    listBridgeCrew: async () => [],
    listTasks: async () => [],
    listForwardedBridgeEvents: async () => [],
    listForwardedSystemEvents: async () => [],
    now: () => new Date("2026-02-12T12:30:00.000Z"),
    ...overrides,
  }
}

async function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const original: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    original[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("handleGetBridgeState returns 401 when session is missing", async () => {
  const response = await handleGetBridgeState(
    requestFor("http://localhost/api/bridge/state"),
    createBaseDeps({
      getSessionUser: async () => null,
    }) as any,
  )

  assert.equal(response.status, 401)
})

test("handleGetBridgeState synthesizes monitoring cards and applies fresh forwarded overrides", async () => {
  const response = await handleGetBridgeState(
    requestFor("http://localhost/api/bridge/state?includeForwarded=true"),
    createBaseDeps({
      listForwardedSystemEvents: async () => [
        {
          id: "evt-prom",
          occurredAt: new Date("2026-02-12T12:25:00.000Z"),
          payload: {
            service: "prometheus",
            shipDeploymentId: "ship-1",
            state: "critical",
            detail: "Target scrape failures",
          },
          sourceNode: {
            nodeId: "node-1",
            name: "Ship Node 1",
          },
        },
      ],
    }) as any,
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  const monitoring = payload.monitoring as Record<string, Record<string, unknown>>
  const prometheus = monitoring.prometheus

  assert.equal(prometheus.service, "prometheus")
  assert.equal(prometheus.state, "critical")
  assert.equal(prometheus.source, "forwarded")
  assert.equal(prometheus.href, "https://prometheus.example.com/")
  assert.equal(prometheus.observedAt, "2026-02-12T12:25:00.000Z")
  assert.equal(monitoring.kubeview.service, "kubeview")
  assert.equal(monitoring.kubeview.state, "nominal")
  assert.equal(monitoring.kubeview.href, "https://kubeview.example.com/kubeview")

  const systems = payload.systems as Array<Record<string, unknown>>
  const prometheusSystem = systems.find((entry) => entry.service === "prometheus")
  assert.ok(prometheusSystem)
  assert.equal(prometheusSystem?.state, "critical")
  assert.equal(prometheusSystem?.source, "forwarded")
})

test("handleGetBridgeState marks missing monitoring URLs as warnings", async () => {
  const response = await handleGetBridgeState(
    requestFor("http://localhost/api/bridge/state?includeForwarded=true"),
    createBaseDeps({
      findSelectedShipMonitoring: async () => ({
        id: "ship-1",
        status: "active",
        deploymentProfile: "local_starship_build",
        config: {
          monitoring: {
            grafanaUrl: "",
            prometheusUrl: "",
            kubeviewUrl: "",
          },
        },
      }),
    }) as any,
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  const monitoring = payload.monitoring as Record<string, Record<string, unknown>>

  assert.equal(monitoring.grafana.state, "warning")
  assert.match(String(monitoring.grafana.detail), /Set Grafana URL/i)
  assert.equal(monitoring.prometheus.state, "warning")
  assert.match(String(monitoring.prometheus.detail), /Set Prometheus URL/i)
  assert.equal(monitoring.kubeview.state, "warning")
  assert.match(String(monitoring.kubeview.detail), /Set KubeView URL/i)
})

test("handleGetBridgeState marks stale monitoring telemetry as warning after 15m", async () => {
  const response = await handleGetBridgeState(
    requestFor("http://localhost/api/bridge/state?includeForwarded=true"),
    createBaseDeps({
      listForwardedSystemEvents: async () => [
        {
          id: "evt-graf",
          occurredAt: new Date("2026-02-12T12:00:00.000Z"),
          payload: {
            service: "grafana",
            shipDeploymentId: "ship-1",
            state: "nominal",
            detail: "Healthy",
          },
          sourceNode: {
            nodeId: "node-1",
            name: "Ship Node 1",
          },
        },
      ],
    }) as any,
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  const monitoring = payload.monitoring as Record<string, Record<string, unknown>>

  assert.equal(monitoring.grafana.state, "warning")
  assert.match(String(monitoring.grafana.detail), /stale/i)
  assert.equal(monitoring.grafana.observedAt, "2026-02-12T12:00:00.000Z")
})

test("handleGetBridgeState respects optional shipDeploymentId when matching monitoring events", async () => {
  const response = await handleGetBridgeState(
    requestFor("http://localhost/api/bridge/state?includeForwarded=true"),
    createBaseDeps({
      listForwardedSystemEvents: async () => [
        {
          id: "evt-prom-other-ship",
          occurredAt: new Date("2026-02-12T12:29:00.000Z"),
          payload: {
            service: "prometheus",
            shipDeploymentId: "ship-2",
            state: "critical",
            detail: "Should be ignored",
          },
          sourceNode: {
            nodeId: "node-2",
            name: "Other Node",
          },
        },
      ],
    }) as any,
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  const monitoring = payload.monitoring as Record<string, Record<string, unknown>>

  assert.equal(monitoring.prometheus.state, "warning")
  assert.match(String(monitoring.prometheus.detail), /No recent Prometheus telemetry/i)
})

test("handleGetBridgeState returns unresolved monitoring placeholders when no ships exist", async () => {
  const response = await handleGetBridgeState(
    requestFor("http://localhost/api/bridge/state"),
    createBaseDeps({
      listAvailableShips: async () => [],
      findSelectedShipMonitoring: async () => null,
    }) as any,
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.selectedShipDeploymentId, null)

  const monitoring = payload.monitoring as Record<string, Record<string, unknown>>
  assert.equal(monitoring.grafana.state, "warning")
  assert.match(String(monitoring.grafana.detail), /Select an active ship/i)
  assert.equal(monitoring.prometheus.state, "warning")
  assert.match(String(monitoring.prometheus.detail), /Select an active ship/i)
  assert.equal(monitoring.kubeview.state, "warning")
  assert.match(String(monitoring.kubeview.detail), /Select an active ship/i)
})

test("handleGetBridgeState exposes runtimeUi.openclaw iframe target", async () => {
  await withEnv(
    {
      OPENCLAW_UI_URLS: JSON.stringify({
        xo: "https://openclaw-xo.example.com",
        ops: "https://openclaw-ops.example.com",
      }),
      OPENCLAW_GATEWAY_URL: "http://127.0.0.1:18789",
    },
    async () => {
      const response = await handleGetBridgeState(
        requestFor("http://localhost/api/bridge/state"),
        createBaseDeps() as any,
      )

      assert.equal(response.status, 200)
      const payload = (await response.json()) as Record<string, unknown>
      const runtimeUi = payload.runtimeUi as Record<string, Record<string, unknown>>
      const openclaw = runtimeUi.openclaw

      assert.equal(openclaw.label, "OpenClaw Runtime UI")
      assert.equal(openclaw.href, "/api/bridge/runtime-ui/openclaw/xo?shipDeploymentId=ship-1")
      assert.equal(openclaw.source, "openclaw_ui_urls")
      const instances = openclaw.instances as Array<Record<string, unknown>>
      assert.equal(instances.length, 6)
      const xo = instances.find((instance) => instance.stationKey === "xo")
      assert.equal(xo?.href, "/api/bridge/runtime-ui/openclaw/xo?shipDeploymentId=ship-1")
      assert.equal(xo?.source, "openclaw_ui_urls")
    },
  )
})
