"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ContextOrchestrationBoard } from "@/components/subagents/ContextOrchestrationBoard"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { buildInitialBridgeCrewSubagents } from "@/lib/subagents/bridge-crew-bootstrap"

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
}

type PersonalTab = "personal" | "shared"

const EMPTY_FORM: SubagentFormState = {
  name: "",
  description: "",
  content: "",
  path: "",
}

function toFormState(subagent: Subagent): SubagentFormState {
  return {
    name: subagent.name,
    description: subagent.description || "",
    content: subagent.content,
    path: subagent.path || "",
  }
}

function parseTab(raw: string | null): PersonalTab {
  return raw === "shared" ? "shared" : "personal"
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // ignore parse errors and return status fallback
  }
  return `Request failed with status ${response.status}`
}

export default function PersonalPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [allSubagents, setAllSubagents] = useState<Subagent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isBootstrappingCrew, setIsBootstrappingCrew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)
  const [formData, setFormData] = useState<SubagentFormState>(EMPTY_FORM)
  const autoBootstrapAttemptedRef = useRef(false)

  const activeTab = parseTab(searchParams.get("tab"))
  const initialBridgeCrew = useMemo(() => buildInitialBridgeCrewSubagents(), [])
  const personalSubagents = useMemo(
    () => allSubagents.filter((subagent) => !subagent.isShared),
    [allSubagents]
  )
  const sharedSubagents = useMemo(
    () => allSubagents.filter((subagent) => subagent.isShared),
    [allSubagents]
  )
  const activeSubagents = activeTab === "shared" ? sharedSubagents : personalSubagents
  const missingInitialBridgeCrew = useMemo(() => {
    const existingNames = new Set(personalSubagents.map((subagent) => subagent.name.toLowerCase()))
    return initialBridgeCrew.filter((seed) => !existingNames.has(seed.name.toLowerCase()))
  }, [initialBridgeCrew, personalSubagents])

  useEffect(() => {
    fetchSubagents()
  }, [])

  useEffect(() => {
    if (activeTab === "shared") {
      setShowCreateForm(false)
      setEditingId(null)
      setFormData(EMPTY_FORM)
    }
  }, [activeTab])

  const setActiveTab = (tab: PersonalTab) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    const nextUrl = `${pathname}?${params.toString()}`
    router.replace(nextUrl, { scroll: false })
  }

  const fetchSubagents = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/subagents")
      if (response.ok) {
        const data = await response.json()
        setAllSubagents(data)
      } else {
        setMessage({ type: "error", text: "Unable to load personal agents" })
      }
    } catch (error) {
      console.error("Error fetching subagents:", error)
      setMessage({ type: "error", text: "Unable to load personal agents" })
    } finally {
      setIsLoading(false)
    }
  }

  const closeForm = () => {
    setShowCreateForm(false)
    setEditingId(null)
    setFormData(EMPTY_FORM)
  }

  const handleBootstrapBridgeCrew = useCallback(async (auto = false) => {
    const seedsToCreate = [...missingInitialBridgeCrew]
    if (seedsToCreate.length === 0) {
      if (!auto) {
        setMessage({ type: "info", text: "Initial bridge crew is already present." })
      }
      return
    }

    setIsBootstrappingCrew(true)
    if (!auto) {
      setMessage(null)
    }
    closeForm()

    let created = 0
    const failures: string[] = []

    for (const seed of seedsToCreate) {
      try {
        const response = await fetch("/api/subagents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(seed),
        })

        if (response.ok) {
          created += 1
        } else {
          failures.push(`${seed.name}: ${await readApiError(response)}`)
        }
      } catch (error) {
        failures.push(`${seed.name}: ${(error as Error).message}`)
      }
    }

    await fetchSubagents()
    setIsBootstrappingCrew(false)

    if (failures.length === 0) {
      setMessage({
        type: "success",
        text: `Initialized ${created} bridge crew agent${created === 1 ? "" : "s"} with OpenClaw-oriented context.`,
      })
      return
    }

    if (created > 0) {
      setMessage({
        type: "error",
        text: `Initialized ${created} bridge crew agents, but ${failures.length} failed (${failures.join(" | ")}).`,
      })
      return
    }

    setMessage({
      type: "error",
      text: `Failed to initialize bridge crew (${failures.join(" | ")}).`,
    })
  }, [missingInitialBridgeCrew])

  useEffect(() => {
    if (isLoading) return
    if (autoBootstrapAttemptedRef.current) return
    if (personalSubagents.length > 0) return

    autoBootstrapAttemptedRef.current = true
    void handleBootstrapBridgeCrew(true)
  }, [handleBootstrapBridgeCrew, isLoading, personalSubagents.length])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (activeTab !== "personal") {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    setIsCreating(true)
    setMessage(null)

    try {
      const response = await fetch("/api/subagents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          isShared: false,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to create personal agent" })
        return
      }

      setMessage({ type: "success", text: "Personal agent created" })
      closeForm()
      fetchSubagents()
    } catch (error) {
      console.error("Error creating subagent:", error)
      setMessage({ type: "error", text: "Failed to create personal agent" })
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingId) {
      return
    }

    const target = allSubagents.find((subagent) => subagent.id === editingId)
    if (!target) {
      setMessage({ type: "error", text: "Agent no longer exists." })
      closeForm()
      return
    }
    if (target.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      closeForm()
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
        body: JSON.stringify({
          ...formData,
          isShared: false,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to update personal agent" })
        return
      }

      setMessage({ type: "success", text: "Personal agent updated" })
      closeForm()
      fetchSubagents()
    } catch (error) {
      console.error("Error updating subagent:", error)
      setMessage({ type: "error", text: "Failed to update personal agent" })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async (id: string) => {
    const target = allSubagents.find((subagent) => subagent.id === id)
    if (!target) {
      setMessage({ type: "error", text: "Agent no longer exists." })
      return
    }
    if (target.isShared) {
      setMessage({ type: "error", text: "Shared agents are read-only on this page." })
      return
    }

    if (!confirm("Are you sure you want to delete this personal agent?")) return

    try {
      const response = await fetch(`/api/subagents/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setMessage({ type: "success", text: "Personal agent deleted" })
        fetchSubagents()
      } else {
        setMessage({ type: "error", text: "Failed to delete personal agent" })
      }
    } catch (error) {
      console.error("Error deleting subagent:", error)
      setMessage({ type: "error", text: "Failed to delete personal agent" })
    }
  }

  return (
    <PageLayout
      title="Personal"
      description="Manage personal agents and engineer how their runtime context is composed."
      actions={
        activeTab === "personal" ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                void handleBootstrapBridgeCrew(false)
              }}
              disabled={isBootstrappingCrew || missingInitialBridgeCrew.length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              {isBootstrappingCrew
                ? "Initializing..."
                : missingInitialBridgeCrew.length === 0
                  ? "Bridge Crew Ready"
                  : `Initialize Bridge Crew (${missingInitialBridgeCrew.length})`}
            </button>
            <button
              onClick={() => {
                setEditingId(null)
                setFormData(EMPTY_FORM)
                setShowCreateForm(true)
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
            >
              New Personal Agent
            </button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setActiveTab("personal")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "personal"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            }`}
          >
            Personal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shared")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === "shared"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            }`}
          >
            Shared
          </button>
        </div>

        {message && <InlineNotice variant={message.type}>{message.text}</InlineNotice>}

        {activeTab === "shared" && (
          <InlineNotice variant="info">Shared agents are visible here in read-only mode.</InlineNotice>
        )}

        {isLoading ? (
          <SurfaceCard>Loading context orchestration board...</SurfaceCard>
        ) : (
          <ContextOrchestrationBoard subagents={activeSubagents} />
        )}

        {activeTab === "personal" && showCreateForm && (
          <SurfaceCard>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingId ? "Edit Personal Agent" : "Create New Personal Agent"}
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
          <SurfaceCard>Loading agents...</SurfaceCard>
        ) : activeSubagents.length === 0 ? (
          activeTab === "personal" ? (
            <SurfaceCard>
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  No personal agents found
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Initialize the standard bridge crew to start with OpenClaw-oriented context files.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      void handleBootstrapBridgeCrew(false)
                    }}
                    disabled={isBootstrappingCrew}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                  >
                    {isBootstrappingCrew ? "Initializing..." : "Initialize Bridge Crew"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                  >
                    Create manually
                  </button>
                </div>
              </div>
            </SurfaceCard>
          ) : (
            <EmptyState
              title="No shared agents found"
              description="Shared agents will appear here automatically."
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:grid-cols-2">
            {activeSubagents.map((subagent) => (
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
                {activeTab === "personal" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (subagent.isShared) {
                          setMessage({ type: "error", text: "Shared agents are read-only on this page." })
                          return
                        }
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
                )}
              </SurfaceCard>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
