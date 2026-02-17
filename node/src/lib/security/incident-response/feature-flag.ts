function envFlag(name: string, fallback = false): boolean {
  const value = process.env[name]
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true
  }

  return fallback
}

export function securityIncidentsEnabled(): boolean {
  // Default on in dev, opt-in in production.
  const fallback = process.env.NODE_ENV !== "production"
  return envFlag("ENABLE_SECURITY_INCIDENTS", fallback)
}

