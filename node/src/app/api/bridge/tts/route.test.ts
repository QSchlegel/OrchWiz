import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { KugelAudioTtsError } from "@/lib/tts/kugelaudio"
import { handlePostBridgeTts } from "./route"

function requestFor(url: string, init?: RequestInit): NextRequest {
  const request = new Request(url, init)
  return {
    ...request,
    headers: request.headers,
    json: request.json.bind(request),
    nextUrl: new URL(url),
  } as unknown as NextRequest
}

test("bridge tts route returns unauthorized without session", async () => {
  const response = await handlePostBridgeTts(
    requestFor("http://localhost/api/bridge/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "hello",
      }),
    }),
    {
      getSession: async () => null,
      synthesize: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 401)
})

test("bridge tts route rejects invalid payload", async () => {
  const response = await handlePostBridgeTts(
    requestFor("http://localhost/api/bridge/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: " ",
        stationKey: "invalid",
      }),
    }),
    {
      getSession: async () => ({ user: { id: "user-1" } }),
      synthesize: async () => {
        throw new Error("should not run")
      },
    },
  )

  assert.equal(response.status, 400)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "INVALID_TEXT")
})

test("bridge tts route surfaces disabled or unconfigured state", async () => {
  const response = await handlePostBridgeTts(
    requestFor("http://localhost/api/bridge/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "hello bridge",
      }),
    }),
    {
      getSession: async () => ({ user: { id: "user-1" } }),
      synthesize: async () => {
        throw new KugelAudioTtsError("Kugelaudio not configured", {
          status: 503,
          code: "BRIDGE_TTS_NOT_CONFIGURED",
        })
      },
    },
  )

  assert.equal(response.status, 503)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "BRIDGE_TTS_NOT_CONFIGURED")
})

test("bridge tts route maps upstream errors", async () => {
  const response = await handlePostBridgeTts(
    requestFor("http://localhost/api/bridge/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "hello bridge",
        stationKey: "xo",
        surface: "bridge-call",
      }),
    }),
    {
      getSession: async () => ({ user: { id: "user-1" } }),
      synthesize: async () => {
        throw new KugelAudioTtsError("upstream failure", {
          status: 502,
          code: "KUGELAUDIO_UPSTREAM_ERROR",
        })
      },
    },
  )

  assert.equal(response.status, 502)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "KUGELAUDIO_UPSTREAM_ERROR")
})

test("bridge tts route maps timeout errors", async () => {
  const response = await handlePostBridgeTts(
    requestFor("http://localhost/api/bridge/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "hello bridge",
      }),
    }),
    {
      getSession: async () => ({ user: { id: "user-1" } }),
      synthesize: async () => {
        throw new KugelAudioTtsError("timed out", {
          status: 504,
          code: "KUGELAUDIO_TIMEOUT",
        })
      },
    },
  )

  assert.equal(response.status, 504)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.code, "KUGELAUDIO_TIMEOUT")
})

test("bridge tts route returns audio/wav on success", async () => {
  const buffer = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]).buffer
  const response = await handlePostBridgeTts(
    requestFor("http://localhost/api/bridge/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "hello bridge",
        stationKey: "xo",
        surface: "bridge-chat",
      }),
    }),
    {
      getSession: async () => ({ user: { id: "user-1" } }),
      synthesize: async () => ({
        audio: buffer,
        contentType: "audio/wav",
        voice: "xo-voice",
      }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("content-type"), "audio/wav")
  assert.equal(response.headers.get("cache-control"), "no-store")
  const payload = await response.arrayBuffer()
  assert.equal(payload.byteLength, buffer.byteLength)
})
