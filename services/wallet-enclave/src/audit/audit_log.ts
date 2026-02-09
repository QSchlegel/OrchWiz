import fs from "node:fs"
import path from "node:path"

export type AuditEvent = {
  ts: string
  requestId: string
  endpoint: string
  decision: "allow" | "deny"
  reason?: string
  meta?: unknown
  error?: { code: string; message: string }
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true })
}

export function appendAuditJsonl(dataDir: string, event: AuditEvent): void {
  ensureDir(dataDir)
  const file = path.join(dataDir, "audit.jsonl")
  fs.appendFileSync(file, `${JSON.stringify(event)}\n`, { encoding: "utf8" })
}
