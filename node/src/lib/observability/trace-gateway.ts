import {
  decryptWithWalletEnclave,
  encryptWithWalletEnclave,
} from "@/lib/wallet-enclave/client"
import {
  buildTraceEncryptionContext,
  isEncryptedTraceFieldEnvelope,
  TRACE_ENCRYPTION_ENVELOPE_KIND,
  TRACE_ENCRYPTION_ENVELOPE_VERSION,
  type EncryptedTraceFieldEnvelopeV1,
} from "./encrypted-trace"
import {
  getValueAtPath,
  sensitiveTraceFieldPaths,
  setValueAtPath,
  traceEncryptionEnabled,
  traceEncryptionRequired,
} from "./sensitive-trace-fields"
import { emitToLangfuse } from "./langfuse-transport"

export interface TraceEmitInput {
  traceId: string
  userId?: string | null
  sessionId?: string | null
  source?: string | null
  status?: string | null
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
  skipEncryption?: boolean
}

export interface TraceDecryptInput {
  payload: Record<string, unknown>
}

export interface DecryptedTraceView {
  payload: Record<string, unknown>
}

type EncryptFn = (args: { context: string; plaintextB64: string }) => Promise<{ alg: "AES-256-GCM"; ciphertextB64: string; nonceB64: string }>
type DecryptFn = (args: { context: string; ciphertextB64: string; nonceB64: string }) => Promise<{ plaintextB64: string }>
type TransportFn = (input: { traceId: string; payload: Record<string, unknown> }) => Promise<void>
type PersistFn = (input: { traceId: string; userId?: string | null; sessionId?: string | null; source?: string | null; status?: string | null; payload: Record<string, unknown>; metadata?: Record<string, unknown> }) => Promise<void>

export interface TraceGateway {
  emitTrace(input: TraceEmitInput): Promise<void>
  decryptTraceFields(input: TraceDecryptInput): Promise<DecryptedTraceView>
}

export interface TraceGatewayDependencies {
  encrypt?: EncryptFn
  decrypt?: DecryptFn
  transport?: TransportFn
  persist?: PersistFn
  now?: () => string
}

function deepClonePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>
}

function toBase64(plaintext: string): string {
  return Buffer.from(plaintext, "utf8").toString("base64")
}

function fromBase64(payload: string): string {
  return Buffer.from(payload, "base64").toString("utf8")
}

export function createTraceGateway(deps: TraceGatewayDependencies = {}): TraceGateway {
  const encrypt = deps.encrypt ?? encryptWithWalletEnclave
  const decrypt = deps.decrypt ?? decryptWithWalletEnclave
  const transport = deps.transport ?? emitToLangfuse
  const now = deps.now ?? (() => new Date().toISOString())
  const persist = deps.persist

  return {
    async emitTrace(input: TraceEmitInput): Promise<void> {
      const normalizedPayload = deepClonePayload(input.payload)
      const encryptEnabled = traceEncryptionEnabled() && input.skipEncryption !== true

      if (encryptEnabled) {
        const paths = sensitiveTraceFieldPaths()

        try {
          for (const fieldPath of paths) {
            const fieldValue = getValueAtPath(normalizedPayload, fieldPath)
            if (fieldValue === undefined || fieldValue === null) {
              continue
            }

            const plaintext = typeof fieldValue === "string"
              ? fieldValue
              : JSON.stringify(fieldValue)
            const context = buildTraceEncryptionContext(input.traceId, fieldPath)
            const encrypted = await encrypt({
              context,
              plaintextB64: toBase64(plaintext),
            })

            const envelope: EncryptedTraceFieldEnvelopeV1 = {
              kind: TRACE_ENCRYPTION_ENVELOPE_KIND,
              version: TRACE_ENCRYPTION_ENVELOPE_VERSION,
              alg: encrypted.alg,
              context,
              ciphertextB64: encrypted.ciphertextB64,
              nonceB64: encrypted.nonceB64,
              encryptedAt: now(),
              fieldPath,
            }

            setValueAtPath(normalizedPayload, fieldPath, envelope)
          }

          const metadata = normalizedPayload.metadata
          const metadataRecord = (metadata && typeof metadata === "object" && !Array.isArray(metadata))
            ? { ...(metadata as Record<string, unknown>) }
            : {}

          metadataRecord.encryption = {
            provider: "wallet-enclave",
            mode: "field-level",
            version: 1,
          }

          normalizedPayload.metadata = metadataRecord
        } catch (error) {
          const required = traceEncryptionRequired()
          console.error("trace_encryption_failed", {
            traceId: input.traceId,
            code: "TRACE_ENCRYPTION_FAILED",
            message: (error as Error).message,
            required,
          })

          if (required) {
            return
          }
        }
      }

      if (persist) {
        await persist({
          traceId: input.traceId,
          userId: input.userId,
          sessionId: input.sessionId,
          source: input.source,
          status: input.status,
          payload: normalizedPayload,
          metadata: input.metadata,
        })
      }

      await transport({
        traceId: input.traceId,
        payload: normalizedPayload,
      })
    },

    async decryptTraceFields(input: TraceDecryptInput): Promise<DecryptedTraceView> {
      const output = deepClonePayload(input.payload)
      const walk = async (node: unknown): Promise<unknown> => {
        if (Array.isArray(node)) {
          const values = await Promise.all(node.map((value) => walk(value)))
          return values
        }

        if (!node || typeof node !== "object") {
          return node
        }

        if (isEncryptedTraceFieldEnvelope(node)) {
          const decrypted = await decrypt({
            context: node.context,
            ciphertextB64: node.ciphertextB64,
            nonceB64: node.nonceB64,
          })
          const plaintext = fromBase64(decrypted.plaintextB64)

          try {
            return JSON.parse(plaintext) as unknown
          } catch {
            return plaintext
          }
        }

        const entries = Object.entries(node as Record<string, unknown>)
        const transformed = await Promise.all(
          entries.map(async ([key, value]) => [key, await walk(value)] as const),
        )

        return Object.fromEntries(transformed)
      }

      return {
        payload: (await walk(output)) as Record<string, unknown>,
      }
    },
  }
}
