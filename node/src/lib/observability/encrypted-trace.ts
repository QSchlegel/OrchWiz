export const TRACE_ENCRYPTION_ENVELOPE_KIND = "orchwiz.wallet-enclave.encrypted-trace-field"
export const TRACE_ENCRYPTION_ENVELOPE_VERSION = 1

export interface EncryptedTraceFieldEnvelopeV1 {
  kind: typeof TRACE_ENCRYPTION_ENVELOPE_KIND
  version: typeof TRACE_ENCRYPTION_ENVELOPE_VERSION
  alg: "AES-256-GCM"
  context: string
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
  fieldPath: string
}

export function buildTraceEncryptionContext(traceId: string, fieldPath: string): string {
  const normalizedTraceId = traceId.trim()
  const normalizedPath = fieldPath.trim()
  return `observability.trace:${normalizedTraceId}:${normalizedPath}`
}

export function isEncryptedTraceFieldEnvelope(value: unknown): value is EncryptedTraceFieldEnvelopeV1 {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<EncryptedTraceFieldEnvelopeV1>
  return (
    candidate.kind === TRACE_ENCRYPTION_ENVELOPE_KIND
    && candidate.version === TRACE_ENCRYPTION_ENVELOPE_VERSION
    && candidate.alg === "AES-256-GCM"
    && typeof candidate.context === "string"
    && typeof candidate.ciphertextB64 === "string"
    && typeof candidate.nonceB64 === "string"
    && typeof candidate.encryptedAt === "string"
    && typeof candidate.fieldPath === "string"
  )
}
