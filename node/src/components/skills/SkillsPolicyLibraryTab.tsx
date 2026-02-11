"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { EmptyState, InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"

interface PermissionPolicyRule {
  id?: string
  commandPattern: string
  type: "bash_command" | "tool_command"
  status: "allow" | "ask" | "deny"
  sortOrder: number
}

interface PermissionPolicy {
  id: string
  slug: string
  name: string
  description: string | null
  isSystem: boolean
  rules: PermissionPolicyRule[]
  _count?: {
    assignments: number
  }
}

interface PolicyEditorState {
  id: string | null
  name: string
  description: string
  rules: PermissionPolicyRule[]
}

function sortPolicyRules(rules: PermissionPolicyRule[]): PermissionPolicyRule[] {
  return [...rules].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder
    }
    return left.commandPattern.localeCompare(right.commandPattern)
  })
}

function emptyPolicyEditorState(): PolicyEditorState {
  return {
    id: null,
    name: "",
    description: "",
    rules: [{ commandPattern: "", type: "bash_command", status: "allow", sortOrder: 10 }],
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // ignore parse failures
  }

  return `Request failed with status ${response.status}`
}

export function SkillsPolicyLibraryTab() {
  const [policyLibrary, setPolicyLibrary] = useState<PermissionPolicy[]>([])
  const [isPolicyLibraryLoading, setIsPolicyLibraryLoading] = useState(false)
  const [isPolicyEditorSaving, setIsPolicyEditorSaving] = useState(false)
  const [policyEditor, setPolicyEditor] = useState<PolicyEditorState>(emptyPolicyEditorState())
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const loadPolicyLibrary = useCallback(async () => {
    setIsPolicyLibraryLoading(true)
    try {
      const response = await fetch("/api/permission-policies")
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const library = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.id === "string")
            .map((entry: any) => ({
              id: entry.id,
              slug: typeof entry.slug === "string" ? entry.slug : "",
              name: typeof entry.name === "string" ? entry.name : "",
              description: typeof entry.description === "string" ? entry.description : null,
              isSystem: Boolean(entry.isSystem),
              rules: sortPolicyRules(
                Array.isArray(entry.rules)
                  ? entry.rules
                      .filter((rule: any) => rule && typeof rule.commandPattern === "string")
                      .map((rule: any, index: number) => ({
                        id: typeof rule.id === "string" ? rule.id : undefined,
                        commandPattern: rule.commandPattern,
                        type: rule.type === "tool_command" ? "tool_command" : "bash_command",
                        status: rule.status === "deny" || rule.status === "ask" ? rule.status : "allow",
                        sortOrder: Number.isFinite(rule.sortOrder) ? Number(rule.sortOrder) : (index + 1) * 10,
                      }))
                  : [],
              ),
              _count: {
                assignments: Number(entry?._count?.assignments) || 0,
              },
            }))
            .sort((left: PermissionPolicy, right: PermissionPolicy) => {
              if (left.isSystem !== right.isSystem) {
                return left.isSystem ? -1 : 1
              }
              return left.name.localeCompare(right.name)
            })
        : []

      setPolicyLibrary(library)
    } catch (error) {
      console.error("Failed to load policy library:", error)
      setNotice({ type: "error", text: "Unable to load policy library" })
    } finally {
      setIsPolicyLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPolicyLibrary()
  }, [loadPolicyLibrary])

  const addPolicyEditorRule = () => {
    setPolicyEditor((current) => ({
      ...current,
      rules: [
        ...current.rules,
        {
          commandPattern: "",
          type: "bash_command",
          status: "allow",
          sortOrder: (current.rules.length + 1) * 10,
        },
      ],
    }))
  }

  const updatePolicyEditorRule = (index: number, patch: Partial<PermissionPolicyRule>) => {
    setPolicyEditor((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    }))
  }

  const removePolicyEditorRule = (index: number) => {
    setPolicyEditor((current) => ({
      ...current,
      rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index),
    }))
  }

  const editPolicyFromLibrary = (policy: PermissionPolicy) => {
    if (policy.isSystem) {
      setNotice({ type: "info", text: "System policy profiles are immutable." })
      return
    }

    setPolicyEditor({
      id: policy.id,
      name: policy.name,
      description: policy.description || "",
      rules: sortPolicyRules(policy.rules).map((rule, index) => ({
        id: rule.id,
        commandPattern: rule.commandPattern,
        type: rule.type,
        status: rule.status,
        sortOrder: Number.isFinite(rule.sortOrder) ? Number(rule.sortOrder) : (index + 1) * 10,
      })),
    })
  }

  const resetPolicyEditor = () => {
    setPolicyEditor(emptyPolicyEditorState())
  }

  const savePolicyEditor = async (event: React.FormEvent) => {
    event.preventDefault()

    const trimmedName = policyEditor.name.trim()
    if (!trimmedName) {
      setNotice({ type: "error", text: "Policy name is required." })
      return
    }

    const preparedRules = sortPolicyRules(policyEditor.rules)
      .map((rule, index) => ({
        commandPattern: rule.commandPattern.trim(),
        type: rule.type,
        status: rule.status,
        sortOrder: Number.isFinite(rule.sortOrder) ? Number(rule.sortOrder) : (index + 1) * 10,
      }))
      .filter((rule) => rule.commandPattern.length > 0)

    if (preparedRules.length === 0) {
      setNotice({ type: "error", text: "Add at least one non-empty policy rule." })
      return
    }

    setIsPolicyEditorSaving(true)
    setNotice(null)

    try {
      const method = policyEditor.id ? "PUT" : "POST"
      const url = policyEditor.id ? `/api/permission-policies/${policyEditor.id}` : "/api/permission-policies"
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: policyEditor.description.trim() || null,
          rules: preparedRules,
        }),
      })

      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      await loadPolicyLibrary()
      resetPolicyEditor()
      setNotice({ type: "success", text: "Policy profile saved" })
    } catch (error) {
      console.error("Error saving policy profile:", error)
      setNotice({ type: "error", text: "Unable to save policy profile" })
    } finally {
      setIsPolicyEditorSaving(false)
    }
  }

  const deletePolicyProfile = async (policyId: string) => {
    if (!confirm("Delete this policy profile?")) return

    try {
      const response = await fetch(`/api/permission-policies/${policyId}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      await loadPolicyLibrary()
      if (policyEditor.id === policyId) {
        resetPolicyEditor()
      }
      setNotice({ type: "success", text: "Policy profile deleted" })
    } catch (error) {
      console.error("Error deleting policy profile:", error)
      setNotice({ type: "error", text: "Unable to delete policy profile" })
    }
  }

  const policyCountLabel = useMemo(() => {
    if (policyLibrary.length === 1) {
      return "1 profile"
    }

    return `${policyLibrary.length} profiles`
  }, [policyLibrary.length])

  return (
    <div className="space-y-4">
      {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

      <SurfaceCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Policy Library</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{policyCountLabel}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Create and maintain reusable profile bundles. System profiles are immutable.
        </p>

        <form
          onSubmit={savePolicyEditor}
          className="mt-3 space-y-2 rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              type="text"
              value={policyEditor.name}
              onChange={(event) => setPolicyEditor((current) => ({ ...current, name: event.target.value }))}
              placeholder="Profile name"
              required
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <input
              type="text"
              value={policyEditor.description}
              onChange={(event) => setPolicyEditor((current) => ({ ...current, description: event.target.value }))}
              placeholder="Description (optional)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
          </div>

          <div className="space-y-2">
            {policyEditor.rules.map((rule, index) => (
              <div key={`${rule.id || "draft"}-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                <input
                  type="text"
                  value={rule.commandPattern}
                  onChange={(event) => updatePolicyEditorRule(index, { commandPattern: event.target.value })}
                  placeholder="command pattern"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-6 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
                <select
                  value={rule.status}
                  onChange={(event) =>
                    updatePolicyEditorRule(index, { status: event.target.value as "allow" | "ask" | "deny" })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="allow">allow</option>
                  <option value="ask">ask</option>
                  <option value="deny">deny</option>
                </select>
                <select
                  value={rule.type}
                  onChange={(event) =>
                    updatePolicyEditorRule(index, { type: event.target.value as "bash_command" | "tool_command" })
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="bash_command">bash_command</option>
                  <option value="tool_command">tool_command</option>
                </select>
                <div className="flex gap-2 md:col-span-2">
                  <input
                    type="number"
                    value={rule.sortOrder}
                    onChange={(event) => updatePolicyEditorRule(index, { sortOrder: Number(event.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => removePolicyEditorRule(index)}
                    disabled={policyEditor.rules.length <= 1}
                    className="rounded-lg border border-rose-500/35 px-2 py-2 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addPolicyEditorRule}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              Add Rule
            </button>
            <button
              type="submit"
              disabled={isPolicyEditorSaving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {isPolicyEditorSaving ? "Saving..." : policyEditor.id ? "Update Profile" : "Create Profile"}
            </button>
            {policyEditor.id ? (
              <button
                type="button"
                onClick={resetPolicyEditor}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>

        {isPolicyLibraryLoading ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading policy library...</p>
        ) : policyLibrary.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No profiles available" description="Create your first policy profile to reuse rule bundles." />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {policyLibrary.map((policy) => (
              <div
                key={policy.id}
                className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {policy.name}
                      {policy.isSystem ? (
                        <span className="ml-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-700 dark:text-indigo-300">
                          system
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {policy.slug} · {policy._count?.assignments || 0} assignment{(policy._count?.assignments || 0) === 1 ? "" : "s"}
                    </p>
                    {policy.description ? (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{policy.description}</p>
                    ) : null}
                  </div>
                  {!policy.isSystem ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => editPolicyFromLibrary(policy)}
                        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deletePolicyProfile(policy.id)
                        }}
                        className="rounded-lg border border-rose-500/35 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>
    </div>
  )
}
