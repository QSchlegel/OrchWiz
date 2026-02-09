/**
 * Shared auth utilities used by login and signup flows.
 */

export function generateDisplayName(email: string): string {
  const localPart = email.split("@")[0] || "orchwiz-user"
  const cleaned = localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) {
    return "OrchWiz User"
  }
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase())
}

export function generateBootstrapPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*"
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const randomPart = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
  return `${randomPart}Aa1!`
}

export function parseConfiguredAuthHost(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL
  if (!configuredUrl) {
    return null
  }
  try {
    return new URL(configuredUrl).host
  } catch {
    return null
  }
}

type PasskeyError = {
  code?: string
  message?: string
  status?: number
  statusText?: string
}

export function getPasskeySignInErrorMessage(error: PasskeyError | null): string {
  const code = (error?.code || "").toLowerCase()
  const message = (error?.message || "").toLowerCase()
  const currentHost = typeof window !== "undefined" ? window.location.host : null
  const configuredHost = parseConfiguredAuthHost()

  if (code === "auth_cancelled" || message.includes("cancelled") || message.includes("canceled")) {
    return "Passkey sign-in was cancelled."
  }

  if (message.includes("passkey not found")) {
    return "No passkey found for this account on this device."
  }

  if (message.includes("failed to fetch") || message.includes("networkerror") || message.includes("load failed")) {
    if (configuredHost && currentHost && configuredHost !== currentHost) {
      return `Auth is configured for ${configuredHost}, but you opened ${currentHost}. Set NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL to your current host and restart the app.`
    }
    return "Unable to reach the sign-in service right now. Please try again."
  }

  if (message.includes("security") || message.includes("origin") || message.includes("rpid") || message.includes("relying party")) {
    return "Passkey sign-in domain mismatch. Open the app from the same URL where your passkey was created."
  }

  return "Passkey sign-in failed. Try again or use a magic link instead."
}
