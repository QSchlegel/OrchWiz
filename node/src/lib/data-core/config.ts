function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function dataCoreEnabled(): boolean {
  return asBoolean(process.env.DATA_CORE_ENABLED, false)
}

export function dataCoreDualReadVerifyEnabled(): boolean {
  return asBoolean(process.env.DATA_CORE_DUAL_READ_VERIFY, false)
}

export function dataCoreBaseUrl(): string {
  return (process.env.DATA_CORE_BASE_URL || "http://127.0.0.1:3390").replace(/\/+$/u, "")
}

export function dataCoreApiKey(): string | null {
  const value = process.env.DATA_CORE_API_KEY
  if (!value || !value.trim()) return null
  return value.trim()
}

export function dataCoreCoreId(): string {
  const value = process.env.DATA_CORE_CORE_ID?.trim()
  if (value) return value
  return "node-core"
}

export function dataCoreClusterId(): string {
  const value = process.env.DATA_CORE_CLUSTER_ID?.trim()
  if (value) return value
  return "local"
}

export function dataCoreShipDeploymentIdDefault(): string | null {
  const value = process.env.DATA_CORE_SHIP_DEPLOYMENT_ID
  if (!value || !value.trim()) {
    return null
  }
  return value.trim()
}
