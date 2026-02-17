"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { RecordGrid } from "@/components/security/incident-response/RecordGrid"
import type { AuroraCaseFile } from "@/lib/security/incident-response/types"

type IncidentSeverity = "low" | "medium" | "high" | "critical"
type IncidentStatus = "open" | "investigating" | "contained" | "eradicated" | "recovered" | "closed"

interface IncidentRecord {
  id: string
  ownerUserId: string
  title: string
  summary: string | null
  status: IncidentStatus
  severity: IncidentSeverity
  isShared: boolean
  sessionId: string | null
  mispEventId: string | null
  mispPushedAt: string | null
  createdAt: string
  updatedAt: string
  closedAt: string | null
}

function nextRecid(records: Array<{ recid?: unknown }> | null | undefined): number {
  if (!records || records.length < 1) return 1
  let highest = 1
  for (const record of records) {
    const recid = typeof record?.recid === "number" ? Math.trunc(record.recid) : null
    if (recid && recid > highest) highest = recid
  }
  return highest + 1
}

function enumText(list: Array<{ text?: unknown }> | undefined | null): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map((v) => (typeof v?.text === "string" ? v.text : null))
    .filter((v): v is string => Boolean(v))
}

function gridText(list: Array<Record<string, unknown>> | undefined | null, field: string): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map((v) => (typeof v?.[field] === "string" ? (v[field] as string) : null))
    .filter((v): v is string => Boolean(v))
}

