import type { DeploymentProfile } from "@/lib/deployment/profile"
import type { ShipyardSecretTemplateValues } from "@/lib/shipyard/secret-vault"

export const N8N_REQUIRED_SECRET_FIELDS = [
  "n8n_database_url",
  "n8n_basic_auth_user",
  "n8n_basic_auth_password",
  "n8n_encryption_key",
  "n8n_public_base_url",
] as const

export type N8NRequiredSecretField = (typeof N8N_REQUIRED_SECRET_FIELDS)[number]

const LOCAL_N8N_DATABASE_USER = "orchwiz"
const LOCAL_N8N_DATABASE_NAME = "orchis"
const LOCAL_N8N_DATABASE_PORT = "5432"
const LOCAL_NAMESPACE_FALLBACK = "orchwiz-starship"
const LOCAL_N8N_PUBLIC_BASE_URL_FALLBACK = "http://localhost:5678/n8n"
const CLOUD_N8N_PUBLIC_BASE_URL_FALLBACK = "https://n8n.example.com"

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function listMissingRequiredN8NSecrets(
  values: ShipyardSecretTemplateValues,
): N8NRequiredSecretField[] {
  return N8N_REQUIRED_SECRET_FIELDS.filter((field) => !asNonEmptyString(values[field]))
}

export function buildLocalDefaultN8NDatabaseUrl(args: {
  deploymentProfile: DeploymentProfile
  namespace?: string | null
  postgresPassword?: string | null
}): string | null {
  if (args.deploymentProfile !== "local_starship_build") {
    return null
  }

  const postgresPassword = asNonEmptyString(args.postgresPassword)
  if (!postgresPassword) {
    return null
  }

  const namespace = asNonEmptyString(args.namespace) || LOCAL_NAMESPACE_FALLBACK
  const host = `orchwiz-postgres-postgresql.${namespace}.svc.cluster.local`
  const user = encodeURIComponent(LOCAL_N8N_DATABASE_USER)
  const password = encodeURIComponent(postgresPassword)
  const database = encodeURIComponent(LOCAL_N8N_DATABASE_NAME)

  return `postgresql://${user}:${password}@${host}:${LOCAL_N8N_DATABASE_PORT}/${database}?schema=public`
}

export function buildDefaultN8NDatabaseUrl(args: {
  deploymentProfile: DeploymentProfile
  namespace?: string | null
  postgresPassword?: string | null
  databaseUrl?: string | null
}): string | null {
  if (args.deploymentProfile === "cloud_shipyard") {
    return asNonEmptyString(args.databaseUrl)
  }

  return buildLocalDefaultN8NDatabaseUrl({
    deploymentProfile: args.deploymentProfile,
    namespace: args.namespace,
    postgresPassword: args.postgresPassword,
  })
}

export function defaultN8NPublicBaseUrlFallback(profile: DeploymentProfile): string {
  return profile === "local_starship_build"
    ? LOCAL_N8N_PUBLIC_BASE_URL_FALLBACK
    : CLOUD_N8N_PUBLIC_BASE_URL_FALLBACK
}

export function buildDefaultN8NPublicBaseUrl(args: {
  deploymentProfile: DeploymentProfile
  nodeUrl?: string | null
}): string {
  const nodeUrl = asNonEmptyString(args.nodeUrl)
  if (!nodeUrl) {
    return defaultN8NPublicBaseUrlFallback(args.deploymentProfile)
  }

  try {
    const parsed = new URL(nodeUrl)
    return `${parsed.origin}/n8n`
  } catch {
    return defaultN8NPublicBaseUrlFallback(args.deploymentProfile)
  }
}
