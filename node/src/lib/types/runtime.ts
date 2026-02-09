export type RuntimeProvider = "openclaw" | "openai-fallback" | "local-fallback"

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
}
