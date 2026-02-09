import fs from "node:fs"
import path from "node:path"

export interface IdempotencyRecord {
  key: string
  scope: string
  createdAt: string
  response: Record<string, unknown>
}

function filePath(dataDir: string): string {
  return path.join(dataDir, "idempotency.jsonl")
}

export function lookupIdempotency(dataDir: string, scope: string, key: string): IdempotencyRecord | null {
  const file = filePath(dataDir)
  if (!fs.existsSync(file)) {
    return null
  }

  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const record = JSON.parse(lines[index] || "") as IdempotencyRecord
      if (record.scope === scope && record.key === key) {
        return record
      }
    } catch {
      // Ignore malformed lines to preserve append-only recovery behavior.
    }
  }

  return null
}

export function storeIdempotency(dataDir: string, record: IdempotencyRecord): void {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.appendFileSync(filePath(dataDir), `${JSON.stringify(record)}\n`, "utf8")
}
