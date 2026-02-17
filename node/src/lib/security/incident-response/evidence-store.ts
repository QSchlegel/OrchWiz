import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { resolveSecurityIncidentDirectory } from "@/lib/security/paths"

function safeStamp(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-")
}

export async function writeSecurityIncidentEvidenceBlob(args: {
  incidentId: string
  provider: "vt" | "misp"
  kind: string
  payload: unknown
  now?: Date
}): Promise<{ path: string }> {
  const root = resolveSecurityIncidentDirectory()
  await mkdir(root, { recursive: true })

  const stamp = safeStamp(args.now)
  const safeKind = args.kind.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "response"
  const baseName = `security_incident_${args.incidentId}_${stamp}_${args.provider}_${safeKind}.json`
  const path = resolve(root, baseName)

  await writeFile(path, JSON.stringify(args.payload, null, 2), "utf8")
  return { path }
}

