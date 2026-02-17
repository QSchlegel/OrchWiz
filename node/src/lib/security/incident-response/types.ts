export interface AuroraEnumItem {
  id: number
  text: string
}

export interface AuroraGridRecordBase {
  recid: number
  [key: string]: unknown
}

export interface AuroraTimelineRecord extends AuroraGridRecordBase {
  date_time?: string
  event_type?: unknown
  event_host?: unknown
  direction?: unknown
  event_source_host?: unknown
  killchain?: unknown
  event_data?: string
  notes?: string
  visual?: boolean
  followup?: boolean
  attribution?: string
  owner?: unknown
}

export interface AuroraMalwareRecord extends AuroraGridRecordBase {
  date_added?: string
  text?: string
  path_on_disk?: string
  creation_date?: string
  modification_date?: string
  hostname?: unknown
  md5?: string
  vt?: string
  attribution?: string
  notes?: string
}

export interface AuroraNetworkIndicatorRecord extends AuroraGridRecordBase {
  date_added?: string
  ip?: string
  domainname?: string
  port?: number | string
  context?: string
  last_activity?: string
  malware?: unknown
  whois?: string
  attribution?: string
  vt?: string
}

export interface AuroraEvidenceRecord extends AuroraGridRecordBase {
  date_acquired?: string
  type?: unknown
  name?: string
  description?: string
  size?: string
  hash?: string
  provider?: unknown
  location?: string
}

export interface AuroraActionRecord extends AuroraGridRecordBase {
  date_added?: string
  date_due?: string
  task_type?: unknown
  task?: string
  status?: unknown
  owner?: unknown
}

export interface AuroraCaseNoteRecord extends AuroraGridRecordBase {
  date_added?: string
  note?: string
  owner?: unknown
}

export interface AuroraCaseFile {
  storage_format_version: number
  locked: boolean

  // Case metadata.
  case_id: string
  client: string
  start_date: string
  summary: string

  // Aurora grids.
  timeline: AuroraTimelineRecord[]
  investigated_systems: AuroraGridRecordBase[]
  malware: AuroraMalwareRecord[]
  compromised_accounts: AuroraGridRecordBase[]
  network_indicators: AuroraNetworkIndicatorRecord[]
  exfiltration: AuroraGridRecordBase[]
  hosts: AuroraGridRecordBase[]
  systems: AuroraGridRecordBase[]
  osint: AuroraGridRecordBase[]
  investigators: AuroraGridRecordBase[]
  evidence: AuroraEvidenceRecord[]
  actions: AuroraActionRecord[]
  casenotes: AuroraCaseNoteRecord[]

  // Enumerations used by the Aurora UI.
  event_types: AuroraEnumItem[]
  system_types: AuroraEnumItem[]
  verdicts: AuroraEnumItem[]
  status: AuroraEnumItem[]
  task_types: AuroraEnumItem[]
  direction: AuroraEnumItem[]
  killchain: AuroraEnumItem[]
  evidence_types: AuroraEnumItem[]

  // Optional Aurora case configuration fields (not stored by the template).
  mispserver?: string
  mispeventid?: string

  // Preserve other Aurora fields and forward-compatible keys.
  [key: string]: unknown
}

