"use client"

import { useEffect, useMemo, useState } from "react"
import { EmptyState, FilterBar, InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"
import { SkillTreeGraph } from "@/components/skills/SkillTreeGraph"
import type { SkillCatalogEntryDto, SkillCatalogRefreshMode, SkillCatalogResponse, SkillImportRunDto } from "@/lib/skills/types"

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // ignore parse failure
  }

  return `Request failed with status ${response.status}`
}

function statusBadgeClass(status: SkillImportRunDto["status"]): string {
  if (status === "succeeded") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }

  if (status === "failed") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
  }

  return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
}

export function SkillsCatalogTab() {
  const [catalog, setCatalog] = useState<SkillCatalogResponse | null>(null)
  const [runs, setRuns] = useState<SkillImportRunDto[]>([])
  const [query, setQuery] = useState("")
  const [curatedSkillSlug, setCuratedSkillSlug] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [githubTokenOverride, setGithubTokenOverride] = useState("")
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [isRunsLoading, setIsRunsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isImportingCurated, setIsImportingCurated] = useState(false)
  const [isImportingGithubUrl, setIsImportingGithubUrl] = useState(false)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const loadCatalog = async (refreshMode: SkillCatalogRefreshMode, keepSelection = true) => {
    if (refreshMode === "force") {
      setIsRefreshing(true)
    } else {
      setIsCatalogLoading(true)
    }

    try {
      const response = await fetch(`/api/skills/catalog?refresh=${encodeURIComponent(refreshMode)}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = (await response.json()) as SkillCatalogResponse
      setCatalog(payload)

      if (!keepSelection) {
        setSelectedSkillId(payload.entries[0]?.id || null)
        return
      }

      setSelectedSkillId((current) => {
        if (!current) {
          return payload.entries[0]?.id || null
        }

        if (payload.entries.some((entry) => entry.id === current)) {
          return current
        }

        return payload.entries[0]?.id || null
      })
    } catch (error) {
      console.error("Failed to load skills catalog:", error)
      setNotice({ type: "error", text: "Unable to load skill catalog." })
    } finally {
      setIsCatalogLoading(false)
      setIsRefreshing(false)
    }
  }

  const loadRuns = async () => {
    setIsRunsLoading(true)
    try {
      const response = await fetch("/api/skills/import-runs?limit=20", { cache: "no-store" })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = (await response.json()) as { runs?: SkillImportRunDto[] }
      setRuns(Array.isArray(payload.runs) ? payload.runs : [])
    } catch (error) {
      console.error("Failed to load skill import runs:", error)
      setNotice({ type: "error", text: "Unable to load skill import history." })
    } finally {
      setIsRunsLoading(false)
    }
  }

  useEffect(() => {
    void loadCatalog("auto")
    void loadRuns()
  }, [])

  const curatedCandidates = useMemo(
    () =>
      (catalog?.entries || [])
        .filter((entry) => entry.source === "curated" && !entry.isInstalled)
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    [catalog?.entries],
  )

  useEffect(() => {
    if (curatedSkillSlug) {
      return
    }

    if (curatedCandidates.length > 0) {
      setCuratedSkillSlug(curatedCandidates[0].slug)
    }
  }, [curatedCandidates, curatedSkillSlug])

  const selectedEntry = useMemo(
    () => (catalog?.entries || []).find((entry) => entry.id === selectedSkillId) || null,
    [catalog?.entries, selectedSkillId],
  )

  const importPayload = useMemo(
    () => ({
      ...(githubTokenOverride.trim()
        ? {
            githubTokenOverride: githubTokenOverride.trim(),
          }
        : {}),
    }),
    [githubTokenOverride],
  )

  const importCurated = async (skillSlugOverride?: string) => {
    const slug = (skillSlugOverride || curatedSkillSlug).trim()
    if (!slug) {
      setNotice({ type: "error", text: "Choose a curated skill to import." })
      return
    }

    setIsImportingCurated(true)
    setNotice(null)

    try {
      const response = await fetch("/api/skills/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "curated",
          skillSlug: slug,
          ...importPayload,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: typeof payload.error === "string" ? payload.error : `Import failed (${response.status}).` })
        await loadRuns()
        return
      }

      setNotice({ type: "success", text: `Imported curated skill: ${slug}` })
      await Promise.all([loadCatalog("force"), loadRuns()])
    } catch (error) {
      console.error("Failed importing curated skill:", error)
      setNotice({ type: "error", text: "Unable to import curated skill." })
    } finally {
      setIsImportingCurated(false)
    }
  }

  const importFromGithubUrl = async () => {
    const url = githubUrl.trim()
    if (!url) {
      setNotice({ type: "error", text: "Provide a GitHub tree/blob URL." })
      return
    }

    setIsImportingGithubUrl(true)
    setNotice(null)

    try {
      const response = await fetch("/api/skills/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "github_url",
          githubUrl: url,
          ...importPayload,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({ type: "error", text: typeof payload.error === "string" ? payload.error : `Import failed (${response.status}).` })
        await loadRuns()
        return
      }

      setNotice({ type: "success", text: "Imported custom GitHub skill." })
      await Promise.all([loadCatalog("force"), loadRuns()])
    } catch (error) {
      console.error("Failed importing GitHub skill:", error)
      setNotice({ type: "error", text: "Unable to import skill from GitHub URL." })
    } finally {
      setIsImportingGithubUrl(false)
    }
  }

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return catalog?.entries || []
    }

    return (catalog?.entries || []).filter((entry) => {
      return `${entry.name} ${entry.slug} ${entry.description || ""}`.toLowerCase().includes(normalized)
    })
  }, [catalog?.entries, query])

  return (
    <div className="space-y-4">
      {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

      {catalog?.refresh.warnings?.length ? (
        <InlineNotice variant="info">{catalog.refresh.warnings.join(" · ")}</InlineNotice>
      ) : null}

      {catalog?.refresh.experimentalStatus.state === "unavailable" ? (
        <InlineNotice variant="info">
          Experimental source unavailable: {catalog.refresh.experimentalStatus.error || "unknown error"}
        </InlineNotice>
      ) : null}

      <FilterBar>
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search catalog skills..."
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => void loadCatalog("force")}
          disabled={isRefreshing}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Catalog"}
        </button>
      </FilterBar>

      <SurfaceCard>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Import Skills</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Curated skill</label>
            <select
              value={curatedSkillSlug}
              onChange={(event) => setCuratedSkillSlug(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
            >
              {curatedCandidates.length === 0 ? (
                <option value="">No curated skills pending install</option>
              ) : (
                curatedCandidates.map((entry) => (
                  <option key={entry.id} value={entry.slug}>
                    {entry.slug}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => void importCurated()}
              disabled={isImportingCurated || curatedCandidates.length === 0}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {isImportingCurated ? "Importing..." : "Import Curated"}
            </button>
          </div>

          <div className="space-y-2 lg:col-span-6">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">GitHub tree/blob URL</label>
            <input
              type="text"
              value={githubUrl}
              onChange={(event) => setGithubUrl(event.target.value)}
              placeholder="https://github.com/<owner>/<repo>/tree/<ref>/<path>"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
            />
            <button
              type="button"
              onClick={() => void importFromGithubUrl()}
              disabled={isImportingGithubUrl || !githubUrl.trim()}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {isImportingGithubUrl ? "Importing..." : "Import from GitHub URL"}
            </button>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">GitHub token override</label>
            <input
              type="password"
              value={githubTokenOverride}
              onChange={(event) => setGithubTokenOverride(event.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Used per request only; never persisted.</p>
          </div>
        </div>
      </SurfaceCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SurfaceCard className="lg:col-span-8">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Skill Tree</h2>
          {isCatalogLoading ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading catalog...</p>
          ) : !catalog ? (
            <div className="mt-3">
              <EmptyState title="Catalog unavailable" description="Unable to render skill tree." />
            </div>
          ) : (
            <div className="mt-3">
              <SkillTreeGraph
                graph={catalog.graph}
                selectedSkillId={selectedSkillId}
                query={query}
                onSelectSkill={setSelectedSkillId}
              />
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="space-y-3 lg:col-span-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Skill Detail</h2>
          {!selectedEntry ? (
            <EmptyState title="No skill selected" description="Select a skill node from the graph to inspect metadata." />
          ) : (
            <>
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedEntry.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedEntry.slug}</p>
              </div>
              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p>Source: {selectedEntry.source}</p>
                <p>Installed: {selectedEntry.isInstalled ? "yes" : "no"}</p>
                <p>System: {selectedEntry.isSystem ? "yes" : "no"}</p>
                {selectedEntry.repo ? <p>Repo: {selectedEntry.repo}</p> : null}
                {selectedEntry.sourcePath ? <p>Path: {selectedEntry.sourcePath}</p> : null}
                {selectedEntry.sourceRef ? <p>Ref: {selectedEntry.sourceRef}</p> : null}
                {selectedEntry.installedPath ? <p className="break-all">Installed path: {selectedEntry.installedPath}</p> : null}
              </div>
              {selectedEntry.description ? (
                <p className="rounded-lg border border-slate-200 bg-white/70 p-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                  {selectedEntry.description}
                </p>
              ) : null}
              {selectedEntry.source === "curated" && !selectedEntry.isInstalled ? (
                <button
                  type="button"
                  onClick={() => {
                    setCuratedSkillSlug(selectedEntry.slug)
                    void importCurated(selectedEntry.slug)
                  }}
                  disabled={isImportingCurated}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {isImportingCurated ? "Importing..." : "Import This Curated Skill"}
                </button>
              ) : null}
            </>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Import History</h2>
        {isRunsLoading ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading import history...</p>
        ) : runs.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No imports yet" description="Import a skill to build your history." />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {runs.map((run) => {
              const matchingEntry = (catalog?.entries || []).find((entry) => entry.id === run.catalogEntryId)
              return (
                <div
                  key={run.id}
                  className="rounded-lg border border-slate-200/80 bg-white/80 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(run.status)}`}>
                      {run.status}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{run.mode}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {matchingEntry?.slug || run.skillSlug || run.sourceUrl || "Unknown skill"}
                  </p>
                  {run.errorMessage ? (
                    <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{run.errorMessage}</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </SurfaceCard>

      {catalog && filteredEntries.length === 0 && query.trim() ? (
        <EmptyState title="No matching catalog skills" description="Adjust your search to find a skill node." />
      ) : null}
    </div>
  )
}
