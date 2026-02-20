import assert from "node:assert/strict"
import type { AddressInfo } from "node:net"
import test from "node:test"
import { createRuntimeEdgeServer } from "./server"

function withEnv<K extends keyof NodeJS.ProcessEnv>(key: K, value: string | undefined) {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }

  return () => {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

async function listenRuntimeEdge() {
  const server = createRuntimeEdgeServer()
  server.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", resolve))

  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

test("runtime-edge /health is unauthenticated", async () => {
  const { baseUrl, close } = await listenRuntimeEdge()

  try {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    const payload = await response.json() as Record<string, unknown>
    assert.equal(payload.ok, true)
  } finally {
    await close()
  }
})

test("runtime-edge /metrics requires bearer token and serves Prometheus format", async () => {
  const restoreMetricsToken = withEnv("PROMETHEUS_METRICS_BEARER_TOKEN", "runtime-metrics-token")
  const restoreNodeEnv = withEnv("NODE_ENV", "production")
  const { baseUrl, close } = await listenRuntimeEdge()

  try {
    const unauthorized = await fetch(`${baseUrl}/metrics`)
    assert.equal(unauthorized.status, 401)

    const authorized = await fetch(`${baseUrl}/metrics`, {
      headers: {
        Authorization: "Bearer runtime-metrics-token",
      },
    })
    assert.equal(authorized.status, 200)
    assert.match(authorized.headers.get("content-type") || "", /text\/plain/i)
    const body = await authorized.text()
    assert.match(body, /orchwiz_http_requests_total/)
    assert.match(body, /service="runtime-edge"/)
    assert.match(body, /orchwiz_runtime_cpu_percent/)
  } finally {
    await close()
    restoreNodeEnv()
    restoreMetricsToken()
  }
})
