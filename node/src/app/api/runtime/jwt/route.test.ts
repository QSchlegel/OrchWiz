import assert from "node:assert/strict"
import test from "node:test"
import type { NextRequest } from "next/server"
import { handlePostRuntimeJwt } from "./route"

function requestFor(url: string, headers: Record<string, string> = {}): NextRequest {
  const request = new Request(url, {
    method: "POST",
    headers,
  })

  return {
    ...request,
    headers: request.headers,
    nextUrl: new URL(url),
    json: request.json.bind(request),
  } as unknown as NextRequest
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

const deps = {
  getSession: async () => ({ user: { id: "user-1" } }),
}

test("handlePostRuntimeJwt sets runtime JWT cookie and returns cookie diagnostics", async () => {
  await withEnv(
    {
      ORCHWIZ_RUNTIME_JWT_SECRET: "test-secret",
      ORCHWIZ_RUNTIME_JWT_TTL_SECONDS: "600",
      ORCHWIZ_RUNTIME_JWT_COOKIE_DOMAIN: ".orchwiz.example.com",
      ORCHWIZ_RUNTIME_JWT_COOKIE_SAMESITE: undefined,
    },
    async () => {
      const response = await handlePostRuntimeJwt(
        requestFor("https://orchwiz.example.com/api/runtime/jwt", { "x-forwarded-proto": "https" }),
        deps as any,
      )

      assert.equal(response.status, 200)
      const payload = (await response.json()) as Record<string, unknown>
      assert.equal(payload.ok, true)
      assert.equal(payload.ttlSeconds, 600)

      const cookieDiagnostics = payload.cookie as Record<string, unknown>
      assert.equal(cookieDiagnostics.domain, ".orchwiz.example.com")
      assert.equal(cookieDiagnostics.sameSite, "lax")
      assert.equal(cookieDiagnostics.secure, true)

      const setCookie = response.headers.get("set-cookie")
      assert.ok(setCookie)
      assert.match(setCookie, /owz_runtime_jwt=/u)
      assert.match(setCookie, /HttpOnly/iu)
      assert.match(setCookie, /SameSite=Lax/iu)
      assert.match(setCookie, /Secure/iu)
      assert.match(setCookie, /Domain=\.?orchwiz\.example\.com/iu)
    },
  )
})

test("handlePostRuntimeJwt toggles Secure based on forwarded proto", async () => {
  await withEnv(
    {
      ORCHWIZ_RUNTIME_JWT_SECRET: "test-secret",
      ORCHWIZ_RUNTIME_JWT_TTL_SECONDS: "600",
      ORCHWIZ_RUNTIME_JWT_COOKIE_DOMAIN: undefined,
      ORCHWIZ_RUNTIME_JWT_COOKIE_SAMESITE: undefined,
    },
    async () => {
      const response = await handlePostRuntimeJwt(
        requestFor("http://localhost/api/runtime/jwt", { "x-forwarded-proto": "http" }),
        deps as any,
      )

      assert.equal(response.status, 200)
      const payload = (await response.json()) as Record<string, unknown>
      const cookieDiagnostics = payload.cookie as Record<string, unknown>
      assert.equal(cookieDiagnostics.secure, false)

      const setCookie = response.headers.get("set-cookie")
      assert.ok(setCookie)
      assert.doesNotMatch(setCookie, /Secure/iu)
    },
  )
})

test("handlePostRuntimeJwt returns explicit error code when ORCHWIZ_RUNTIME_JWT_SECRET is missing", async () => {
  await withEnv(
    {
      ORCHWIZ_RUNTIME_JWT_SECRET: undefined,
    },
    async () => {
      const response = await handlePostRuntimeJwt(
        requestFor("http://localhost/api/runtime/jwt", { "x-forwarded-proto": "http" }),
        deps as any,
      )

      assert.equal(response.status, 500)
      const payload = (await response.json()) as Record<string, unknown>
      assert.equal(payload.code, "RUNTIME_JWT_MISSING")
    },
  )
})

