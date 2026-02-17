/**
 * Reads DATABASE_URL from a Kubernetes secret in the cluster (e.g. orchwiz-env created by Terraform).
 * Used at launch to derive n8n_database_url when the user has not set postgres_password (local) or
 * database_url (cloud) in the Ship Yard secret template.
 */

export interface ClusterDatabaseUrlInput {
  /** Kubernetes context (e.g. kind-orchwiz) */
  kubeContext: string
  /** Namespace (e.g. orchwiz-starship) */
  namespace: string
  /** App name used to form the secret name: `<appName>-env`. Default orchwiz → orchwiz-env */
  appName?: string
}

export interface RunCommandResult {
  code: number
  stdout?: string
  stderr?: string
}

export type RunCommandFn = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number },
) => Promise<RunCommandResult>

const DEFAULT_APP_NAME = "orchwiz"

/**
 * Returns DATABASE_URL from the cluster secret, or null on any error (secret missing, kubectl fail, etc.).
 * Best-effort: callers should fall back to template values when this returns null.
 */
export async function getDatabaseUrlFromCluster(
  input: ClusterDatabaseUrlInput,
  runCommand: RunCommandFn,
): Promise<string | null> {
  const appName = input.appName?.trim() || DEFAULT_APP_NAME
  const secretName = `${appName}-env`
  const args = [
    "--context",
    input.kubeContext,
    "-n",
    input.namespace,
    "get",
    "secret",
    secretName,
    "-o",
    "jsonpath={.data.DATABASE_URL}",
  ]

  try {
    const result = await runCommand("kubectl", args, { timeoutMs: 15_000 })
    if (result.code !== 0 || typeof result.stdout !== "string") {
      return null
    }
    const b64 = result.stdout.trim()
    if (!b64) {
      return null
    }
    const decoded = Buffer.from(b64, "base64").toString("utf8")
    const url = decoded.trim()
    if (!url || !url.startsWith("postgres")) {
      return null
    }
    return url
  } catch {
    return null
  }
}
