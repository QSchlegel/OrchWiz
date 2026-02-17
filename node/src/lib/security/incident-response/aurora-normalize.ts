import { z } from "zod"
import { AURORA_STORAGE_FORMAT_VERSION, buildEmptyAuroraCaseFile } from "./aurora-template"
import type { AuroraCaseFile, AuroraEnumItem } from "./types"
import { ensureRecids } from "./recid"

const AuroraCaseFileLooseSchema = z
  .object({
    storage_format_version: z.number().optional(),
    locked: z.boolean().optional(),
    case_id: z.string().optional(),
    caseid: z.string().optional(),
    client: z.string().optional(),
    start_date: z.string().optional(),
    summary: z.string().optional(),
    mispserver: z.string().optional(),
    mispeventid: z.string().optional(),
    timeline: z.array(z.unknown()).optional(),
    investigated_systems: z.array(z.unknown()).optional(),
    malware: z.array(z.unknown()).optional(),
    compromised_accounts: z.array(z.unknown()).optional(),
    network_indicators: z.array(z.unknown()).optional(),
    exfiltration: z.array(z.unknown()).optional(),
    hosts: z.array(z.unknown()).optional(),
    systems: z.array(z.unknown()).optional(),
    osint: z.array(z.unknown()).optional(),
    investigators: z.array(z.unknown()).optional(),
    evidence: z.array(z.unknown()).optional(),
    actions: z.array(z.unknown()).optional(),
    casenotes: z.array(z.unknown()).optional(),
    event_types: z.array(z.unknown()).optional(),
    system_types: z.array(z.unknown()).optional(),
    verdicts: z.array(z.unknown()).optional(),
    status: z.array(z.unknown()).optional(),
    task_types: z.array(z.unknown()).optional(),
    direction: z.array(z.unknown()).optional(),
    killchain: z.array(z.unknown()).optional(),
    evidence_types: z.array(z.unknown()).optional(),
  })
  .passthrough()

export class AuroraCaseFileNormalizeError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(
    message: string,
    options: {
      status?: number
      code?: string
      details?: unknown
    } = {},
  ) {
    super(message)
    this.name = "AuroraCaseFileNormalizeError"
    this.status = options.status ?? 400
    this.code = options.code ?? "AURORA_CASEFILE_INVALID"
    this.details = options.details
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toEnumItem(value: unknown): AuroraEnumItem | null {
  const record = asRecord(value)
  if (!record) return null

  const text = typeof record.text === "string" ? record.text : null
  if (!text) return null

  const rawId = record.id
  let id: number | null = null
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    id = Math.trunc(rawId)
  } else if (typeof rawId === "string") {
    const parsed = Number.parseInt(rawId.trim(), 10)
    id = Number.isFinite(parsed) ? parsed : null
  }

  if (!id || id <= 0) return null

  return { id, text }
}

function normalizeEnumList(value: unknown, fallback: AuroraEnumItem[]): AuroraEnumItem[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const items: AuroraEnumItem[] = []
  for (const entry of value) {
    const item = toEnumItem(entry)
    if (item) {
      items.push(item)
    }
  }

  return items.length > 0 ? items : fallback
}

function normalizeGridRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return []
  }

  const records: Record<string, unknown>[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (record) {
      records.push({ ...record })
    }
  }

  return records
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeImportedAuroraCaseFile(input: unknown): AuroraCaseFile {
  const parsed = AuroraCaseFileLooseSchema.safeParse(input)
  if (!parsed.success) {
    throw new AuroraCaseFileNormalizeError("Invalid Aurora case file JSON.", {
      status: 400,
      code: "AURORA_CASEFILE_INVALID_JSON",
      details: parsed.error.flatten(),
    })
  }

  const template = buildEmptyAuroraCaseFile()

  // Strip known secret fields if they exist in imported Aurora files.
  // OrchWiz stores integration secrets separately (encrypted envelope per-user).
  const raw = parsed.data as Record<string, unknown>
  const { mispapikey: _mispApiKey, vtapikey: _vtApiKey, ...rawWithoutSecrets } = raw

  const importedVersion =
    typeof rawWithoutSecrets.storage_format_version === "number"
      ? rawWithoutSecrets.storage_format_version
      : null
  if (importedVersion !== null && importedVersion > AURORA_STORAGE_FORMAT_VERSION) {
    throw new AuroraCaseFileNormalizeError(
      `Aurora storage_format_version=${importedVersion} is newer than supported ${AURORA_STORAGE_FORMAT_VERSION}.`,
      {
        status: 400,
        code: "AURORA_CASEFILE_UNSUPPORTED_VERSION",
        details: { importedVersion, supportedVersion: AURORA_STORAGE_FORMAT_VERSION },
      },
    )
  }

  const normalized: AuroraCaseFile = {
    ...template,
    ...(rawWithoutSecrets as AuroraCaseFile),
    storage_format_version: AURORA_STORAGE_FORMAT_VERSION,
    // Export-friendly default: unlocked file so Aurora does not force read-only on open.
    locked: false,
  }

  normalized.case_id =
    normalizeNonEmptyString(rawWithoutSecrets.case_id) ||
    normalizeNonEmptyString(rawWithoutSecrets.caseid) ||
    template.case_id

  normalized.client = normalizeNonEmptyString(rawWithoutSecrets.client) || ""
  normalized.start_date = normalizeNonEmptyString(rawWithoutSecrets.start_date) || ""
  normalized.summary = normalizeNonEmptyString(rawWithoutSecrets.summary) || ""

  normalized.timeline = ensureRecids(normalizeGridRecords(rawWithoutSecrets.timeline)) as any
  normalized.investigated_systems = ensureRecids(
    normalizeGridRecords(rawWithoutSecrets.investigated_systems),
  ) as any
  normalized.malware = ensureRecids(normalizeGridRecords(rawWithoutSecrets.malware)) as any
  normalized.compromised_accounts = ensureRecids(
    normalizeGridRecords(rawWithoutSecrets.compromised_accounts),
  ) as any
  normalized.network_indicators = ensureRecids(
    normalizeGridRecords(rawWithoutSecrets.network_indicators),
  ) as any
  normalized.exfiltration = ensureRecids(normalizeGridRecords(rawWithoutSecrets.exfiltration)) as any
  normalized.hosts = ensureRecids(normalizeGridRecords(rawWithoutSecrets.hosts)) as any
  normalized.systems = ensureRecids(normalizeGridRecords(rawWithoutSecrets.systems)) as any
  normalized.osint = ensureRecids(normalizeGridRecords(rawWithoutSecrets.osint)) as any
  normalized.investigators = ensureRecids(normalizeGridRecords(rawWithoutSecrets.investigators)) as any
  normalized.evidence = ensureRecids(normalizeGridRecords(rawWithoutSecrets.evidence)) as any
  normalized.actions = ensureRecids(normalizeGridRecords(rawWithoutSecrets.actions)) as any
  normalized.casenotes = ensureRecids(normalizeGridRecords(rawWithoutSecrets.casenotes)) as any

  normalized.event_types = normalizeEnumList(rawWithoutSecrets.event_types, template.event_types)
  normalized.system_types = normalizeEnumList(rawWithoutSecrets.system_types, template.system_types)
  normalized.verdicts = normalizeEnumList(rawWithoutSecrets.verdicts, template.verdicts)
  normalized.status = normalizeEnumList(rawWithoutSecrets.status, template.status)
  normalized.task_types = normalizeEnumList(rawWithoutSecrets.task_types, template.task_types)
  normalized.direction = normalizeEnumList(rawWithoutSecrets.direction, template.direction)
  normalized.killchain = normalizeEnumList(rawWithoutSecrets.killchain, template.killchain)
  normalized.evidence_types = normalizeEnumList(rawWithoutSecrets.evidence_types, template.evidence_types)

  const mispserver = normalizeNonEmptyString(rawWithoutSecrets.mispserver)
  if (mispserver) {
    normalized.mispserver = mispserver
  } else {
    delete normalized.mispserver
  }

  const mispeventid = normalizeNonEmptyString(rawWithoutSecrets.mispeventid)
  if (mispeventid) {
    normalized.mispeventid = mispeventid
  } else {
    delete normalized.mispeventid
  }

  return normalized
}

