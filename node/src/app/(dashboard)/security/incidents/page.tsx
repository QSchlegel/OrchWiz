"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"

type IncidentSeverity = "low" | "medium" | "high" | "critical"
type IncidentStatus = "open" | "investigating" | "contained" | "eradicated" | "recovered" | "closed"

interface IncidentSummary {
  id: string
  title: string
  status: IncidentStatus
  severity: IncidentSeverity
  updatedAt: string
  createdAt: string
  mispEventId: string | null
  sessionId: string | null
}

export default function SecurityIncidentsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [incidents, setIncidents] = useState<IncidentSummary[]>([])
  const [includeClosed, setIncludeClosed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const [newTitle, setNewTitle] = useState("")
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("medium")
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const openCount = useMemo(
    () => incidents.filter((i) => i.status !== "closed").length,
    [incidents],
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/security/incidents?includeClosed=${includeClosed ? "true" : "false"}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setIncidents([])
        setNotice({ type: "error", text: payload?.error || "Failed to load incidents." })
        return
      }

      const payload = (await response.json().catch(() => ({}))) as { incidents?: IncidentSummary[] }
      setIncidents(Array.isArray(payload.incidents) ? payload.incidents : [])
    } catch (error) {
      console.error("Failed to load incidents:", error)
      setNotice({ type: "error", text: "Failed to load incidents." })
      setIncidents([])
    } finally {
      setIsLoading(false)
    }
  }, [includeClosed])

  useEffect(() => {
    void load()
  }, [load])

  const createIncident = async () => {
    const title = newTitle.trim()
    if (!title) {
      setNotice({ type: "error", text: "Title is required." })
      return
    }

    setIsCreating(true)
    setNotice(null)
    try {
      const response = await fetch("/api/security/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, severity: newSeverity }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Failed to create incident." })
        return
      }

      setNewTitle("")
      router.push(`/security/incidents/${payload.id}`)
    } catch (error) {
      console.error("Error creating incident:", error)
      setNotice({ type: "error", text: "Failed to create incident." })
    } finally {
      setIsCreating(false)
    }
  }

  const importFox = async (file: File) => {
    setIsImporting(true)
    setNotice(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown

      const response = await fetch("/api/security/incidents/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFile: parsed }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Import failed." })
        return
      }

      setNotice({ type: "success", text: "Incident imported." })
      router.push(`/security/incidents/${payload.id}`)
    } catch (error) {
      console.error("Error importing .fox file:", error)
      setNotice({ type: "error", text: "Import failed. Ensure the file is valid JSON." })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <PageLayout
      title="Incident Response"
      description="Aurora-compatible incident cases with Vault snapshots, VirusTotal enrichment, and MISP push."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/security/integrations"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            Integrations
          </Link>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            {isImporting ? "Importing..." : "Import .fox"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".fox,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFox(file)
            }}
          />
        </div>
      }
    >
      <div className="space-y-4">
        {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

        <SurfaceCard>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cases</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {isLoading ? "Loading..." : `${openCount} open / ${incidents.length} shown`}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={includeClosed}
                  onChange={(e) => setIncludeClosed(e.target.checked)}
                />
                Include closed
              </label>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-12">
            <div className="md:col-span-7">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                New incident title
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Acme ransomware containment"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Severity
              </label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="critical">critical</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => void createIncident()}
                disabled={isCreating}
                className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </SurfaceCard>

        {!isLoading && incidents.length === 0 ? (
          <EmptyState
            title="No incidents yet"
            description="Create a new incident case or import an Aurora .fox file."
          />
        ) : null}

        {incidents.length > 0 ? (
          <SurfaceCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/70 dark:divide-white/10">
                <thead className="bg-white/60 dark:bg-white/[0.03]">
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3">MISP</th>
                    <th className="px-4 py-3">Session</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 bg-white/40 text-sm dark:divide-white/10 dark:bg-white/[0.02]">
                  {incidents.map((incident) => (
                    <tr
                      key={incident.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/security/incidents/${incident.id}`}
                          className="font-medium text-slate-900 hover:underline dark:text-slate-100"
                        >
                          {incident.title}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{incident.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
                          {incident.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">{incident.status}</td>
                      <td className="px-4 py-3">{new Date(incident.updatedAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        {incident.mispEventId ? (
                          <span className="text-xs text-emerald-700 dark:text-emerald-300">
                            linked
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">none</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {incident.sessionId ? (
                          <Link
                            href={`/sessions/${incident.sessionId}`}
                            className="text-xs text-slate-700 hover:underline dark:text-slate-200"
                          >
                            open
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">n/a</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SurfaceCard>
        ) : null}
      </div>
    </PageLayout>
  )
}

