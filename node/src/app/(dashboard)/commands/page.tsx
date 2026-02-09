"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowDownUp,
  BadgeInfo,
  Boxes,
  CalendarClock,
  Container,
  Eye,
  FileJson,
  FileSearch,
  FolderTree,
  Forward,
  GitBranch,
  HeartPulse,
  LifeBuoy,
  Link2,
  type LucideIcon,
  MessageSquareText,
  Play,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Share2,
  Terminal,
  Trash2,
  User,
  X,
} from "lucide-react"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { PageLayout, SurfaceCard, FilterBar, EmptyState } from "@/components/dashboard/PageLayout"

interface Command {
  id: string
  name: string
  description: string | null
  scriptContent: string
  path: string | null
  isShared: boolean
  createdAt: string
  _count: {
    executions: number
  }
  isForwarded?: boolean
  sourceNodeId?: string
  sourceNodeName?: string | null
}

type CommandTheme = "health" | "runtime" | "context" | "deploy" | "logs" | "fallback" | "default"

function themeForCommand(command: Command): CommandTheme {
  const text = `${command.name} ${command.description || ""}`.toLowerCase()

  if (text.includes("health") || text.includes("ready")) return "health"
  if (text.includes("runtime") || text.includes("prompt") || text.includes("version")) return "runtime"
  if (text.includes("context") || text.includes("schema") || text.includes("state")) return "context"
  if (text.includes("deployment") || text.includes("rollout") || text.includes("restart") || text.includes("pods")) {
    return "deploy"
  }
  if (text.includes("logs") || text.includes("audit")) return "logs"
  if (text.includes("fallback")) return "fallback"

  return "default"
}

function iconForCommand(command: Command): LucideIcon {
  const text = `${command.name} ${command.description || ""}`.toLowerCase()

  if (text.includes("health")) return HeartPulse
  if (text.includes("version")) return BadgeInfo
  if (text.includes("prompt") || text.includes("smoke")) return MessageSquareText
  if (text.includes("ready")) return ShieldCheck
  if (text.includes("context") || text.includes("schema") || text.includes("json")) return FileJson
  if (text.includes("target-deployments") || text.includes("deployment")) return Boxes
  if (text.includes("rollout")) return RefreshCcw
  if (text.includes("pods") || text.includes("container")) return Container
  if (text.includes("logs")) return FileSearch
  if (text.includes("restart")) return RefreshCcw
  if (text.includes("state-list")) return FolderTree
  if (text.includes("audit")) return FileSearch
  if (text.includes("runtime-chain")) return GitBranch
  if (text.includes("fallback")) return LifeBuoy

  return Terminal
}

