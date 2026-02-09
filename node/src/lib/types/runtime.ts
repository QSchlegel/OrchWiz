export type RuntimeProvider = "openclaw" | "openai-fallback" | "local-fallback"

export interface RuntimeSignatureBundle {
  keyRef: string
  signature: string
  algorithm: string
  payloadHash: string
  signedAt: string
  address?: string
  key?: string
}

export interface RuntimeRequest {
  sessionId: string
  prompt: string
  metadata?: Record<string, unknown>
}

export interface RuntimeResult {
  provider: RuntimeProvider
  output: string
  fallbackUsed: boolean
  metadata?: Record<string, unknown>
  signatureBundle?: RuntimeSignatureBundle
}