export default function SecurityIncidentDetailPage({ params }: { params: { incidentId: string } }) {
  const [incident, setIncident] = useState<IncidentRecord | null>(null)
  const [caseFile, setCaseFile] = useState<AuroraCaseFile | null>(null)
  const [activeTab, setActiveTab] = useState<
    "overview" | "timeline" | "malware" | "network" | "evidence" | "actions" | "notes" | "json"
  >("overview")

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSnapshotting, setIsSnapshotting] = useState(false)
  const [isPushingMisp, setIsPushingMisp] = useState(false)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/security/incidents/${params.incidentId}`, { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Failed to load incident." })
        setIncident(null)
        setCaseFile(null)
        return
      }

      setIncident(payload.incident as IncidentRecord)
      setCaseFile(payload.caseFile as AuroraCaseFile)
    } catch (error) {
      console.error("Failed to load incident:", error)
      setNotice({ type: "error", text: "Failed to load incident." })
      setIncident(null)
      setCaseFile(null)
    } finally {
      setIsLoading(false)
    }
  }, [params.incidentId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!incident || !caseFile) return
    setIsSaving(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/security/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: incident.title,
          status: incident.status,
          severity: incident.severity,
          caseFile,
          expectedUpdatedAt: incident.updatedAt,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Save failed." })
        return
      }
      setNotice({ type: "success", text: "Saved." })
      await load()
    } catch (error) {
      console.error("Save failed:", error)
      setNotice({ type: "error", text: "Save failed." })
    } finally {
      setIsSaving(false)
    }
  }

  const snapshot = async () => {
    if (!incident) return
    setIsSnapshotting(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/security/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writeSnapshot: true,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Snapshot failed." })
        return
      }
      setNotice({
        type: "success",
        text: `Snapshot written: ${payload.reportPathMd || "ok"}`,
      })
    } catch (error) {
      console.error("Snapshot failed:", error)
      setNotice({ type: "error", text: "Snapshot failed." })
    } finally {
      setIsSnapshotting(false)
    }
  }

  const pushMisp = async () => {
    if (!incident) return
    setIsPushingMisp(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/security/incidents/${incident.id}/integrations/misp/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "MISP push failed." })
        return
      }
      setNotice({ type: "success", text: `Pushed ${payload.pushedAttributeCount} attribute(s) to MISP.` })
      await load()
    } catch (error) {
      console.error("MISP push failed:", error)
      setNotice({ type: "error", text: "MISP push failed." })
    } finally {
      setIsPushingMisp(false)
    }
  }

  const enrichVt = async (grid: "malware" | "network", recid: number) => {
    if (!incident) return
    setNotice(null)
    try {
      const response = await fetch(
        `/api/security/incidents/${incident.id}/integrations/virustotal/enrich`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grid, recid }),
        },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "VT enrichment failed." })
        return
      }
      setNotice({ type: "success", text: "VirusTotal enrichment complete." })
      await load()
    } catch (error) {
      console.error("VT enrichment failed:", error)
      setNotice({ type: "error", text: "VT enrichment failed." })
    }
  }

  const options = useMemo(() => {
    if (!caseFile) {
      return {
        eventTypes: [],
        direction: [],
        killchain: [],
        taskTypes: [],
        status: [],
        systems: [],
        investigators: [],
        evidenceTypes: [],
      }
    }

    return {
      eventTypes: enumText(caseFile.event_types),
      direction: enumText(caseFile.direction),
      killchain: enumText(caseFile.killchain),
      taskTypes: enumText(caseFile.task_types),
      status: enumText(caseFile.status),
      evidenceTypes: enumText(caseFile.evidence_types),
      systems: gridText(caseFile.systems as any, "text"),
      investigators: gridText(caseFile.investigators as any, "text"),
    }
  }, [caseFile])

  const tabButton = (key: typeof activeTab, label: string) => {
    const active = activeTab === key
    return (
      <button
        type="button"
        onClick={() => setActiveTab(key)}
        className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
          active
            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            : "border border-slate-200 bg-white/60 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]"
        }`}
      >
        {label}
      </button>
    )
  }

  const exportHref = incident ? `/api/security/incidents/${incident.id}/export` : "#"

  return (
    <PageLayout
      title={incident ? incident.title : "Incident"}
      description={incident ? `ID ${incident.id}` : "Loading..."}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/security/incidents"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            All incidents
          </Link>
          <Link
            href="/security/integrations"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            Integrations
          </Link>
          <a
            href={exportHref}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            Export .fox
          </a>
          <button
            type="button"
            onClick={() => void snapshot()}
            disabled={!incident || isSnapshotting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            {isSnapshotting ? "Snapshotting..." : "Snapshot to Vault"}
          </button>
          <button
            type="button"
            onClick={() => void pushMisp()}
            disabled={!incident || isPushingMisp}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            {isPushingMisp ? "Pushing..." : "Push to MISP"}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!incident || !caseFile || isSaving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

        {isLoading || !incident || !caseFile ? (
          <SurfaceCard>
            <p className="text-sm text-slate-600 dark:text-slate-400">Loading incident...</p>
          </SurfaceCard>
        ) : (
          <>
            <SurfaceCard>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-7">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Title
                  </label>
                  <input
                    value={incident.title}
                    onChange={(e) => setIncident({ ...incident, title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Status
                  </label>
                  <select
                    value={incident.status}
                    onChange={(e) => setIncident({ ...incident, status: e.target.value as IncidentStatus })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                  >
                    <option value="open">open</option>
                    <option value="investigating">investigating</option>
                    <option value="contained">contained</option>
                    <option value="eradicated">eradicated</option>
                    <option value="recovered">recovered</option>
                    <option value="closed">closed</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Severity
                  </label>
                  <select
                    value={incident.severity}
                    onChange={(e) => setIncident({ ...incident, severity: e.target.value as IncidentSeverity })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <p>
                  <span className="font-medium">Updated:</span>{" "}
                  {new Date(incident.updatedAt).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium">MISP event:</span>{" "}
                  {incident.mispEventId || caseFile.mispeventid || "n/a"}
                </p>
                <p>
                  <span className="font-medium">Session:</span>{" "}
                  {incident.sessionId ? (
                    <Link href={`/sessions/${incident.sessionId}`} className="underline">
                      open
                    </Link>
                  ) : (
                    "n/a"
                  )}
                </p>
                <p>
                  <span className="font-medium">Vault snapshots:</span>{" "}
                  OWZ-Vault/00-Inbox/Security-Incidents/
                </p>
              </div>
            </SurfaceCard>

            <SurfaceCard>
              <div className="flex flex-wrap gap-2">
                {tabButton("overview", "Overview")}
                {tabButton("timeline", "Timeline")}
                {tabButton("malware", "Malware")}
                {tabButton("network", "Network")}
                {tabButton("evidence", "Evidence")}
                {tabButton("actions", "Actions")}
                {tabButton("notes", "Case Notes")}
                {tabButton("json", "Raw JSON")}
              </div>
            </SurfaceCard>

            {activeTab === "overview" ? (
              <SurfaceCard>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Aurora Case Metadata</h2>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      case_id
                    </label>
                    <input
                      value={String(caseFile.case_id || "")}
                      onChange={(e) => setCaseFile({ ...caseFile, case_id: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      client
                    </label>
                    <input
                      value={String(caseFile.client || "")}
                      onChange={(e) => setCaseFile({ ...caseFile, client: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      start_date
                    </label>
                    <input
                      value={String(caseFile.start_date || "")}
                      onChange={(e) => setCaseFile({ ...caseFile, start_date: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                    />
                  </div>
                  <div />
                  <div className="md:col-span-2">
                    <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      summary
                    </label>
                    <textarea
                      value={String(caseFile.summary || "")}
                      onChange={(e) => setCaseFile({ ...caseFile, summary: e.target.value })}
                      className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                    />
                  </div>
                </div>
              </SurfaceCard>
            ) : null}

            {activeTab === "timeline" ? (
              <RecordGrid
                title="Timeline"
                description="Core timeline fields compatible with Aurora IR."
                columns={[
                  { key: "date_time", label: "date_time", placeholder: "YYYY-MM-DD HH:mm:ss" },
                  { key: "event_type", label: "event_type", options: options.eventTypes, minWidthClass: "min-w-[160px]" },
                  { key: "event_host", label: "event_host", options: options.systems, minWidthClass: "min-w-[160px]" },
                  { key: "direction", label: "direction", options: options.direction, minWidthClass: "min-w-[90px]" },
                  { key: "event_source_host", label: "event_source_host", options: options.systems, minWidthClass: "min-w-[180px]" },
                  { key: "killchain", label: "killchain", options: options.killchain, minWidthClass: "min-w-[150px]" },
                  { key: "event_data", label: "event_data", kind: "textarea", minWidthClass: "min-w-[420px]" },
                  { key: "notes", label: "notes", kind: "textarea", minWidthClass: "min-w-[320px]" },
                  { key: "visual", label: "visual", kind: "checkbox" },
                  { key: "followup", label: "followup", kind: "checkbox" },
                  { key: "attribution", label: "attribution", placeholder: "actor / TTP family" },
                  { key: "owner", label: "owner", options: options.investigators, minWidthClass: "min-w-[140px]" },
                ]}
                records={caseFile.timeline as any}
                onChange={(next) => setCaseFile({ ...caseFile, timeline: next as any })}
                createRecord={() => ({
                  recid: nextRecid(caseFile.timeline),
                  date_time: new Date().toISOString(),
                  event_type: "",
                  event_host: "",
                  direction: "",
                  event_source_host: "",
                  killchain: "",
                  event_data: "",
                  notes: "",
                  visual: false,
                  followup: false,
                  attribution: "",
                  owner: "",
                })}
              />
            ) : null}

            {activeTab === "malware" ? (
              <RecordGrid
                title="Malware / Tools"
                description="Use VT enrichment to populate the vt field and attach evidence blobs."
                columns={[
                  { key: "date_added", label: "date_added", placeholder: "YYYY-MM-DD" },
                  { key: "text", label: "filename", placeholder: "sample.exe", minWidthClass: "min-w-[200px]" },
                  { key: "path_on_disk", label: "path_on_disk", placeholder: "C:\\\\..." , minWidthClass: "min-w-[260px]" },
                  { key: "creation_date", label: "creation_date", placeholder: "ISO datetime" },
                  { key: "modification_date", label: "modification_date", placeholder: "ISO datetime" },
                  { key: "hostname", label: "hostname", options: options.systems, minWidthClass: "min-w-[160px]" },
                  { key: "md5", label: "hash", placeholder: "md5/sha1/sha256", minWidthClass: "min-w-[220px]" },
                  { key: "vt", label: "vt", placeholder: "infected|clean|noresult|unknown" },
                  { key: "attribution", label: "attribution" },
                  { key: "notes", label: "notes", kind: "textarea", minWidthClass: "min-w-[320px]" },
                ]}
                records={caseFile.malware as any}
                onChange={(next) => setCaseFile({ ...caseFile, malware: next as any })}
                createRecord={() => ({
                  recid: nextRecid(caseFile.malware),
                  date_added: new Date().toISOString().slice(0, 10),
                  text: "",
                  path_on_disk: "",
                  creation_date: "",
                  modification_date: "",
                  hostname: "",
                  md5: "",
                  vt: "",
                  attribution: "",
                  notes: "",
                })}
                rowActions={(record) => (
                  <button
                    type="button"
                    onClick={() => void enrichVt("malware", Number(record.recid))}
                    className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
                  >
                    Check VT
                  </button>
                )}
              />
            ) : null}

            {activeTab === "network" ? (
              <RecordGrid
                title="Network Indicators"
                description="Push indicators to MISP and enrich IP/domain via VirusTotal."
                columns={[
                  { key: "date_added", label: "date_added", placeholder: "YYYY-MM-DD" },
                  { key: "ip", label: "ip", placeholder: "1.2.3.4", minWidthClass: "min-w-[150px]" },
                  { key: "domainname", label: "domainname/url", placeholder: "example.com or https://...", minWidthClass: "min-w-[220px]" },
                  { key: "port", label: "port", placeholder: "443", minWidthClass: "min-w-[90px]" },
                  { key: "context", label: "context", kind: "textarea", minWidthClass: "min-w-[320px]" },
                  { key: "last_activity", label: "last_activity", placeholder: "ISO datetime" },
                  { key: "malware", label: "malware", placeholder: "related sample" },
                  { key: "whois", label: "whois", kind: "textarea", minWidthClass: "min-w-[320px]" },
                  { key: "attribution", label: "attribution" },
                  { key: "vt", label: "vt", placeholder: "infected|clean|noresult|unknown" },
                ]}
                records={caseFile.network_indicators as any}
                onChange={(next) => setCaseFile({ ...caseFile, network_indicators: next as any })}
                createRecord={() => ({
                  recid: nextRecid(caseFile.network_indicators),
                  date_added: new Date().toISOString().slice(0, 10),
                  ip: "",
                  domainname: "",
                  port: "",
                  context: "",
                  last_activity: "",
                  malware: "",
                  whois: "",
                  attribution: "",
                  vt: "",
                })}
                rowActions={(record) => (
                  <button
                    type="button"
                    onClick={() => void enrichVt("network", Number(record.recid))}
                    className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
                  >
                    Enrich VT
                  </button>
                )}
              />
            ) : null}

            {activeTab === "evidence" ? (
              <RecordGrid
                title="Evidence"
                description="Integrations automatically append evidence entries that reference raw JSON blobs in OWZ-Vault."
                columns={[
                  { key: "date_acquired", label: "date_acquired", placeholder: "ISO datetime", minWidthClass: "min-w-[200px]" },
                  { key: "type", label: "type", options: options.evidenceTypes, minWidthClass: "min-w-[170px]" },
                  { key: "name", label: "name", minWidthClass: "min-w-[200px]" },
                  { key: "description", label: "description", kind: "textarea", minWidthClass: "min-w-[420px]" },
                  { key: "size", label: "size", placeholder: "bytes" },
                  { key: "hash", label: "hash", placeholder: "sha256..." , minWidthClass: "min-w-[240px]" },
                  { key: "provider", label: "provider", options: options.investigators, minWidthClass: "min-w-[180px]" },
                  { key: "location", label: "location", placeholder: "path/url", minWidthClass: "min-w-[260px]" },
                ]}
                records={caseFile.evidence as any}
                onChange={(next) => setCaseFile({ ...caseFile, evidence: next as any })}
                createRecord={() => ({
                  recid: nextRecid(caseFile.evidence),
                  date_acquired: new Date().toISOString(),
                  type: "Other",
                  name: "",
                  description: "",
                  size: "",
                  hash: "",
                  provider: "",
                  location: "",
                })}
              />
            ) : null}

            {activeTab === "actions" ? (
              <RecordGrid
                title="Actions"
                description="Track tasks and closure criteria."
                columns={[
                  { key: "date_added", label: "date_added", placeholder: "YYYY-MM-DD" },
                  { key: "date_due", label: "date_due", placeholder: "YYYY-MM-DD" },
                  { key: "task_type", label: "task_type", options: options.taskTypes, minWidthClass: "min-w-[170px]" },
                  { key: "task", label: "task", kind: "textarea", minWidthClass: "min-w-[420px]" },
                  { key: "status", label: "status", options: options.status, minWidthClass: "min-w-[170px]" },
                  { key: "owner", label: "owner", options: options.investigators, minWidthClass: "min-w-[170px]" },
                ]}
                records={caseFile.actions as any}
                onChange={(next) => setCaseFile({ ...caseFile, actions: next as any })}
                createRecord={() => ({
                  recid: nextRecid(caseFile.actions),
                  date_added: new Date().toISOString().slice(0, 10),
                  date_due: "",
                  task_type: "",
                  task: "",
                  status: "",
                  owner: "",
                })}
              />
            ) : null}

            {activeTab === "notes" ? (
              <RecordGrid
                title="Case Notes"
                description="Decision trace, comms log, and context you want preserved."
                columns={[
                  { key: "date_added", label: "date_added", placeholder: "YYYY-MM-DD" },
                  { key: "note", label: "note", kind: "textarea", minWidthClass: "min-w-[520px]" },
                  { key: "owner", label: "owner", options: options.investigators, minWidthClass: "min-w-[170px]" },
                ]}
                records={caseFile.casenotes as any}
                onChange={(next) => setCaseFile({ ...caseFile, casenotes: next as any })}
                createRecord={() => ({
                  recid: nextRecid(caseFile.casenotes),
                  date_added: new Date().toISOString().slice(0, 10),
                  note: "",
                  owner: "",
                })}
              />
            ) : null}

            {activeTab === "json" ? (
              <SurfaceCard>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Raw Aurora Case JSON</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  This is the canonical `.fox` document stored in Postgres and exported for Aurora.
                </p>
                <pre className="mt-4 max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white/70 p-3 text-xs text-slate-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
                  {JSON.stringify(caseFile, null, 2)}
                </pre>
              </SurfaceCard>
            ) : null}
          </>
        )}
      </div>
    </PageLayout>
  )
}