export default function CommandsPage() {
  const [commands, setCommands] = useState<Command[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "shared" | "personal">("all")
  const [sortMode, setSortMode] = useState<"recent" | "name" | "executions">("recent")
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    scriptContent: "",
    path: "",
    isShared: false,
  })

  useEffect(() => {
    fetchCommands()
  }, [includeForwarded, sourceNodeId])

  useEventStream({
    enabled: true,
    types: ["command.executed", "forwarding.received"],
    onEvent: () => {
      fetchCommands()
    },
  })

  const fetchCommands = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (includeForwarded) params.append("includeForwarded", "true")
      if (sourceNodeId.trim()) params.append("sourceNodeId", sourceNodeId.trim())

      const response = await fetch(`/api/commands?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setCommands(data)
      }
    } catch (error) {
      console.error("Error fetching commands:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)

    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setShowCreateForm(false)
        setFormData({
          name: "",
          description: "",
          scriptContent: "",
          path: "",
          isShared: false,
        })
        fetchCommands()
      }
    } catch (error) {
      console.error("Error creating command:", error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this command?")) return

    try {
      const response = await fetch(`/api/commands/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchCommands()
      }
    } catch (error) {
      console.error("Error deleting command:", error)
    }
  }

  const handleRun = async (command: Command) => {
    if (command.isForwarded) {
      return
    }

    setRunningId(command.id)
    try {
      await fetch(`/api/commands/${command.id}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
      fetchCommands()
    } catch (error) {
      console.error("Error executing command:", error)
    } finally {
      setRunningId(null)
    }
  }

  const filteredCommands = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    const filtered = commands.filter((command) => {
      if (visibilityFilter === "shared" && !command.isShared) {
        return false
      }
      if (visibilityFilter === "personal" && command.isShared) {
        return false
      }

      if (!query) {
        return true
      }

      const haystack = [
        command.name,
        command.description || "",
        command.path || "",
        command.sourceNodeName || "",
        command.sourceNodeId || "",
      ]
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })

    return filtered.sort((left, right) => {
      if (sortMode === "name") {
        return left.name.localeCompare(right.name)
      }
      if (sortMode === "executions") {
        return right._count.executions - left._count.executions
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    })
  }, [commands, searchQuery, sortMode, visibilityFilter])

  const totalExecutions = useMemo(
    () => filteredCommands.reduce((sum, command) => sum + command._count.executions, 0),
    [filteredCommands],
  )

  return (
    <PageLayout
      title="Slash Commands"
      description="Create and manage reusable slash commands."
      actions={
        <button
          onClick={() => setShowCreateForm((current) => !current)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          {showCreateForm ? <X size={16} /> : <Plus size={16} />}
          {showCreateForm ? "Close" : "New Command"}
        </button>
      }
    >
      <div className="space-y-4">
        <FilterBar>
          <div className="relative min-w-[220px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name, description, path..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
          </div>

          <div className="relative">
            <User
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            />
            <select
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value as "all" | "shared" | "personal")}
              className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              <option value="all">All visibility</option>
              <option value="shared">Shared only</option>
              <option value="personal">Personal only</option>
            </select>
          </div>

          <div className="relative">
            <ArrowDownUp
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "recent" | "name" | "executions")}
              className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              <option value="recent">Sort: Recent</option>
              <option value="name">Sort: Name</option>
              <option value="executions">Sort: Executions</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeForwarded}
              onChange={(e) => setIncludeForwarded(e.target.checked)}
            />
            <Forward size={14} />
            Include forwarded
          </label>

          <div className="relative">
            <Link2
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            />
            <input
              type="text"
              value={sourceNodeId}
              onChange={(e) => setSourceNodeId(e.target.value)}
              placeholder="Source node filter"
              className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
          </div>
        </FilterBar>

        {!isLoading && filteredCommands.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1 dark:border-white/15">
              <Search size={12} />
              {filteredCommands.length} commands
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-1 dark:border-white/15">
              <ArrowDownUp size={12} />
              {totalExecutions} total executions
            </span>
            {includeForwarded && (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/35 px-2 py-1 text-indigo-700 dark:text-indigo-300">
                <Forward size={12} />
                Forwarded included
              </span>
            )}
          </div>
        )}

        {showCreateForm && (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Create New Command
            </h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    placeholder="commit-push-pr"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Path (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) =>
                      setFormData({ ...formData, path: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    placeholder=".claude/commands/commit-push-pr.sh"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Script Content
                </label>
                <textarea
                  value={formData.scriptContent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      scriptContent: e.target.value,
                    })
                  }
                  required
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  placeholder="#!/bin/bash&#10;git add .&#10;git commit -m &quot;$1&quot;&#10;git push"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.isShared}
                  onChange={(e) =>
                    setFormData({ ...formData, isShared: e.target.checked })
                  }
                />
                Share with team
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {isCreating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </SurfaceCard>
        )}

        {isLoading ? (
          <SurfaceCard>Loading commands...</SurfaceCard>
        ) : filteredCommands.length === 0 ? (
          <EmptyState
            title="No commands match this view"
            description="Try adjusting search/filter settings or create a new command."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCommands.map((command) => {
              const CommandIcon = iconForCommand(command)
              const theme = themeForCommand(command)
              const accentByTheme: Record<CommandTheme, string> = {
                health:
                  "border-emerald-200/90 bg-gradient-to-br from-emerald-50/85 to-white dark:border-emerald-500/25 dark:from-emerald-500/[0.08] dark:to-white/[0.03]",
                runtime:
                  "border-violet-200/90 bg-gradient-to-br from-violet-50/85 to-white dark:border-violet-500/25 dark:from-violet-500/[0.08] dark:to-white/[0.03]",
                context:
                  "border-cyan-200/90 bg-gradient-to-br from-cyan-50/85 to-white dark:border-cyan-500/25 dark:from-cyan-500/[0.08] dark:to-white/[0.03]",
                deploy:
                  "border-amber-200/90 bg-gradient-to-br from-amber-50/85 to-white dark:border-amber-500/25 dark:from-amber-500/[0.08] dark:to-white/[0.03]",
                logs:
                  "border-blue-200/90 bg-gradient-to-br from-blue-50/85 to-white dark:border-blue-500/25 dark:from-blue-500/[0.08] dark:to-white/[0.03]",
                fallback:
                  "border-rose-200/90 bg-gradient-to-br from-rose-50/85 to-white dark:border-rose-500/25 dark:from-rose-500/[0.08] dark:to-white/[0.03]",
                default:
                  "border-slate-200/90 bg-gradient-to-br from-slate-50/85 to-white dark:border-white/10 dark:from-white/[0.04] dark:to-white/[0.03]",
              }
              const iconToneByTheme: Record<CommandTheme, string> = {
                health:
                  "border-emerald-300/70 bg-emerald-100/80 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-200",
                runtime:
                  "border-violet-300/70 bg-violet-100/80 text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/15 dark:text-violet-200",
                context:
                  "border-cyan-300/70 bg-cyan-100/80 text-cyan-800 dark:border-cyan-500/35 dark:bg-cyan-500/15 dark:text-cyan-200",
                deploy:
                  "border-amber-300/70 bg-amber-100/80 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-200",
                logs:
                  "border-blue-300/70 bg-blue-100/80 text-blue-800 dark:border-blue-500/35 dark:bg-blue-500/15 dark:text-blue-200",
                fallback:
                  "border-rose-300/70 bg-rose-100/80 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/15 dark:text-rose-200",
                default:
                  "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-200",
              }

              return (
                <SurfaceCard
                  key={command.id}
                  className={`group relative overflow-hidden border shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${accentByTheme[theme]}`}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${iconToneByTheme[theme]}`}
                      >
                        <CommandIcon size={14} />
                      </span>
                      <h3 className="line-clamp-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                        /{command.name}
                      </h3>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {command.isForwarded ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                          <Forward size={11} />
                          Forwarded
                        </span>
                      ) : command.isShared ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                          <Share2 size={11} />
                          Shared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300/60 bg-slate-100/80 px-2 py-0.5 text-[11px] text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-300">
                          <User size={11} />
                          Personal
                        </span>
                      )}
                    </div>
                  </div>
                  {command.description && (
                    <p className="mb-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                      {command.description}
                    </p>
                  )}
                  <div className="mb-3 flex flex-wrap items-center gap-3 border-t border-slate-200/70 pt-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Play size={12} />
                      {command._count.executions} executions
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={12} />
                      Added {new Date(command.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {command.path && (
                    <div className="mb-3 truncate rounded-md border border-slate-200/80 bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                      {command.path}
                    </div>
                  )}
                  {command.isForwarded && (
                    <div className="mb-3 text-xs text-indigo-600 dark:text-indigo-300">
                      Source: {command.sourceNodeName || command.sourceNodeId || "unknown node"}
                    </div>
                  )}
                  <div className="flex gap-2">
                    {command.isForwarded ? (
                      <button
                        disabled
                        className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/60 px-3 py-2 text-sm text-slate-500 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-400"
                      >
                        <Forward size={14} />
                        Forwarded event
                      </button>
                    ) : (
                      <>
                        <Link
                          href={`/commands/${command.id}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-slate-900"
                        >
                          <Eye size={14} />
                          View
                        </Link>
                        <button
                          onClick={() => handleRun(command)}
                          disabled={runningId === command.id}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:opacity-50 dark:text-emerald-300"
                        >
                          <Play size={14} />
                          {runningId === command.id ? "Running..." : "Run"}
                        </button>
                        <button
                          onClick={() => handleDelete(command.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-500/[0.04] px-3 py-2 text-sm text-rose-700 transition-colors hover:bg-rose-500/12 dark:text-rose-300"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </SurfaceCard>
              )
            })}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
