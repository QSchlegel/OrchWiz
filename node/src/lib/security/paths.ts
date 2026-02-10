import { existsSync } from "node:fs"
import { resolve } from "node:path"

export function resolveRepositoryRoot(): string {
  const cwd = process.cwd()
  const directVault = resolve(cwd, "OWZ-Vault")
  if (existsSync(directVault)) {
    return cwd
  }

  const parent = resolve(cwd, "..")
  const parentVault = resolve(parent, "OWZ-Vault")
  if (existsSync(parentVault)) {
    return parent
  }

  return cwd
}

export function resolveSecurityAuditDirectory(): string {
  return resolve(resolveRepositoryRoot(), "OWZ-Vault", "00-Inbox", "Security-Audits")
}

export function resolveBridgeCrewScorecardDirectory(): string {
  return resolve(resolveSecurityAuditDirectory(), "Bridge-Crew")
}
