import crypto from "node:crypto"

function masterSecret(): Buffer {
  const secret = process.env.WALLET_ENCLAVE_MASTER_SECRET
  if (!secret) {
    throw new Error("WALLET_ENCLAVE_MASTER_SECRET not set")
  }

  return Buffer.from(secret, "utf8")
}

export function deriveKey(context: string): Buffer {
  const salt = Buffer.from("wallet-enclave-hkdf-salt", "utf8")
  return Buffer.from(crypto.hkdfSync("sha256", masterSecret(), salt, Buffer.from(context, "utf8"), 32))
}

export function encrypt(context: string, plaintextB64: string): {
  alg: "AES-256-GCM"
  ciphertextB64: string
  nonceB64: string
} {
  const key = deriveKey(context)
  const nonce = crypto.randomBytes(12)
  const plaintext = Buffer.from(plaintextB64, "base64")

  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  const packed = Buffer.concat([ciphertext, tag])

  return {
    alg: "AES-256-GCM",
    ciphertextB64: packed.toString("base64"),
    nonceB64: nonce.toString("base64"),
  }
}

export function decrypt(
  context: string,
  ciphertextB64: string,
  nonceB64: string,
): {
  alg: "AES-256-GCM"
  plaintextB64: string
} {
  const key = deriveKey(context)
  const nonce = Buffer.from(nonceB64, "base64")
  const packed = Buffer.from(ciphertextB64, "base64")

  const ciphertext = packed.subarray(0, packed.length - 16)
  const tag = packed.subarray(packed.length - 16)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])

  return {
    alg: "AES-256-GCM",
    plaintextB64: plaintext.toString("base64"),
  }
}
