import assert from "node:assert/strict"
import test from "node:test"
import { resolveKubeviewUpstreamBaseUrl } from "./[[...runtimePath]]/route"

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

test("resolveKubeviewUpstreamBaseUrl prefers runtime-ui metadata when reachable", async () => {
  await withEnv(
    {
      KUBEVIEW_UPSTREAM_URL: undefined,
      KUBERNETES_SERVICE_HOST: undefined,
    },
    async () => {
      const resolved = resolveKubeviewUpstreamBaseUrl({
        namespace: "orchwiz-starship",
        metadataRuntimeUiUrl: "http://127.0.0.1:3100/kubeview",
      })

      assert.equal(resolved, "http://127.0.0.1:3100/kubeview")
    },
  )
})

test("resolveKubeviewUpstreamBaseUrl skips loopback metadata inside Kubernetes", async () => {
  await withEnv(
    {
      KUBEVIEW_UPSTREAM_URL: undefined,
      KUBERNETES_SERVICE_HOST: "10.96.0.1",
    },
    async () => {
      const resolved = resolveKubeviewUpstreamBaseUrl({
        namespace: "orchwiz-starship",
        metadataRuntimeUiUrl: "http://127.0.0.1:3100/kubeview",
      })

      assert.equal(resolved, "http://orchwiz-kubeview.orchwiz-starship.svc.cluster.local:8000")
    },
  )
})

test("resolveKubeviewUpstreamBaseUrl honors explicit upstream override when valid", async () => {
  await withEnv(
    {
      KUBEVIEW_UPSTREAM_URL: "https://kubeview.example.com",
      KUBERNETES_SERVICE_HOST: undefined,
    },
    async () => {
      const resolved = resolveKubeviewUpstreamBaseUrl({
        namespace: "orchwiz-starship",
        metadataRuntimeUiUrl: "http://127.0.0.1:3100/kubeview",
      })

      assert.equal(resolved, "https://kubeview.example.com")
    },
  )
})
