"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, Filter, Search, Sparkles } from "lucide-react"
import { OPEN_SOURCE_ATTRIBUTIONS } from "@/lib/open-source/attributions"

type WorkspaceFilter =
  | "all"
  | "node"
  | "desktop"
  | "provider-proxy"
  | "data-core"
  | "wallet-enclave"
  | "agent-lightning-store"
  | "kugelaudio-tts"
  | "infra"
  | "fonts"

const WORKSPACE_FILTERS: Array<{ id: WorkspaceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "node", label: "Web App" },
  { id: "desktop", label: "Desktop App" },
  { id: "provider-proxy", label: "Provider Proxy" },
  { id: "data-core", label: "Data Core" },
  { id: "wallet-enclave", label: "Wallet Enclave" },
  { id: "agent-lightning-store", label: "Agent Lightning Store" },
  { id: "kugelaudio-tts", label: "KugelAudio TTS" },
  { id: "infra", label: "Infra" },
  { id: "fonts", label: "Fonts" },
]

function normalizeToken(value: string): string {
  return value.trim().toLowerCase()
}

export default function OpenSourcePage() {
  const [query, setQuery] = useState("")
  const [workspace, setWorkspace] = useState<WorkspaceFilter>("all")
  const [includeDev, setIncludeDev] = useState(true)

  const filtered = useMemo(() => {
    const q = normalizeToken(query)
    return OPEN_SOURCE_ATTRIBUTIONS.filter((item) => {
      if (!includeDev && !item.occurrences.some((o) => o.kind === "dependency")) {
        return false
      }

      if (workspace !== "all" && !item.occurrences.some((o) => o.workspaceId === workspace)) {
        return false
      }

      if (!q) return true
      const haystack = `${item.name} ${item.description || ""}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [includeDev, query, workspace])

  const counts = useMemo(() => {
    const runtimeCount = filtered.filter((item) => item.occurrences.some((o) => o.kind === "dependency")).length
    const devOnlyCount = filtered.length - runtimeCount
    return { total: filtered.length, runtimeCount, devOnlyCount }
  }, [filtered])

  return (
    <main className="min-h-screen gradient-orb noise-overlay relative text-slate-900 dark:text-slate-100 px-6 py-12 md:px-12">
      <div className="absolute inset-0 bridge-grid pointer-events-none opacity-20 dark:opacity-35" aria-hidden />

      <div className="relative z-10 max-w-6xl mx-auto space-y-8">
        <header className="glass rounded-2xl p-6 md:p-8 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none" aria-hidden>
            <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-cyan-500/10 blur-[90px] dark:bg-cyan-400/10" />
            <div className="absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-violet-500/10 blur-[110px] dark:bg-violet-400/10" />
          </div>

          <div className="relative">
            <p
              className="mb-3 inline-flex items-center gap-2 text-xs tracking-widest uppercase text-cyan-700 dark:text-cyan-300"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <Sparkles className="h-4 w-4" />
              Open Source Credits
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Built on open source
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-600 dark:text-slate-300 max-w-3xl">
              OrchWiz is held together by an ecosystem of open source libraries, frameworks, and tools. This page is our
              way of saying thank you, and giving credit where credit is due.
            </p>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 max-w-3xl">
              Security note: we run automated dependency vulnerability scans regularly in CI. If you spot anything
              missing or mis-attributed, please open an issue.
            </p>

            <div className="mt-6 flex flex-wrap gap-3 text-xs">
              <Link
                href="/"
                className="inline-flex items-center rounded-lg border border-slate-300/80 bg-white/70 px-3 py-1.5 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                Back to landing
              </Link>
              <a
                href="https://github.com/QSchlegel/OrchWiz"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300/80 bg-white/70 px-3 py-1.5 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                View repository
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </header>

        <section className="glass rounded-2xl p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter the constellation</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{counts.total}</span> entries
                ({counts.runtimeCount} runtime{includeDev ? `, ${counts.devOnlyCount} dev-only` : ""}).
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative">
                <span className="sr-only">Search open source credits</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search (e.g., next, prisma, fastapi)"
                  className="w-full sm:w-[320px] rounded-xl border border-slate-300/80 bg-white/80 pl-9 pr-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/20 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100 dark:focus:border-cyan-300/70 dark:focus:ring-cyan-400/20"
                />
              </label>

              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200">
                <Filter className="h-4 w-4 text-cyan-700 dark:text-cyan-300" />
                <span className="font-semibold">Include dev</span>
                <input
                  type="checkbox"
                  checked={includeDev}
                  onChange={(event) => setIncludeDev(event.target.checked)}
                  className="h-4 w-4 accent-cyan-600"
                />
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {WORKSPACE_FILTERS.map((filter) => {
              const active = filter.id === workspace
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setWorkspace(filter.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-800 dark:border-cyan-300/45 dark:text-cyan-100"
                      : "border-slate-300/80 bg-white/70 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  }`}
                >
                  {filter.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => {
            const versions = [...new Set(item.occurrences.map((o) => o.version).filter(Boolean) as string[])]
            const versionLabel = versions.length === 0 ? null : versions.length === 1 ? versions[0] : "varies"

            const usage = (() => {
              const map = new Map<
                string,
                { workspaceId: string; label: string; runtime: boolean; dev: boolean }
              >()
              for (const occ of item.occurrences) {
                const key = occ.workspaceId
                const next = map.get(key) || { workspaceId: occ.workspaceId, label: occ.workspaceLabel, runtime: false, dev: false }
                if (occ.kind === "dependency") next.runtime = true
                if (occ.kind === "devDependency") next.dev = true
                map.set(key, next)
              }
              return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
            })()

            return (
              <div
                key={item.name}
                className="rounded-2xl border border-slate-300/80 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-white/15 dark:bg-white/[0.04]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 font-semibold text-slate-900 hover:underline dark:text-slate-100"
                    >
                      <span className="truncate">{item.name}</span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    </a>
                    {item.description ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
                    ) : null}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <span className="rounded-full border border-slate-300/80 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200">
                      {item.license || "License: see upstream"}
                    </span>
                    {versionLabel ? (
                      <span
                        className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-800 dark:border-cyan-300/30 dark:text-cyan-100"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        v{versionLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {usage.map((u) => (
                    <span
                      key={u.workspaceId}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300/70 bg-white/80 px-2.5 py-1 text-[11px] text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200"
                    >
                      {u.label}
                      {u.runtime ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          runtime
                        </span>
                      ) : null}
                      {u.dev && !u.runtime ? (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                          dev
                        </span>
                      ) : null}
                      {u.dev && u.runtime ? (
                        <span className="rounded bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/[0.08] dark:text-slate-200">
                          dev
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        {filtered.length === 0 ? (
          <section className="glass rounded-2xl p-6 md:p-8 text-center">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No matches</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Try a different search term, or switch workspace filters.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  )
}
