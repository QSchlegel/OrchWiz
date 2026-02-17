import assert from "node:assert/strict"
import test from "node:test"
import { MeshMultisigApiError, getNonce, walletIds } from "./client"

function withMockFetch<T>(mock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, run: () => Promise<T>) {
  const original = globalThis.fetch
  globalThis.fetch = mock as any
  return run().finally(() => {
    globalThis.fetch = original
  })
}

test("getNonce returns parsed nonce", async () => {
  await withMockFetch(
    async () => new Response(JSON.stringify({ nonce: "deadbeef" }), { status: 200, headers: { "content-type": "application/json" } }),
    async () => {
      const res = await getNonce({ baseUrl: "https://multisig.meshjs.dev", addressHex: "00" })
      assert.equal(res.nonce, "deadbeef")
    },
  )
})

test("walletIds throws MeshMultisigApiError on 401 with error payload", async () => {
  await withMockFetch(
    async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
        statusText: "Unauthorized",
      }),
    async () => {
      await assert.rejects(
        () => walletIds({ baseUrl: "https://multisig.meshjs.dev", token: "t", addressHex: "00" }),
        (err: any) => {
          assert.ok(err instanceof MeshMultisigApiError)
          assert.equal(err.status, 401)
          assert.equal(err.message, "Unauthorized")
          return true
        },
      )
    },
  )
})

test("walletIds throws on unexpected success payload shape", async () => {
  await withMockFetch(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    async () => {
      await assert.rejects(
        () => walletIds({ baseUrl: "https://multisig.meshjs.dev", token: "t", addressHex: "00" }),
        (err: any) => {
          assert.ok(err instanceof MeshMultisigApiError)
          assert.equal(err.status, 502)
          assert.equal(err.code, "BAD_UPSTREAM_RESPONSE")
          return true
        },
      )
    },
  )
})

