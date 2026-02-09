export interface OpenClawContextFile {
  path: string
  content: string
}

export interface OpenClawBridgeCrewRecord {
  role: string
  callsign: string
  name: string
  content: string
}

export interface OpenClawContextBundle {
  schemaVersion: "orchwiz.openclaw.context.v1"
  source: "ship-yard-bootstrap"
  deploymentId: string
  generatedAt: string
  files: OpenClawContextFile[]
}

interface ContextSection {
  fileName: string
  content: string
}

const SECTION_HEADING_REGEX = /^\s{0,3}#{1,6}\s+([A-Za-z][A-Za-z0-9._-]*\.md)\s*$/u

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n").trim()
}

function slugifyCallsign(callsign: string): string {
  return callsign.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-")
}

function splitContentIntoContextFiles(content: string): ContextSection[] {
  const normalized = normalizeNewlines(content)
  if (!normalized) {
    return [{ fileName: "PROMPT.md", content: "" }]
  }

  const lines = normalized.split("\n")
  const sections: ContextSection[] = []
  let currentFileName: string | null = null
  let currentBody: string[] = []

  const flush = () => {
    if (!currentFileName) return
    sections.push({
      fileName: currentFileName,
      content: currentBody.join("\n").trim(),
    })
  }

  for (const line of lines) {
    const headingMatch = line.match(SECTION_HEADING_REGEX)
    if (headingMatch) {
      flush()
      currentFileName = headingMatch[1].trim()
      currentBody = []
      continue
    }
    currentBody.push(line)
  }
  flush()

  if (sections.length === 0) {
    return [{ fileName: "PROMPT.md", content: normalized }]
  }

  return sections
}

export function buildOpenClawBridgeCrewContextBundle(args: {
  deploymentId: string
  bridgeCrew: OpenClawBridgeCrewRecord[]
  generatedAt?: Date
}): OpenClawContextBundle {
  const generatedAt = (args.generatedAt || new Date()).toISOString()
  const files: OpenClawContextFile[] = []
  const manifestEntries: Array<{ role: string; callsign: string; name: string; dir: string }> = []

  const sortedCrew = [...args.bridgeCrew].sort((left, right) => left.callsign.localeCompare(right.callsign))
  for (const member of sortedCrew) {
    const callsign = member.callsign.trim()
    if (!callsign) continue

    const callsignDir = slugifyCallsign(callsign)
    const sections = splitContentIntoContextFiles(member.content)
    for (const section of sections) {
      files.push({
        path: `bridge-crew/${callsignDir}/${section.fileName}`,
        content: section.content,
      })
    }

    manifestEntries.push({
      role: member.role,
      callsign,
      name: member.name,
      dir: `bridge-crew/${callsignDir}`,
    })
  }

  files.unshift({
    path: "bridge-crew/MANIFEST.json",
    content: JSON.stringify(
      {
        deploymentId: args.deploymentId,
        generatedAt,
        crew: manifestEntries,
      },
      null,
      2,
    ),
  })

  return {
    schemaVersion: "orchwiz.openclaw.context.v1",
    source: "ship-yard-bootstrap",
    deploymentId: args.deploymentId,
    generatedAt,
    files,
  }
}

export function encodeOpenClawContextBundle(bundle: OpenClawContextBundle): string {
  return Buffer.from(JSON.stringify(bundle), "utf8").toString("base64")
}
