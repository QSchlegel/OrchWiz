import { decode } from "cbor-x"

function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") ? hex.slice(2) : hex
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = stripHexPrefix(hex.trim())
  if (normalized.length === 0) return new Uint8Array()
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex: expected an even number of characters.")
  }
  if (!/^[0-9a-fA-F]+$/u.test(normalized)) {
    throw new Error("Invalid hex: contains non-hex characters.")
  }

  const out = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0")
  }
  return out
}

function mapLikeGet(input: unknown, key: number): unknown {
  if (input instanceof Map) {
    return input.get(key)
  }
  if (input && typeof input === "object") {
    const record = input as any
    return record[key] ?? record[String(key)]
  }
  return undefined
}

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  return null
}

export function decodeFirstVkeyWitness(witnessSetCborHex: string): { vkeyHex: string; signatureHex: string } {
  const decoded = decode(hexToBytes(witnessSetCborHex))
  const vkeyWitnesses = mapLikeGet(decoded, 0)

  if (!Array.isArray(vkeyWitnesses) || vkeyWitnesses.length === 0) {
    throw new Error("Witness set did not include any vkey witnesses.")
  }

  const first = vkeyWitnesses[0]
  if (!Array.isArray(first) || first.length !== 2) {
    throw new Error("Invalid vkey witness shape in witness set.")
  }

  const vkeyBytes = asBytes(first[0])
  const signatureBytes = asBytes(first[1])
  if (!vkeyBytes || !signatureBytes) {
    throw new Error("Invalid vkey witness encoding (expected byte arrays).")
  }

  if (vkeyBytes.length !== 32) {
    throw new Error(`Invalid vkey length (${vkeyBytes.length}); expected 32 bytes.`)
  }
  if (signatureBytes.length !== 64) {
    throw new Error(`Invalid signature length (${signatureBytes.length}); expected 64 bytes.`)
  }

  return { vkeyHex: bytesToHex(vkeyBytes), signatureHex: bytesToHex(signatureBytes) }
}

