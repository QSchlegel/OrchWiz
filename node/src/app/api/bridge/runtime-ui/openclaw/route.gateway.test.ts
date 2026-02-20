import assert from "node:assert/strict"
import test from "node:test"
import { resolveOpenClawGatewayBaseForBrowser } from "./[stationKey]/[[...runtimePath]]/route"

test("resolveOpenClawGatewayBaseForBrowser prefers runtime-edge metadata URL when reachable", () => {
  const resolved = resolveOpenClawGatewayBaseForBrowser({
    metadataRuntimeUiUrl: "http://127.0.0.1:3100/openclaw/xo",
    resolvedRuntimeBaseUrl: "http://openclaw-xo.orchwiz-starship.svc.cluster.local:18789",
    proxyGatewayBaseUrl: "http://localhost:3000/api/bridge/runtime-ui/openclaw/xo?shipDeploymentId=ship-1",
    stationKey: "xo",
    runningInKubernetes: false,
  })

  assert.equal(resolved, "http://127.0.0.1:3100/openclaw/xo")
})

test("resolveOpenClawGatewayBaseForBrowser skips loopback metadata URL in Kubernetes", () => {
  const resolved = resolveOpenClawGatewayBaseForBrowser({
    metadataRuntimeUiUrl: "http://127.0.0.1:3100/openclaw/ops",
    resolvedRuntimeBaseUrl: "http://openclaw-ops.orchwiz-starship.svc.cluster.local:18789",
    proxyGatewayBaseUrl: "https://app.example.com/api/bridge/runtime-ui/openclaw/ops?shipDeploymentId=ship-1",
    stationKey: "ops",
    runningInKubernetes: true,
  })

  assert.equal(resolved, "https://app.example.com/api/bridge/runtime-ui/openclaw/ops?shipDeploymentId=ship-1")
})

test("resolveOpenClawGatewayBaseForBrowser falls back to resolved runtime URL when public", () => {
  const resolved = resolveOpenClawGatewayBaseForBrowser({
    metadataRuntimeUiUrl: null,
    resolvedRuntimeBaseUrl: "https://openclaw-sec.ship.example.com",
    proxyGatewayBaseUrl: "https://app.example.com/api/bridge/runtime-ui/openclaw/sec?shipDeploymentId=ship-1",
    stationKey: "sec",
    runningInKubernetes: true,
  })

  assert.equal(resolved, "https://openclaw-sec.ship.example.com")
})
