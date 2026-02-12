"use client"

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import { EmptyState, FilterBar, InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"
import { SkillTreeGraph } from "@/components/skills/SkillTreeGraph"
import {
  isMapDirectImportable,
  rankMapInstallCandidates,
  resolveMapActionState,
  type SkillCatalogMapActionState,
} from "@/lib/skills/catalog-map-actions"
import {
  buildSkillCatalogView,
  classifyCatalogGroup,
  type SkillCatalogSortKey,
  type SkillCatalogStatusFilter,
} from "@/lib/skills/catalog-view"
import type {
  SkillCatalogEntryDto,
  SkillCatalogRefreshMode,
  SkillCatalogResponse,
  SkillCatalogSourceValue,
  SkillGraphGroupId,
  SkillImportRunDto,
} from "@/lib/skills/types"

const SOURCE_FILTER_OPTIONS: Array<{ value: SkillCatalogSourceValue; label: string }> = [
  { value: "curated", label: "Curated" },
  { value: "experimental", label: "Experimental" },
  { value: "custom_github", label: "Custom GitHub" },
  { value: "local", label: "Local" },
  { value: "system", label: "System" },
]

const STATUS_FILTER_OPTIONS: Array<{ value: SkillCatalogStatusFilter; label: string }> = [
  { value: "installed", label: "Installed" },
  { value: "not_installed", label: "Not Installed" },
  { value: "system", label: "System" },
]

const SORT_OPTIONS: Array<{ value: SkillCatalogSortKey; label: string }> = [
  { value: "name_asc", label: "Name A-Z" },
  { value: "source", label: "Source" },
  { value: "updated_desc", label: "Recently Updated" },
  { value: "installed_first", label: "Installed First" },
]

const MAP_CANDIDATE_LIMIT = 5

function groupLabel(groupId: SkillGraphGroupId): string {
  if (groupId === "installed") {
    return "Installed"
  }

  if (groupId === "curated") {
    return "Curated Available"
  }

  if (groupId === "experimental") {
    return "Experimental Available"
  }

  if (groupId === "custom") {
    return "Custom Imported"
  }

  return "System Skills"
}

function toggleFilterValue<T extends string>(values: T[], value: T): T[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value)
  }

  return [...values, value]
}

function filterChipClass(active: boolean): string {
  if (active) {
    return "border-cyan-500/45 bg-cyan-500/12 text-cyan-700 dark:text-cyan-200"
  }

  return "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-300 dark:hover:bg-white/[0.08]"
}

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

function describeMapAction(args: {
  state: SkillCatalogMapActionState
  selectedEntry: SkillCatalogEntryDto | null
}): { title: string; description: string; hint: string } {
  if (args.state === "none_selected") {
    return {
      title: "Select a skill",
      description: "Pick a node in the map to inspect import actions.",
      hint: "Direct map import is available for curated skills that are not installed.",
    }
  }

  if (!args.selectedEntry) {
    return {
      title: "Select a skill",
      description: "Pick a node in the map to inspect import actions.",
      hint: "Direct map import is available for curated skills that are not installed.",
    }
  }

  if (args.state === "import_curated") {
    return {
      title: "Ready to import",
      description: `${args.selectedEntry.slug} is curated and not installed yet.`,
      hint: "Confirm import below to install this skill now.",
    }
  }

  if (args.state === "already_installed") {
    return {
      title: "Already installed",
      description: `${args.selectedEntry.slug} is already installed in your scoped Codex home.`,
      hint: "Use Skill Detail to copy the installed path or select another curated candidate.",
    }
  }

  if (args.selectedEntry.isSystem || args.selectedEntry.source === "system") {
    return {
      title: "System skill",
      description: "System skills are read-only baseline capabilities.",
      hint: "Select a curated skill to import directly, or use GitHub URL import for custom skills.",
    }
  }

  if (args.selectedEntry.source === "custom_github" || args.selectedEntry.source === "local") {
    return {
      title: "Custom or local skill",
      description: "Custom/local entries are not direct curated imports.",
      hint: "Use Import Skills with a GitHub URL, or select a curated candidate from the map list.",
    }
  }

  if (args.selectedEntry.source === "experimental") {
    return {
      title: "Experimental skill",
      description: "Experimental entries are catalog references and cannot be imported directly from the map.",
      hint: "Select a curated candidate for direct import, or use the import form for URL-based installs.",
    }
  }

  return {
    title: "Direct import unavailable",
    description: "This selection is not importable from map actions.",
    hint: "Select a curated, not-installed skill to use direct import.",
  }
}

