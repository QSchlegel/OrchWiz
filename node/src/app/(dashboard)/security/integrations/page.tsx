"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"

type StorageMode = "none" | "encrypted" | "plaintext-fallback" | "unknown"

interface IntegrationSummary {
  storageMode: StorageMode
  mispBaseUrl: string | null
  hasMispKey: boolean
  hasVtKey: boolean
}

export default function SecurityIntegrationsPage() {
  const [summary, setSummary] = useState<IntegrationSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const [mispBaseUrl, setMispBaseUrl] = useState("")
  const [mispApiKey, setMispApiKey] = useState("")
  const [vtApiKey, setVtApiKey] = useState("")
  const [clearMispKey, setClearMispKey] = useState(false)
  const [clearVtKey, setClearVtKey] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    setNotice(null)
    try {
      const response = await fetch("/api/security/integrations", { cache: "no-store" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSummary(null)
        setNotice({ type: "error", text: payload?.error || "Failed to load integrations." })
        return
      }

      setSummary(payload as IntegrationSummary)
      setMispBaseUrl(typeof payload?.mispBaseUrl === "string" ? payload.mispBaseUrl : "")
    } catch (error) {
      console.error("Failed to load integrations:", error)
      setNotice({ type: "error", text: "Failed to load integrations." })
      setSummary(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setIsSaving(true)
    setNotice(null)
    try {
      const response = await fetch("/api/security/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mispBaseUrl,
          mispApiKey: clearMispKey ? null : mispApiKey,
          virustotalApiKey: clearVtKey ? null : vtApiKey,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: payload?.error || "Failed to save integrations." })
        return
      }

      setNotice({ type: "success", text: "Integrations saved." })
      setMispApiKey("")
      setVtApiKey("")
      setClearMispKey(false)
      setClearVtKey(false)
      await load()
    } catch (error) {
      console.error("Failed to save integrations:", error)
      setNotice({ type: "error", text: "Failed to save integrations." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <PageLayout
      title="Security Integrations"
      description="Configure per-user VirusTotal and MISP credentials (stored via wallet enclave when required)."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/security/incidents"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/[0.06]"
          >
            Incidents
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Current State</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <p>
              <span className="font-medium">Storage mode:</span>{" "}
              {isLoading ? "loading..." : summary?.storageMode || "none"}
            </p>
            <p>
              <span className="font-medium">MISP base URL:</span>{" "}
              {isLoading ? "loading..." : summary?.mispBaseUrl || "not set"}
            </p>
            <p>
              <span className="font-medium">MISP API key:</span>{" "}
              {isLoading ? "loading..." : summary?.hasMispKey ? "configured" : "missing"}
            </p>
            <p>
              <span className="font-medium">VirusTotal API key:</span>{" "}
              {isLoading ? "loading..." : summary?.hasVtKey ? "configured" : "missing"}
            </p>
          </div>
        </SurfaceCard>

        <SurfaceCard>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Update Settings</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Leave API key fields blank if you do not want to change them. Use the checkboxes to clear stored keys.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                MISP Base URL
              </label>
              <input
                value={mispBaseUrl}
                onChange={(e) => setMispBaseUrl(e.target.value)}
                placeholder="https://misp.example.com"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                MISP API Key
              </label>
              <input
                value={mispApiKey}
                onChange={(e) => setMispApiKey(e.target.value)}
                placeholder="(enter to set / blank to keep)"
                type="password"
                disabled={clearMispKey}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={clearMispKey}
                  onChange={(e) => setClearMispKey(e.target.checked)}
                />
                Clear stored MISP key
              </label>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                VirusTotal API Key
              </label>
              <input
                value={vtApiKey}
                onChange={(e) => setVtApiKey(e.target.value)}
                placeholder="(enter to set / blank to keep)"
                type="password"
                disabled={clearVtKey}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={clearVtKey}
                  onChange={(e) => setClearVtKey(e.target.checked)}
                />
                Clear stored VirusTotal key
              </label>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </SurfaceCard>
      </div>
    </PageLayout>
  )
}
