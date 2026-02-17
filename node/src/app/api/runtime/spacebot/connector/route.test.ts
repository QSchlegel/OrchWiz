import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  handleGetSpacebotConnector,
  handlePostSpacebotConnector,
  type SpacebotConnectorDeps,
} from "./route"

const baseActor = {
  userId: "user-1",
  email: "captain@example.com",
  role: "admin" as const,
  isAdmin: true,
}

function request(url: string, method: string, body?: Record<string, unknown>): NextRequest {
  return new Request(url, {
    method,
    ...(body
      ? {
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      : {}),
  }) as unknown as NextRequest
}

function defaultDeps(overrides: Partial<SpacebotConnectorDeps> = {}): SpacebotConnectorDeps {
  return {
    requireActor: async () => baseActor,
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      SPACEBOT_CONNECTOR_ENABLED: "true",
      SPACEBOT_WEBHOOK_BASE_URL: "http://spacebot:18789",
    } as NodeJS.ProcessEnv,
    commandExists: () => true,
    fileExists: () => true,
    runCommand: async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    }),
    probeHealth: async () => ({
      ok: true,
      status: 200,
      error: null,
    }),
    ...overrides,
  }
}

test("spacebot connector GET returns 401 when actor is unauthorized", async () => {
  const response = await handleGetSpacebotConnector(
    request("http://localhost/api/runtime/spacebot/connector", "GET"),
    defaultDeps({
      requireActor: async () => {
        throw new AccessControlError("Unauthorized", 401, "UNAUTHORIZED")
      },
    }),
  )

  assert.equal(response.status, 401)
  const payload = (await response.json()) as { code?: string }
  assert.equal(payload.code, "UNAUTHORIZED")
})

test("spacebot connector GET validates stack query", async () => {
  const response = await handleGetSpacebotConnector(
    request("http://localhost/api/runtime/spacebot/connector?stack=invalid", "GET"),
    defaultDeps(),
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as { error?: string }
  assert.equal(payload.error, "stack must be one of: dev-local, cloudflare-local")
})

test("spacebot connector GET returns runtime snapshot", async () => {
  const calls: string[][] = []
  const response = await handleGetSpacebotConnector(
    request("http://localhost/api/runtime/spacebot/connector?stack=cloudflare-local", "GET"),
    defaultDeps({
      runCommand: async (_command, args) => {
        calls.push(args)
        return {
          ok: true,
          stdout: "spacebot\n",
          stderr: "",
          exitCode: 0,
        }
      },
      probeHealth: async () => ({
        ok: true,
        status: 200,
        error: null,
      }),
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as {
    stack: string
    running: boolean
    health: { ok: boolean }
    composeFileExists: boolean
    dockerAvailable: boolean
  }
  assert.equal(payload.stack, "cloudflare-local")
  assert.equal(payload.running, true)
  assert.equal(payload.health.ok, true)
  assert.equal(payload.composeFileExists, true)
  assert.equal(payload.dockerAvailable, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.slice(0, 5), ["compose", "-f", calls[0]?.[2] || "", "ps", "--services"])
})

test("spacebot connector POST requires admin actor", async () => {
  const response = await handlePostSpacebotConnector(
    request("http://localhost/api/runtime/spacebot/connector", "POST", {
      action: "start",
      stack: "cloudflare-local",
    }),
    defaultDeps({
      requireActor: async () => ({
        ...baseActor,
        role: "captain",
        isAdmin: false,
      }),
    }),
  )

  assert.equal(response.status, 403)
  const payload = (await response.json()) as { error?: string }
  assert.equal(payload.error, "Only admins can manage Spacebot runtime actions.")
})

test("spacebot connector POST blocks actions when local command execution is disabled", async () => {
  const response = await handlePostSpacebotConnector(
    request("http://localhost/api/runtime/spacebot/connector", "POST", {
      action: "start",
      stack: "cloudflare-local",
    }),
    defaultDeps({
      env: {
        ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      } as NodeJS.ProcessEnv,
    }),
  )

  assert.equal(response.status, 422)
  const payload = (await response.json()) as { code?: string }
  assert.equal(payload.code, "SPACEBOT_CONNECTOR_BLOCKED")
})

test("spacebot connector POST start runs docker compose action and returns snapshot", async () => {
  const calls: string[][] = []
  const response = await handlePostSpacebotConnector(
    request("http://localhost/api/runtime/spacebot/connector", "POST", {
      action: "start",
      stack: "cloudflare-local",
    }),
    defaultDeps({
      runCommand: async (_command, args) => {
        calls.push(args)
        if (args.includes("ps")) {
          return {
            ok: true,
            stdout: "spacebot\n",
            stderr: "",
            exitCode: 0,
          }
        }
        return {
          ok: true,
          stdout: "started",
          stderr: "",
          exitCode: 0,
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  const payload = (await response.json()) as {
    ok: boolean
    action: string
    snapshot: { running: boolean; stack: string }
  }
  assert.equal(payload.ok, true)
  assert.equal(payload.action, "start")
  assert.equal(payload.snapshot.running, true)
  assert.equal(payload.snapshot.stack, "cloudflare-local")
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0]?.slice(0, 4), ["compose", "-f", calls[0]?.[2] || "", "up"])
})

