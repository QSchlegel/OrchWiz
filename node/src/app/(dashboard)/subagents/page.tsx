"use client"

import { useEffect, useState } from "react"
import { PageLayout, SurfaceCard, EmptyState, InlineNotice } from "@/components/dashboard/PageLayout"

interface Subagent {
  id: string
  name: string
  description: string | null
  content: string
  path: string | null
  isShared: boolean
  createdAt: string
}

interface SubagentFormState {
  name: string
  description: string
  content: string
  path: string
  isShared: boolean
}

const EMPTY_FORM: SubagentFormState = {
  name: "",
  description: "",
  content: "",
  path: "",
  isShared: false,
}

function toFormState(subagent: Subagent): SubagentFormState {
  return {
    name: subagent.name,
    description: subagent.description || "",
    content: subagent.content,
    path: subagent.path || "",
    isShared: subagent.isShared,
  }
}

export default function SubagentsPage() {
  const [subagents, setSubagents] = useState<Subagent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)
  const [formData, setFormData] = useState<SubagentFormState>(EMPTY_FORM)

  useEffect(() => {
    fetchSubagents()
  }, [])

  const fetchSubagents = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/subagents")
      if (response.ok) {
        const data = await response.json()
        setSubagents(data)
      }
    } catch (error) {
      console.error("Error fetching subagents:", error)
      setMessage({ type: "error", text: "Unable to load subagents" })
    } finally {
      setIsLoading(false)
    }
  }

  const closeForm = () => {
    setShowCreateForm(false)
    setEditingId(null)
    setFormData(EMPTY_FORM)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setMessage(null)

    try {
      const response = await fetch("/api/subagents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to create subagent" })
        return
      }

      setMessage({ type: "success", text: "Subagent created" })
      closeForm()
      fetchSubagents()
    } catch (error) {
      console.error("Error creating subagent:", error)
      setMessage({ type: "error", text: "Failed to create subagent" })
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) {
      return
    }

    setIsUpdating(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/subagents/${editingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to update subagent" })
        return
      }

      setMessage({ type: "success", text: "Subagent updated" })
      closeForm()
      fetchSubagents()
    } catch (error) {
      console.error("Error updating subagent:", error)
      setMessage({ type: "error", text: "Failed to update subagent" })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subagent?")) return

    try {
      const response = await fetch(`/api/subagents/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setMessage({ type: "success", text: "Subagent deleted" })
        fetchSubagents()
      }
    } catch (error) {
      console.error("Error deleting subagent:", error)
      setMessage({ type: "error", text: "Failed to delete subagent" })
    }
  }

  return (
    <PageLayout
      title="Subagents"
      description="Create and maintain reusable subagent definitions."
      actions={
        <button
          onClick={() => {
            setEditingId(null)
            setFormData(EMPTY_FORM)
            setShowCreateForm(true)
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
        >
          New Subagent
        </button>
      }
    >
      <div className="space-y-4">
        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        {showCreateForm && (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingId ? "Edit Subagent" : "Create New Subagent"}
            </h2>
            <form onSubmit={editingId ? handleUpdate : handleCreate} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    placeholder="code-simplifier"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Path</label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    placeholder=".claude/agents/code-simplifier.md"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Content</label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  required
                  rows={10}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={formData.isShared}
                  onChange={(e) => setFormData({ ...formData, isShared: e.target.checked })}
                />
                Share with team
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isCreating || isUpdating}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {isCreating || isUpdating
                    ? editingId
                      ? "Updating..."
                      : "Creating..."
                    : editingId
                      ? "Update"
                      : "Create"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </SurfaceCard>
        )}

        {isLoading ? (
          <SurfaceCard>Loading subagents...</SurfaceCard>
        ) : subagents.length === 0 ? (
          <EmptyState title="No subagents found" description="Create the first subagent to get started." />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
            {subagents.map((subagent) => (
              <SurfaceCard key={subagent.id}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{subagent.name}</h3>
                  {subagent.isShared && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-300">
                      Shared
                    </span>
                  )}
                </div>
                {subagent.description && (
                  <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">{subagent.description}</p>
                )}
                <p className="mb-3 line-clamp-3 text-xs text-slate-500 dark:text-slate-400">
                  {subagent.content}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(subagent.id)
                      setFormData(toFormState(subagent))
                      setShowCreateForm(true)
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(subagent.id)}
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
