import fs from "node:fs"
import path from "node:path"

export interface Policy {
  allowKeyRefs: string[]
  denyKeyRefs: string[]
}

export const DEFAULT_POLICY: Policy = {
  allowKeyRefs: [],
  denyKeyRefs: [],
}

export interface PolicyDecision {
  ok: boolean
  code?: string
  message?: string
}

export function loadPolicy(dataDir: string): Policy {
  const file = path.join(dataDir, "policy.json")
  if (!fs.existsSync(file)) {
    return DEFAULT_POLICY
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Policy>
  return {
    allowKeyRefs: Array.isArray(parsed.allowKeyRefs)
      ? parsed.allowKeyRefs.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    denyKeyRefs: Array.isArray(parsed.denyKeyRefs)
      ? parsed.denyKeyRefs.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
  }
}

export function checkSignIntent(policy: Policy, keyRef: string): PolicyDecision {
  if (policy.denyKeyRefs.includes(keyRef)) {
    return {
      ok: false,
      code: "KEY_REF_DENIED",
      message: `Signing denied for keyRef '${keyRef}'.`,
    }
  }

  if (policy.allowKeyRefs.length > 0 && !policy.allowKeyRefs.includes(keyRef)) {
    return {
      ok: false,
      code: "KEY_REF_NOT_ALLOWLISTED",
      message: `Signing is only allowed for configured key references.`,
    }
  }

  return { ok: true }
}
