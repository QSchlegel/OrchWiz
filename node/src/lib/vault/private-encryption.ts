export const PRIVATE_ENCRYPTION_ENVELOPE_KIND = "orchwiz.wallet-enclave.encrypted-note"
export const PRIVATE_ENCRYPTION_ENVELOPE_VERSION = 1

export interface PrivateVaultEncryptedEnvelope {
  kind: typeof PRIVATE_ENCRYPTION_ENVELOPE_KIND
  version: typeof PRIVATE_ENCRYPTION_ENVELOPE_VERSION
  alg: "AES-256-GCM"
  context: string
  ciphertextB64: string
  nonceB64: string
  encryptedAt: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildPrivateVaultEncryptionContext(relativePath: string): string {
  return `vault:agent-private:${relativePath}`
}

export function parsePrivateVaultEncryptedEnvelope(markdown: string): PrivateVaultEncryptedEnvelope | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(markdown)
  } catch {
    return null
  }

  if (!isObject(parsed)) {
    return null
  }

  const kind = asNonEmptyString(parsed.kind)
  const alg = asNonEmptyString(parsed.alg)
  const context = asNonEmptyString(parsed.context)
  const ciphertextB64 = asNonEmptyString(parsed.ciphertextB64)
  const nonceB64 = asNonEmptyString(parsed.nonceB64)
  const encryptedAt = asNonEmptyString(parsed.encryptedAt)
  const version = parsed.version

  if (
    kind !== PRIVATE_ENCRYPTION_ENVELOPE_KIND ||
    version !== PRIVATE_ENCRYPTION_ENVELOPE_VERSION ||
    alg !== "AES-256-GCM" ||
    !context ||
    !ciphertextB64 ||
    !nonceB64 ||
    !encryptedAt
  ) {
    return null
  }

  return {
    kind,
    version,
    alg,
    context,
    ciphertextB64,
    nonceB64,
    encryptedAt,
  }
}

export function serializePrivateVaultEncryptedEnvelope(
  envelope: PrivateVaultEncryptedEnvelope,
): string {
  return `${JSON.stringify(envelope, null, 2)}\n`
}
