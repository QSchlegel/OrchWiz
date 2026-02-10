import { dataCoreDualReadVerifyEnabled } from "./config"

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`
  }

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

export function logDualReadDrift(args: {
  route: string
  key: string
  legacyPayload: unknown
  dataCorePayload: unknown
}): void {
  if (!dataCoreDualReadVerifyEnabled()) {
    return
  }

  const legacy = stableStringify(args.legacyPayload)
  const dataCore = stableStringify(args.dataCorePayload)
  if (legacy === dataCore) {
    return
  }

  console.warn("[data-core dual-read drift]", {
    route: args.route,
    key: args.key,
    legacySize: legacy.length,
    dataCoreSize: dataCore.length,
  })
}

