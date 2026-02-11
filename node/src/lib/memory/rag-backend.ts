export type RagBackend = "auto" | "vault-local" | "data-core-merged"

const RAG_BACKENDS: RagBackend[] = ["auto", "vault-local", "data-core-merged"]

export class RagBackendUnavailableError extends Error {
  readonly code = "RAG_BACKEND_UNAVAILABLE"
  readonly status = 409
  readonly backend: RagBackend

  constructor(backend: RagBackend, message?: string) {
    super(message || `Selected RAG backend "${backend}" is unavailable.`)
    this.name = "RagBackendUnavailableError"
    this.backend = backend
  }
}

export function parseRagBackend(value: string | null | undefined): RagBackend {
  if (!value) {
    return "auto"
  }

  const normalized = value.trim().toLowerCase()
  return RAG_BACKENDS.includes(normalized as RagBackend)
    ? (normalized as RagBackend)
    : "auto"
}

export function resolveRagBackend(args: {
  requestedBackend: RagBackend
  dataCoreEnabled: boolean
}): {
  requestedBackend: RagBackend
  effectiveBackend: Exclude<RagBackend, "auto">
} {
  const requestedBackend = args.requestedBackend
  if (requestedBackend === "auto") {
    return {
      requestedBackend,
      effectiveBackend: args.dataCoreEnabled ? "data-core-merged" : "vault-local",
    }
  }

  if (requestedBackend === "data-core-merged" && !args.dataCoreEnabled) {
    throw new RagBackendUnavailableError(
      requestedBackend,
      "Selected RAG backend \"data-core-merged\" requires DATA_CORE_ENABLED=true.",
    )
  }

  return {
    requestedBackend,
    effectiveBackend: requestedBackend,
  }
}
