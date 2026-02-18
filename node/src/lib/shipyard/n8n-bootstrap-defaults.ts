import {
  isLocalDeploymentProfile,
  type DeploymentProfile,
} from "@/lib/deployment/profile"
import type { ShipyardSecretTemplateValues } from "@/lib/shipyard/secret-vault"

export interface N8NBootstrapDefaultContext {
  deploymentProfile: DeploymentProfile
  namespace?: string | null
  nodeUrl?: string | null
  postgresPassword?: string | null
  databaseUrl?: string | null
}

export interface ApplyN8NBootstrapDefaultsOptions {
  /** When provided, used to generate n8n_basic_auth_password and n8n_encryption_key when missing. Server-only. */
  generateRandomSecret?: (byteLength: number) => string
}

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
  if (!isLocalDeploymentProfile(args.deploymentProfile)) {
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

  // Local: when databaseUrl is provided (e.g. from cluster secret), use it for n8n
  const fromCluster = asNonEmptyString(args.databaseUrl)
  if (fromCluster) {
    return fromCluster
  }

  return buildLocalDefaultN8NDatabaseUrl({
    deploymentProfile: args.deploymentProfile,
    namespace: args.namespace,
    postgresPassword: args.postgresPassword,
  })
}

export function defaultN8NPublicBaseUrlFallback(profile: DeploymentProfile): string {
  return isLocalDeploymentProfile(profile)
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

const DEFAULT_N8N_BASIC_AUTH_USER = "captain"

/**
 * Merges resolved template values with n8n bootstrap defaults for any empty n8n field.
 * Used server-side at bootstrap so launch can proceed when values are derivable.
 * Does not mutate `values`; returns a new object.
 */
export function applyN8NBootstrapDefaults(
  values: ShipyardSecretTemplateValues,
  context: N8NBootstrapDefaultContext,
  options: ApplyN8NBootstrapDefaultsOptions = {},
): ShipyardSecretTemplateValues {
  const merged: ShipyardSecretTemplateValues = { ...values }

  const setIfMissing = (field: N8NRequiredSecretField, candidate: string | null) => {
    if (candidate && asNonEmptyString(candidate)) {
      merged[field] = candidate
    }
  }

  if (!asNonEmptyString(merged.n8n_basic_auth_user)) {
    setIfMissing("n8n_basic_auth_user", DEFAULT_N8N_BASIC_AUTH_USER)
  }

  if (options.generateRandomSecret) {
    if (!asNonEmptyString(merged.n8n_basic_auth_password)) {
      setIfMissing("n8n_basic_auth_password", options.generateRandomSecret(32))
    }
    if (!asNonEmptyString(merged.n8n_encryption_key)) {
      setIfMissing("n8n_encryption_key", options.generateRandomSecret(32))
    }
  }

  if (!asNonEmptyString(merged.n8n_database_url)) {
    setIfMissing(
      "n8n_database_url",
      buildDefaultN8NDatabaseUrl({
        deploymentProfile: context.deploymentProfile,
        namespace: context.namespace,
        postgresPassword: context.postgresPassword,
        databaseUrl: context.databaseUrl,
      }),
    )
  }

  if (!asNonEmptyString(merged.n8n_public_base_url)) {
    setIfMissing(
      "n8n_public_base_url",
      buildDefaultN8NPublicBaseUrl({
        deploymentProfile: context.deploymentProfile,
        nodeUrl: context.nodeUrl,
      }),
    )
  }

  return merged
}