export function SkillsCatalogTab() {
  const [catalog, setCatalog] = useState<SkillCatalogResponse | null>(null)
  const [runs, setRuns] = useState<SkillImportRunDto[]>([])

  const [query, setQuery] = useState("")
  const [sourceFilters, setSourceFilters] = useState<SkillCatalogSourceValue[]>([])
  const [statusFilters, setStatusFilters] = useState<SkillCatalogStatusFilter[]>([])
  const [sort, setSort] = useState<SkillCatalogSortKey>("name_asc")
  const [groupFilter, setGroupFilter] = useState<SkillGraphGroupId | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)

  const [curatedSkillSlug, setCuratedSkillSlug] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [githubTokenOverride, setGithubTokenOverride] = useState("")
  const [actingBridgeCrewId, setActingBridgeCrewId] = useState("")
  const [activationRationale, setActivationRationale] = useState("")

  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [isRunsLoading, setIsRunsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isImportingCurated, setIsImportingCurated] = useState(false)
  const [isImportingGithubUrl, setIsImportingGithubUrl] = useState(false)
  const [activatingEntryIds, setActivatingEntryIds] = useState<Set<string>>(new Set())
  const [isImportExpanded, setIsImportExpanded] = useState(false)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const [isMobileMapExpanded, setIsMobileMapExpanded] = useState(false)

  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const loadCatalog = async (refreshMode: SkillCatalogRefreshMode) => {
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

  const entries = catalog?.entries || []

  const curatedCandidates = useMemo(
    () =>
      entries
        .filter((entry) => entry.source === "curated" && !entry.isInstalled && entry.activationStatus === "approved")
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    [entries],
  )

  useEffect(() => {
    if (curatedSkillSlug) {
      return
    }

    if (curatedCandidates.length > 0) {
      setCuratedSkillSlug(curatedCandidates[0].slug)
    }
  }, [curatedCandidates, curatedSkillSlug])

  const mapView = useMemo(
    () =>
      buildSkillCatalogView({
        entries,
        filters: {
          query,
          sourceFilters,
          statusFilters,
          groupFilter: null,
          sort,
        },
        selectedSkillId,
      }),
    [entries, query, selectedSkillId, sort, sourceFilters, statusFilters],
  )

  const listView = useMemo(
    () =>
      buildSkillCatalogView({
        entries,
        filters: {
          query,
          sourceFilters,
          statusFilters,
          groupFilter,
          sort,
        },
        selectedSkillId,
      }),
    [entries, groupFilter, query, selectedSkillId, sort, sourceFilters, statusFilters],
  )

  useEffect(() => {
    if (selectedSkillId !== listView.selectedSkillId) {
      setSelectedSkillId(listView.selectedSkillId)
    }
  }, [listView.selectedSkillId, selectedSkillId])

  const selectedEntry = listView.selectedEntry
  const selectedMapEntry = mapView.selectedEntry

  const mapCandidates = useMemo(
    () =>
      rankMapInstallCandidates(mapView.filteredEntries)
        .filter((entry) => isMapDirectImportable(entry))
        .slice(0, MAP_CANDIDATE_LIMIT),
    [mapView.filteredEntries],
  )

  const mapImportableSkillIds = useMemo(
    () => mapView.filteredEntries.filter((entry) => isMapDirectImportable(entry)).map((entry) => entry.id),
    [mapView.filteredEntries],
  )

  const mapActionState = useMemo(
    () => resolveMapActionState(selectedMapEntry),
    [selectedMapEntry],
  )

  const mapActionCopy = useMemo(
    () => describeMapAction({ state: mapActionState, selectedEntry: selectedMapEntry }),
    [mapActionState, selectedMapEntry],
  )

  const mapCandidateSummary = isCatalogLoading
    ? "Loading install candidates..."
    : mapCandidates.length === 0
      ? "No direct curated installs in this view."
      : `${mapCandidates.length} install candidate${mapCandidates.length === 1 ? "" : "s"} in this view.`

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

  const copyInstalledPath = async (path: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setNotice({ type: "error", text: "Clipboard is unavailable in this browser context." })
      return
    }

    try {
      await navigator.clipboard.writeText(path)
      setNotice({ type: "success", text: "Installed path copied to clipboard." })
    } catch (error) {
      console.error("Failed to copy installed path:", error)
      setNotice({ type: "error", text: "Unable to copy installed path." })
    }
  }

  const decideActivation = async (entryId: string, decision: "approve" | "deny") => {
    const rationale = activationRationale.trim()
    if (!rationale) {
      setNotice({ type: "error", text: "Activation rationale is required." })
      return
    }

    setActivatingEntryIds((current) => new Set(current).add(entryId))
    setNotice(null)

    try {
      const response = await fetch(`/api/skills/catalog/${entryId}/activation`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          rationale,
          actingBridgeCrewId: actingBridgeCrewId.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({
          type: "error",
          text: typeof payload.error === "string" ? payload.error : `Activation update failed (${response.status}).`,
        })
        return
      }

      setNotice({
        type: "success",
        text: decision === "approve" ? "Skill activation approved." : "Skill activation denied.",
      })
      await loadCatalog("force")
    } catch (error) {
      console.error("Failed updating skill activation:", error)
      setNotice({ type: "error", text: "Unable to update skill activation." })
    } finally {
      setActivatingEntryIds((current) => {
        const next = new Set(current)
        next.delete(entryId)
        return next
      })
    }
  }

  const hasActiveFilters =
    query.trim().length > 0
    || sourceFilters.length > 0
    || statusFilters.length > 0
    || Boolean(groupFilter)
    || sort !== "name_asc"

  const clearFilters = () => {
    setQuery("")
    setSourceFilters([])
    setStatusFilters([])
    setGroupFilter(null)
    setSort("name_asc")
  }

  const flattenedVisibleIds = useMemo(
    () => listView.filteredEntries.map((entry) => entry.id),
    [listView.filteredEntries],
  )

  const handleRowKeyDown = (entryId: string, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return
    }

    event.preventDefault()
    const index = flattenedVisibleIds.indexOf(entryId)
    if (index < 0) {
      return
    }

    const offset = event.key === "ArrowDown" ? 1 : -1
    const nextIndex = Math.max(0, Math.min(flattenedVisibleIds.length - 1, index + offset))
    const nextId = flattenedVisibleIds[nextIndex]
    if (!nextId) {
      return
    }

    setSelectedSkillId(nextId)
    rowRefs.current[nextId]?.focus()
  }

  const handleMapGroupToggle = (nextGroupId: SkillGraphGroupId) => {
    setGroupFilter((current) => (current === nextGroupId ? null : nextGroupId))
  }

  const handleMapSkillSelect = (skillId: string) => {
    const clickedEntry = mapView.filteredEntries.find((entry) => entry.id === skillId)
    if (clickedEntry && groupFilter && classifyCatalogGroup(clickedEntry) !== groupFilter) {
      setGroupFilter(null)
    }

    setSelectedSkillId(skillId)
  }

  const matchingEntryByRun = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  )

  const handleMapImport = () => {
    if (mapActionState !== "import_curated" || !selectedMapEntry) {
      return
    }

    setCuratedSkillSlug(selectedMapEntry.slug)
    void importCurated(selectedMapEntry.slug)
  }

  const renderMapActionsPanel = () => (
    <div className="space-y-3 rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Map Actions</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{mapCandidateSummary}</p>
        </div>
        {groupFilter ? (
          <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-700 dark:text-cyan-300">
            Group: {groupLabel(groupFilter)}
          </span>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/70 p-2 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {selectedMapEntry ? selectedMapEntry.name : mapActionCopy.title}
          </p>
          {selectedMapEntry ? (
            <span className="rounded-full border border-slate-300/70 px-2 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
              {selectedMapEntry.source.replaceAll("_", " ")}
            </span>
          ) : null}
        </div>

        {selectedMapEntry ? (
          <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{selectedMapEntry.slug}</p>
        ) : null}

        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{mapActionCopy.description}</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{mapActionCopy.hint}</p>
      </div>

      {mapActionState === "import_curated" && selectedMapEntry ? (
        <button
          type="button"
          onClick={handleMapImport}
          disabled={isImportingCurated}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {isImportingCurated ? "Importing..." : `Import ${selectedMapEntry.slug}`}
        </button>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Next to install</p>

        {mapCandidates.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No installable curated skills in this view. Clear filters or refresh the catalog.
          </p>
        ) : (
          <div className="space-y-1">
            {mapCandidates.map((entry) => {
              const isSelected = selectedMapEntry?.id === entry.id
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{entry.name}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{entry.slug}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSkillId(entry.id)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  >
                    {isSelected ? "Selected" : "Select"}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

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
          placeholder="Search skills by name, slug, or description..."
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        />

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SkillCatalogSortKey)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void loadCatalog("force")}
          disabled={isRefreshing}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Catalog"}
        </button>

        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
        >
          Clear Filters
        </button>

        <div className="w-full space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Source</span>
            {SOURCE_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSourceFilters((current) => toggleFilterValue(current, option.value))}
                className={`rounded-full border px-2 py-1 text-xs ${filterChipClass(sourceFilters.includes(option.value))}`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Status</span>
            {STATUS_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilters((current) => toggleFilterValue(current, option.value))}
                className={`rounded-full border px-2 py-1 text-xs ${filterChipClass(statusFilters.includes(option.value))}`}
              >
                {option.label}
              </button>
            ))}
            {groupFilter ? (
              <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-300">
                Map: {groupLabel(groupFilter)}
              </span>
            ) : null}
          </div>
        </div>
      </FilterBar>

      <SurfaceCard>
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Activation Governance</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Pending or denied skills must be activation-approved before use.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
          <input
            type="text"
            value={actingBridgeCrewId}
            onChange={(event) => setActingBridgeCrewId(event.target.value)}
            placeholder="Acting bridge crew ID (optional)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
          />
          <input
            type="text"
            value={activationRationale}
            onChange={(event) => setActivationRationale(event.target.value)}
            placeholder="Rationale for approve/deny decisions"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/[0.05]"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <button
          type="button"
          onClick={() => setIsImportExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Import Skills</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Curated and GitHub URL import options.</p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{isImportExpanded ? "Hide" : "Show"}</span>
        </button>

        {isImportExpanded ? (
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
        ) : null}
      </SurfaceCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SurfaceCard className="lg:col-span-7 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Catalog List</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {listView.counters.filtered} of {listView.counters.total}
            </p>
          </div>

          {isCatalogLoading ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading catalog...</p>
          ) : !catalog ? (
            <div className="mt-3">
              <EmptyState title="Catalog unavailable" description="Unable to load skill catalog." />
            </div>
          ) : listView.filteredEntries.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No matching skills" description="Adjust your search or active filters." />
            </div>
          ) : (
            <div className="mt-3 max-h-[620px] space-y-4 overflow-y-auto pr-1">
              {listView.sections.map((section) => (
                <div key={section.groupId}>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    {section.label} ({section.count})
                  </p>

                  <div className="mt-2 space-y-2">
                    {section.entries.map((entry) => {
                      const isSelected = entry.id === selectedSkillId
                      return (
                        <button
                          key={entry.id}
                          ref={(node) => {
                            rowRefs.current[entry.id] = node
                          }}
                          type="button"
                          onClick={() => setSelectedSkillId(entry.id)}
                          onKeyDown={(event) => handleRowKeyDown(entry.id, event)}
                          aria-current={isSelected}
                          className={`w-full rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 ${
                            isSelected
                              ? "border-cyan-500/45 bg-cyan-500/10"
                              : "border-slate-300/70 bg-white/80 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.name}</p>
                            <span className="rounded-full border border-slate-300/70 px-2 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                              {entry.source.replaceAll("_", " ")}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                entry.isInstalled
                                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "border-slate-300/70 text-slate-500 dark:border-white/15 dark:text-slate-400"
                              }`}
                            >
                              {entry.isInstalled ? "installed" : "not installed"}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                entry.activationStatus === "approved"
                                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : entry.activationStatus === "pending"
                                    ? "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                    : "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                              }`}
                            >
                              activation {entry.activationStatus}
                            </span>
                            {entry.isSystem ? (
                              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300">
                                system
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.slug}</p>
                          {entry.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{entry.description}</p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            Updated: {new Date(entry.updatedAt).toLocaleString()}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="space-y-3 lg:col-span-5 xl:col-span-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Skill Detail</h2>
          {!selectedEntry ? (
            <EmptyState title="No skill selected" description="Select a skill from the catalog list or map." />
          ) : (
            <>
              <div>
                <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedEntry.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedEntry.slug}</p>
              </div>

              {selectedEntry.description ? (
                <p className="rounded-lg border border-slate-200 bg-white/70 p-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                  {selectedEntry.description}
                </p>
              ) : null}

              <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <p>Source: {selectedEntry.source}</p>
                <p>Installed: {selectedEntry.isInstalled ? "yes" : "no"}</p>
                <p>System: {selectedEntry.isSystem ? "yes" : "no"}</p>
                <p>Activation: {selectedEntry.activationStatus}</p>
                {selectedEntry.activationRationale ? <p>Activation rationale: {selectedEntry.activationRationale}</p> : null}
                {selectedEntry.repo ? <p>Repository: {selectedEntry.repo}</p> : null}
                {selectedEntry.sourcePath ? <p>Source path: {selectedEntry.sourcePath}</p> : null}
                {selectedEntry.sourceRef ? <p>Source ref: {selectedEntry.sourceRef}</p> : null}
                {selectedEntry.sourceUrl ? (
                  <p className="break-all">
                    Source URL:{" "}
                    <a
                      href={selectedEntry.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-700 underline dark:text-cyan-300"
                    >
                      {selectedEntry.sourceUrl}
                    </a>
                  </p>
                ) : null}
                {selectedEntry.installedPath ? <p className="break-all">Installed path: {selectedEntry.installedPath}</p> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedEntry.activationStatus !== "approved" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        void decideActivation(selectedEntry.id, "approve")
                      }}
                      disabled={activatingEntryIds.has(selectedEntry.id)}
                      className="rounded-lg border border-emerald-500/45 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 disabled:opacity-50 dark:text-emerald-200"
                    >
                      {activatingEntryIds.has(selectedEntry.id) ? "Updating..." : "Approve Activation"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void decideActivation(selectedEntry.id, "deny")
                      }}
                      disabled={activatingEntryIds.has(selectedEntry.id)}
                      className="rounded-lg border border-rose-500/45 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 disabled:opacity-50 dark:text-rose-200"
                    >
                      {activatingEntryIds.has(selectedEntry.id) ? "Updating..." : "Deny Activation"}
                    </button>
                  </>
                ) : null}

                {selectedEntry.source === "curated" && !selectedEntry.isInstalled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCuratedSkillSlug(selectedEntry.slug)
                      void importCurated(selectedEntry.slug)
                    }}
                    disabled={isImportingCurated}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    {isImportingCurated ? "Importing..." : "Import Curated Skill"}
                  </button>
                ) : null}

                {selectedEntry.installedPath ? (
                  <button
                    type="button"
                    onClick={() => {
                      const installedPath = selectedEntry.installedPath
                      if (!installedPath) return
                      void copyInstalledPath(installedPath)
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  >
                    Copy Installed Path
                  </button>
                ) : null}
              </div>
            </>
          )}
        </SurfaceCard>

        <SurfaceCard className="hidden xl:col-span-3 xl:block">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Catalog Map</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Select a skill node to review actions and import curated candidates.
          </p>

          {isCatalogLoading ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading map...</p>
          ) : !catalog ? (
            <div className="mt-3">
              <EmptyState title="Catalog unavailable" description="Unable to render catalog map." />
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {renderMapActionsPanel()}
              <SkillTreeGraph
                graph={catalog.graph}
                selectedSkillId={selectedSkillId}
                allowedSkillIds={mapView.filteredEntries.map((entry) => entry.id)}
                importableSkillIds={mapImportableSkillIds}
                activeGroupId={groupFilter}
                onSelectSkill={handleMapSkillSelect}
                onToggleGroup={handleMapGroupToggle}
                className="h-[460px]"
              />
            </div>
          )}
        </SurfaceCard>
      </div>

      <SurfaceCard className="xl:hidden">
        <button
          type="button"
          onClick={() => setIsMobileMapExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Catalog Map</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Actionable install view. {mapCandidateSummary}
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{isMobileMapExpanded ? "Hide" : "Show"}</span>
        </button>

        {isMobileMapExpanded ? (
          <div className="mt-3">
            {isCatalogLoading ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Loading map...</p>
            ) : !catalog ? (
              <EmptyState title="Catalog unavailable" description="Unable to render catalog map." />
            ) : (
              <div className="space-y-3">
                {renderMapActionsPanel()}
                <SkillTreeGraph
                  graph={catalog.graph}
                  selectedSkillId={selectedSkillId}
                  allowedSkillIds={mapView.filteredEntries.map((entry) => entry.id)}
                  importableSkillIds={mapImportableSkillIds}
                  activeGroupId={groupFilter}
                  onSelectSkill={handleMapSkillSelect}
                  onToggleGroup={handleMapGroupToggle}
                  className="h-[360px]"
                />
              </div>
            )}
          </div>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <button
          type="button"
          onClick={() => setIsHistoryExpanded((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Recent Imports</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Run history for skill imports.</p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{isHistoryExpanded ? "Hide" : "Show"}</span>
        </button>

        {isHistoryExpanded ? (
          <>
            {isRunsLoading ? (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading import history...</p>
            ) : runs.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No imports yet" description="Import a skill to build your history." />
              </div>
            ) : (
              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {runs.map((run) => {
                  const matchingEntry = run.catalogEntryId ? matchingEntryByRun.get(run.catalogEntryId) : null
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
                        <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(run.createdAt).toLocaleString()}</span>
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
          </>
        ) : null}
      </SurfaceCard>
    </div>
  )
}
