import test from "node:test"
import assert from "node:assert/strict"
import { createTraceGateway } from "./trace-gateway"
import {
  TRACE_ENCRYPTION_ENVELOPE_KIND,
  isEncryptedTraceFieldEnvelope,
} from "./encrypted-trace"

function withEnv<T>(patch: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })
}

test("emitTrace encrypts configured sensitive fields and leaves metadata searchable", async () => {
  await withEnv(
    {
      TRACE_ENCRYPT_ENABLED: "true",
      TRACE_ENCRYPT_REQUIRED: "true",
      TRACE_ENCRYPT_FIELDS: "input.prompt,tool.args",
    },
    async () => {
      let sentPayload: Record<string, unknown> | null = null
      let persistedPayload: Record<string, unknown> | null = null

      const gateway = createTraceGateway({
        encrypt: async ({ context, plaintextB64 }) => ({
          alg: "AES-256-GCM",
          ciphertextB64: `${context}:${plaintextB64}`,
          nonceB64: "nonce",
        }),
        transport: async ({ payload }) => {
          sentPayload = payload
        },
        persist: async ({ payload }) => {
          persistedPayload = payload
        },
        now: () => "2026-02-09T00:00:00.000Z",
      })

      await gateway.emitTrace({
        traceId: "trace-1",
        payload: {
          input: { prompt: "secret prompt" },
          tool: { args: { token: "secret" } },
          status: "ok",
        },
      })

      const encryptedPrompt = ((sentPayload as any).input.prompt) as unknown
      const encryptedArgs = ((sentPayload as any).tool.args) as unknown

      assert.equal(isEncryptedTraceFieldEnvelope(encryptedPrompt), true)
      assert.equal(isEncryptedTraceFieldEnvelope(encryptedArgs), true)
      assert.equal((encryptedPrompt as any).kind, TRACE_ENCRYPTION_ENVELOPE_KIND)
      assert.equal((sentPayload as any).status, "ok")
      assert.deepEqual((sentPayload as any).metadata.encryption, {
        provider: "wallet-enclave",
        mode: "field-level",
        version: 1,
      })

      assert.deepEqual(persistedPayload, sentPayload)
    },
  )
})

test("emitTrace fail-closed drops trace when encryption fails", async () => {
  await withEnv(
    {
      TRACE_ENCRYPT_ENABLED: "true",
      TRACE_ENCRYPT_REQUIRED: "true",
      TRACE_ENCRYPT_FIELDS: "input.prompt",
    },
    async () => {
      let transportCalled = false

      const gateway = createTraceGateway({
        encrypt: async () => {
          throw new Error("encryption broken")
        },
        transport: async () => {
          transportCalled = true
        },
      })

      await gateway.emitTrace({
        traceId: "trace-2",
        payload: {
          input: { prompt: "secret prompt" },
        },
      })

      assert.equal(transportCalled, false)
    },
  )
})

test("emitTrace fail-open sends trace when encryption fails and not required", async () => {
  await withEnv(
    {
      TRACE_ENCRYPT_ENABLED: "true",
      TRACE_ENCRYPT_REQUIRED: "false",
      TRACE_ENCRYPT_FIELDS: "input.prompt",
    },
    async () => {
      let sentPayload: Record<string, unknown> | null = null

      const gateway = createTraceGateway({
        encrypt: async () => {
          throw new Error("encryption broken")
        },
        transport: async ({ payload }) => {
          sentPayload = payload
        },
      })

      await gateway.emitTrace({
        traceId: "trace-3",
        payload: {
          input: { prompt: "secret prompt" },
        },
      })

      assert.equal((sentPayload as any).input.prompt, "secret prompt")
    },
  )
})

test("decryptTraceFields resolves encrypted envelope values", async () => {
  const gateway = createTraceGateway({
    decrypt: async ({ ciphertextB64 }) => {
      const payload = ciphertextB64.split(":").at(-1) || ""
      return {
        plaintextB64: payload,
      }
    },
  })

  const result = await gateway.decryptTraceFields({
    payload: {
      input: {
        prompt: {
          kind: TRACE_ENCRYPTION_ENVELOPE_KIND,
          version: 1,
          alg: "AES-256-GCM",
          context: "observability.trace:trace-1:input.prompt",
          ciphertextB64: `ctx:${Buffer.from("hello", "utf8").toString("base64")}`,
          nonceB64: "nonce",
          encryptedAt: "2026-02-09T00:00:00.000Z",
          fieldPath: "input.prompt",
        },
      },
    },
  })

  assert.equal((result.payload as any).input.prompt, "hello")
})
