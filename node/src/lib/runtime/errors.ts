import type { RuntimeProvider } from "@/lib/types/runtime"

export interface RuntimeProviderErrorOptions {
  provider: RuntimeProvider
  message: string
  code: string
  recoverable: boolean
  status?: number
  details?: Record<string, unknown>
}

export class RuntimeProviderError extends Error {
  provider: RuntimeProvider
  code: string
  recoverable: boolean
  status: number
  details?: Record<string, unknown>

  constructor(options: RuntimeProviderErrorOptions) {
    super(options.message)
    this.name = "RuntimeProviderError"
    this.provider = options.provider
    this.code = options.code
    this.recoverable = options.recoverable
    this.status = options.status ?? 500
    this.details = options.details
  }
}

export function createRecoverableRuntimeError(options: {
  provider: RuntimeProvider
  code: string
  message: string
  details?: Record<string, unknown>
}): RuntimeProviderError {
  return new RuntimeProviderError({
    provider: options.provider,
    code: options.code,
    message: options.message,
    recoverable: true,
    status: 502,
    details: options.details,
  })
}

export function createNonRecoverableRuntimeError(options: {
  provider: RuntimeProvider
  code: string
  message: string
  status?: number
  details?: Record<string, unknown>
}): RuntimeProviderError {
  return new RuntimeProviderError({
    provider: options.provider,
    code: options.code,
    message: options.message,
    recoverable: false,
    status: options.status ?? 500,
    details: options.details,
  })
}
