"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { PageLayout, SurfaceCard, FilterBar, EmptyState } from "@/components/dashboard/PageLayout"

interface Command {
  id: string
  name: string
  description: string | null
  scriptContent: string
  path: string | null
  isShared: boolean
  createdAt: Date
  _count: {
    executions: number
  }
  isForwarded?: boolean
  sourceNodeId?: string
  sourceNodeName?: string | null
}

export default function CommandsPage() {
  const [commands, setCommands] = useState<Command[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [includeForwarded, setIncludeForwarded] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState("")
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

  return (
    <PageLayout
      title="Slash Commands"
      description="Create and manage reusable slash commands."
      actions={
        <button
          onClick={() => setShowCreateForm(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          New Command
        </button>
      }
    >
      <div className="space-y-4">
        <FilterBar>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-white/15 dark:text-slate-300">
            <input
              type="checkbox"
              checked={includeForwarded}
              onChange={(e) => setIncludeForwarded(e.target.checked)}
            />
            Include forwarded
          </label>

          <input
            type="text"
            value={sourceNodeId}
            onChange={(e) => setSourceNodeId(e.target.value)}
            placeholder="Source node filter"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </FilterBar>

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
        ) : commands.length === 0 ? (
          <EmptyState title="No commands found" description="Create your first command to get started." />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {commands.map((command) => (
              <SurfaceCard key={command.id}>
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    /{command.name}
                  </h3>
                  {command.isForwarded ? (
                    <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                      Forwarded
                    </span>
                  ) : command.isShared && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                      Shared
                    </span>
                  )}
                </div>
                {command.description && (
                  <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                    {command.description}
                  </p>
                )}
                <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  {command._count.executions} executions
                </div>
                {command.isForwarded && (
                  <div className="mb-3 text-xs text-indigo-600 dark:text-indigo-300">
                    Source: {command.sourceNodeName || command.sourceNodeId || "unknown node"}
                  </div>
                )}
                <div className="flex gap-2">
                  <Link
                    href={`/commands/${command.id}`}
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(command.id)}
                    className="rounded-lg border border-rose-500/35 px-3 py-2 text-sm text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
