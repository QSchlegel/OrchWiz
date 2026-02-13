function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseApiError(payload: unknown, fallback: string): { message: string; code: string | null } {
  const record = asRecord(payload)
  const message = asNonEmptyString(record?.error) || fallback
  const code = asNonEmptyString(record?.code)

  return { message, code }
}

export function isWalletEnclaveCode(code: string | null): code is string {
  return typeof code === "string" && code.startsWith("WALLET_ENCLAVE_")
}

export function walletEnclaveGuidance(code: string): { title: string; steps: string[]; suggestedCommands: string[] } {
  if (code === "WALLET_ENCLAVE_UNREACHABLE") {
    return {
      title: "Wallet enclave unreachable",
      steps: [
        "Start the wallet-enclave process/sidecar and ensure it is reachable at WALLET_ENCLAVE_URL (default http://127.0.0.1:3377).",
        "Confirm WALLET_ENCLAVE_ENABLED=true and WALLET_ENCLAVE_URL is correct for this environment.",
        "If WALLET_ENCLAVE_SHARED_SECRET is configured, ensure the enclave expects the same token header.",
      ],
      suggestedCommands: [
        "curl -sS -m 2 http://127.0.0.1:3377/ || true",
        "lsof -nP -iTCP:3377 -sTCP:LISTEN || true",
        "cd node && rg '^WALLET_ENCLAVE_' .env || true",
      ],
    }
  }

  if (code === "WALLET_ENCLAVE_DISABLED") {
    return {
      title: "Wallet enclave disabled",
      steps: [
        "Enable the enclave (WALLET_ENCLAVE_ENABLED=true) when encrypted secret storage is required.",
        "Restart the Next.js dev server after changing environment variables.",
      ],
      suggestedCommands: ["cd node && rg '^WALLET_ENCLAVE_' .env || true"],
    }
  }

  if (code === "WALLET_ENCLAVE_REJECTED") {
    return {
      title: "Wallet enclave rejected request",
      steps: [
        "Verify the enclave is running and accepting requests.",
        "If using WALLET_ENCLAVE_SHARED_SECRET, confirm the token matches the enclave configuration.",
      ],
      suggestedCommands: ["cd node && rg '^WALLET_ENCLAVE_(URL|SHARED_SECRET|ENABLED)' .env || true"],
    }
  }

  return {
    title: "Wallet enclave error",
    steps: [
      "Start the wallet-enclave process/sidecar and ensure it is reachable at WALLET_ENCLAVE_URL (default http://127.0.0.1:3377).",
      "Confirm WALLET_ENCLAVE_ENABLED=true and WALLET_ENCLAVE_URL is correct for this environment.",
      "If WALLET_ENCLAVE_SHARED_SECRET is configured, ensure the enclave expects the same token header.",
    ],
    suggestedCommands: [
      "curl -sS -m 2 http://127.0.0.1:3377/ || true",
      "lsof -nP -iTCP:3377 -sTCP:LISTEN || true",
      "cd node && rg '^WALLET_ENCLAVE_' .env || true",
    ],
  }
}

export function buildUiError(
  payload: unknown,
  _status: number,
  fallback: string,
): { text: string; code: string | null; suggestedCommands?: string[] } {
  const parsed = parseApiError(payload, fallback)

  if (isWalletEnclaveCode(parsed.code)) {
    return {
      text: parsed.message,
      code: parsed.code,
      suggestedCommands: walletEnclaveGuidance(parsed.code).suggestedCommands,
    }
  }

  return {
    text: parsed.message,
    code: parsed.code,
  }
}
