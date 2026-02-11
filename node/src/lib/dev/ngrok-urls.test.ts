import assert from "node:assert/strict"
import test from "node:test"
import { buildNgrokReport, pickPublicUrlForPort, type NgrokTunnel } from "../../../scripts/ngrok-urls"

test("pickPublicUrlForPort resolves matching https tunnel by port", () => {
  const tunnels: NgrokTunnel[] = [
    {
      public_url: "https://app.ngrok-free.app",
      config: {
        addr: "http://localhost:3000",
      },
    },
    {
      public_url: "https://hooks.ngrok-free.app",
      config: {
        addr: "localhost:4000",
      },
    },
  ]

  assert.equal(pickPublicUrlForPort(tunnels, 3000), "https://app.ngrok-free.app")
  assert.equal(pickPublicUrlForPort(tunnels, 4000), "https://hooks.ngrok-free.app")
  assert.equal(pickPublicUrlForPort(tunnels, 5000), null)
})

test("buildNgrokReport renders copy-ready snippets", () => {
  const report = buildNgrokReport([
    {
      public_url: "https://orchwiz-demo.ngrok-free.app",
      config: {
        addr: "localhost:3000",
      },
    },
    {
      public_url: "https://receiver-demo.ngrok-free.app",
      config: {
        addr: "localhost:4000",
      },
    },
  ])

  assert.equal(report.includes("GitHub callback: https://orchwiz-demo.ngrok-free.app/api/auth/callback/github"), true)
  assert.equal(report.includes("Deploy hook: https://receiver-demo.ngrok-free.app/hooks/deploy-status"), true)
  assert.equal(report.includes("HOOK_WEBHOOK_ALLOW_NGROK=true"), true)
})

