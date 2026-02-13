import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import {
  handlePostCodexCliConnector,
  type RuntimeCodexCliConnectorRouteDeps,
} from "./route"

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

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

function connectorDeps(overrides: Partial<RuntimeCodexCliConnectorRouteDeps> = {}): RuntimeCodexCliConnectorRouteDeps {
  return {
    getSessionUserId: async () => "user-1",
    inspectConnector: async () => ({
      executable: "codex",
      shellExecutable: "codex",
      binaryAvailable: true,
      version: "codex-cli 0.99.0",
      accountConnected: false,
      accountProvider: null,
      statusMessage: "Logged out",
      setupHints: [],
    }),
    connectWithApiKey: async () => ({
      ok: true,
      message: "connected",
    }),
    startDeviceAuth: async () => ({
      ok: true,
      message: "started",
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
      expiresInMinutes: 15,
      awaitingAuthorization: true,
    }),
    logoutAccount: async () => ({
      ok: true,
      message: "logged out",
    }),
    ...overrides,
  }
}

test("codex connector POST returns 401 when session is missing", async () => {
  const response = await handlePostCodexCliConnector(
    requestFor("http://localhost/api/runtime/codex-cli/connector", {
      method: "POST",
      body: JSON.stringify({ action: "start_device_auth" }),
    }),
    connectorDeps({
      getSessionUserId: async () => null,
    }),
  )

  assert.equal(response.status, 401)
})

test("codex connector POST returns 400 on unsupported action", async () => {
  const response = await handlePostCodexCliConnector(
    requestFor("http://localhost/api/runtime/codex-cli/connector", {
      method: "POST",
      body: JSON.stringify({ action: "unsupported_action" }),
    }),
    connectorDeps(),
  )

  assert.equal(response.status, 400)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "Unsupported connector action.")
})

test("codex connector POST requires API key for connect_api_key action", async () => {
  const response = await handlePostCodexCliConnector(
    requestFor("http://localhost/api/runtime/codex-cli/connector", {
      method: "POST",
      body: JSON.stringify({ action: "connect_api_key", apiKey: "   " }),
    }),
    connectorDeps(),
  )

  assert.equal(response.status, 400)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.error, "API key is required for connector setup.")
})

test("codex connector POST returns actionResult and connector for start_device_auth", async () => {
  let startDeviceAuthCalls = 0

  const response = await handlePostCodexCliConnector(
    requestFor("http://localhost/api/runtime/codex-cli/connector", {
      method: "POST",
      body: JSON.stringify({ action: "start_device_auth" }),
    }),
    connectorDeps({
      startDeviceAuth: async () => {
        startDeviceAuthCalls += 1
        return {
          ok: true,
          message: "started",
          verificationUrl: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
          expiresInMinutes: 15,
          awaitingAuthorization: true,
        }
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(startDeviceAuthCalls, 1)

  const payload = await response.json() as Record<string, unknown>
  const actionResult = payload.actionResult as Record<string, unknown>
  assert.equal(actionResult.ok, true)
  assert.equal(actionResult.verificationUrl, "https://auth.openai.com/codex/device")
  assert.equal(actionResult.userCode, "ABCD-EFGH")
  assert.equal(actionResult.expiresInMinutes, 15)
  assert.equal(actionResult.awaitingAuthorization, true)
  assert.equal(typeof payload.connector, "object")
})

test("codex connector POST forwards to provider proxy when CODEX_PROVIDER_PROXY_URL is configured", async () => {
  const restoreProxyUrl = withEnv("CODEX_PROVIDER_PROXY_URL", "http://proxy")
  const restoreProxyKey = withEnv("CODEX_PROVIDER_PROXY_API_KEY", "proxy-secret")

  const previousFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1
    assert.equal(String(url), "http://proxy/v1/codex-cli/connector")
    assert.equal(init?.method, "POST")
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer proxy-secret")
    const payload = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
    assert.equal(payload.action, "start_device_auth")

    return new Response(
      JSON.stringify({
        actionResult: {
          ok: true,
          message: "started",
          verificationUrl: "https://auth.openai.com/codex/device",
          userCode: "ABCD-EFGH",
          expiresInMinutes: 15,
          awaitingAuthorization: true,
        },
        connector: {
          executable: "codex",
          shellExecutable: "codex",
          binaryAvailable: true,
          version: "codex-cli 0.99.0",
          accountConnected: false,
          accountProvider: null,
          statusMessage: "Logged out",
          setupHints: [],
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  }) as typeof fetch

  try {
    const response = await handlePostCodexCliConnector(
      requestFor("http://localhost/api/runtime/codex-cli/connector", {
        method: "POST",
        body: JSON.stringify({ action: "start_device_auth" }),
      }),
      connectorDeps({
        startDeviceAuth: async () => {
          throw new Error("local device auth should not be called when proxy is configured")
        },
      }),
    )

    assert.equal(response.status, 200)
    assert.equal(fetchCalls, 1)
    const payload = await response.json() as Record<string, unknown>
    assert.equal(typeof payload.connector, "object")
    assert.equal(typeof payload.actionResult, "object")
  } finally {
    globalThis.fetch = previousFetch
    restoreProxyUrl()
    restoreProxyKey()
  }
})
