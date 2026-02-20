import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handleGetOpenClawRuntimeSsh } from "./route"

function requestFor(url: string): NextRequest {
  const request = new Request(url, { method: "GET" })
  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(url),
    json: request.json.bind(request),
  } as unknown as NextRequest
}

test("runtime ssh preflight returns 401 when session is missing", async () => {
  const response = await handleGetOpenClawRuntimeSsh(
    requestFor("http://localhost/api/bridge/runtime-ssh/openclaw/xo"),
    { stationKey: "xo" },
    {
      getSessionUser: async () => null,
      resolveTarget: async () => ({
        ok: false,
        status: 403,
        code: "SSH_TTY_DISABLED",
        detail: "disabled",
        suggestedActions: [],
      }),
    },
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, false)
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("runtime ssh preflight returns ws metadata on success", async () => {
  const response = await handleGetOpenClawRuntimeSsh(
    requestFor("http://localhost/api/bridge/runtime-ssh/openclaw/xo?shipDeploymentId=ship-1"),
    { stationKey: "xo" },
    {
      getSessionUser: async () => ({ id: "user-1" }),
      resolveTarget: async () => ({
        ok: true,
        target: {
          strategy: "deployment_tunnel",
          stationKey: "xo",
          shipDeploymentId: "ship-1",
          namespace: "orchwiz-shipyard",
          sshHost: "203.0.113.10",
          sshPort: 22,
          sshUser: "root",
          privateKeyPem: "PRIVATE",
          remoteCommand: "kubectl -n orchwiz-shipyard exec -it deployment/openclaw-xo -- /bin/sh",
          commandPreview: "ssh -tt -p 22 root@203.0.113.10 \"kubectl ...\"",
        },
      }),
    },
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, true)
  assert.equal(payload.stationKey, "xo")
  assert.equal(payload.shipDeploymentId, "ship-1")
  assert.equal(payload.strategy, "deployment_tunnel")
  assert.equal(
    payload.wsPath,
    "/api/bridge/runtime-ssh/openclaw/xo/ws?shipDeploymentId=ship-1",
  )
})

test("runtime ssh preflight returns structured blocked error payload", async () => {
  const response = await handleGetOpenClawRuntimeSsh(
    requestFor("http://localhost/api/bridge/runtime-ssh/openclaw/xo"),
    { stationKey: "xo" },
    {
      getSessionUser: async () => ({ id: "user-1" }),
      resolveTarget: async () => ({
        ok: false,
        status: 403,
        code: "SSH_TTY_DISABLED",
        detail: "SSH mode disabled",
        suggestedActions: ["Enable ORCHWIZ_BRIDGE_SSH_TTY_ENABLED=true"],
      }),
    },
  )

  assert.equal(response.status, 403)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.ok, false)
  assert.equal(payload.code, "SSH_TTY_DISABLED")
  assert.equal(payload.detail, "SSH mode disabled")
  assert.deepEqual(payload.suggestedActions, ["Enable ORCHWIZ_BRIDGE_SSH_TTY_ENABLED=true"])
})
