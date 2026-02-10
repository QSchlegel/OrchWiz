"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSession } from "@/lib/auth-client"
import { EmptyState, FilterBar, InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"

interface PermissionPolicyRule {
  id?: string
  commandPattern: string
  type: "bash_command" | "tool_command"
  status: "allow" | "ask" | "deny"
  sortOrder: number
}

interface Skill {
  id: string
  slug: string
  name: string
  description: string | null
  isSystem: boolean
  ownerUserId: string | null
  rules: PermissionPolicyRule[]
  _count?: {
    assignments: number
  }
}

interface Subagent {
  id: string
  name: string
  description: string | null
  isShared: boolean
  ownerUserId: string | null
}

interface PolicySubagentAssignment {
  subagentId: string
  policyId: string
  priority: number
  enabled: boolean
}

function toSnapshot(ids: string[]): string {
  return JSON.stringify([...new Set(ids)].sort())
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

export function SkillsPolicyAssignmentsTab() {
  const { data: session } = useSession()
  const currentUserId = (session?.user as { id?: string } | undefined)?.id || ""

  const [skills, setSkills] = useState<Skill[]>([])
  const [subagents, setSubagents] = useState<Subagent[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [selectedSubagentIds, setSelectedSubagentIds] = useState<string[]>([])
  const [selectedSnapshot, setSelectedSnapshot] = useState("[]")
  const [skillSearch, setSkillSearch] = useState("")
  const [agentSearch, setAgentSearch] = useState("")
  const [isSkillsLoading, setIsSkillsLoading] = useState(true)
  const [isSubagentsLoading, setIsSubagentsLoading] = useState(true)
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false)
  const [isSavingAssignments, setIsSavingAssignments] = useState(false)
  const [notice, setNotice] = useState<{ type: "info" | "success" | "error"; text: string } | null>(null)

  const loadSkills = useCallback(async () => {
    setIsSkillsLoading(true)
    try {
      const response = await fetch("/api/permission-policies", { cache: "no-store" })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const normalized = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.id === "string")
            .map((entry: any) => ({
              id: entry.id,
              slug: typeof entry.slug === "string" ? entry.slug : "",
              name: typeof entry.name === "string" ? entry.name : "Unnamed skill",
              description: typeof entry.description === "string" ? entry.description : null,
              isSystem: Boolean(entry.isSystem),
              ownerUserId: typeof entry.ownerUserId === "string" ? entry.ownerUserId : null,
              rules: Array.isArray(entry.rules)
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
              _count: {
                assignments: Number(entry?._count?.assignments) || 0,
              },
            }))
            .sort((left: Skill, right: Skill) => {
              if (left.isSystem !== right.isSystem) {
                return left.isSystem ? -1 : 1
              }
              return left.name.localeCompare(right.name)
            })
        : []

      setSkills(normalized)
    } catch (error) {
      console.error("Failed to load skills:", error)
      setNotice({ type: "error", text: "Unable to load skills." })
    } finally {
      setIsSkillsLoading(false)
    }
  }, [])

  const loadSubagents = useCallback(async () => {
    setIsSubagentsLoading(true)
    try {
      const response = await fetch("/api/subagents", { cache: "no-store" })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const normalized = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.id === "string")
            .map((entry: any) => ({
              id: entry.id,
              name: typeof entry.name === "string" ? entry.name : "Unnamed agent",
              description: typeof entry.description === "string" ? entry.description : null,
              isShared: Boolean(entry.isShared),
              ownerUserId: typeof entry.ownerUserId === "string" ? entry.ownerUserId : null,
            }))
        : []

      setSubagents(normalized)
    } catch (error) {
      console.error("Failed to load subagents:", error)
      setNotice({ type: "error", text: "Unable to load agents." })
    } finally {
      setIsSubagentsLoading(false)
    }
  }, [])

  const loadAssignments = useCallback(async (policyId: string) => {
    setIsAssignmentsLoading(true)
    try {
      const response = await fetch(`/api/permission-policies/${policyId}/subagents`, {
        cache: "no-store",
      })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        setSelectedSubagentIds([])
        setSelectedSnapshot("[]")
        return
      }

      const payload = await response.json()
      const assignments: PolicySubagentAssignment[] = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.subagentId === "string")
            .map((entry: any) => ({
              subagentId: entry.subagentId,
              policyId: typeof entry.policyId === "string" ? entry.policyId : policyId,
              priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 100,
              enabled: entry.enabled !== false,
            }))
        : []

      const enabledSubagentIds = assignments
        .filter((assignment) => assignment.enabled)
        .map((assignment) => assignment.subagentId)

      setSelectedSubagentIds(enabledSubagentIds)
      setSelectedSnapshot(toSnapshot(enabledSubagentIds))
    } catch (error) {
      console.error("Failed to load policy assignments:", error)
      setNotice({ type: "error", text: "Unable to load allowed agents for this skill." })
      setSelectedSubagentIds([])
      setSelectedSnapshot("[]")
    } finally {
      setIsAssignmentsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSkills()
    void loadSubagents()
  }, [loadSkills, loadSubagents])

  useEffect(() => {
    if (skills.length === 0) {
      setSelectedSkillId(null)
      return
    }

    if (selectedSkillId && skills.some((skill) => skill.id === selectedSkillId)) {
      return
    }

    setSelectedSkillId(skills[0].id)
  }, [selectedSkillId, skills])

  useEffect(() => {
    if (!selectedSkillId) {
      setSelectedSubagentIds([])
      setSelectedSnapshot("[]")
      return
    }

    void loadAssignments(selectedSkillId)
  }, [loadAssignments, selectedSkillId])

  const personalSubagents = useMemo(
    () =>
      subagents
        .filter((subagent) => {
          if (subagent.isShared) {
            return false
          }

          if (currentUserId) {
            return subagent.ownerUserId === currentUserId
          }

          return Boolean(subagent.ownerUserId)
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentUserId, subagents],
  )

  const personalSubagentIdSet = useMemo(
    () => new Set(personalSubagents.map((subagent) => subagent.id)),
    [personalSubagents],
  )

  useEffect(() => {
    setSelectedSubagentIds((current) => current.filter((id) => personalSubagentIdSet.has(id)))
  }, [personalSubagentIdSet])

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) || null,
    [selectedSkillId, skills],
  )

  const filteredSkills = useMemo(() => {
    const query = skillSearch.trim().toLowerCase()
    if (!query) {
      return skills
    }

    return skills.filter((skill) =>
      `${skill.name} ${skill.slug} ${skill.description || ""}`.toLowerCase().includes(query),
    )
  }, [skillSearch, skills])

  const filteredSubagents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase()
    if (!query) {
      return personalSubagents
    }

    return personalSubagents.filter((subagent) =>
      `${subagent.name} ${subagent.description || ""}`.toLowerCase().includes(query),
    )
  }, [agentSearch, personalSubagents])

  const selectedSubagentSet = useMemo(() => new Set(selectedSubagentIds), [selectedSubagentIds])
  const selectedPersonalCount = useMemo(
    () => selectedSubagentIds.filter((id) => personalSubagentIdSet.has(id)).length,
    [personalSubagentIdSet, selectedSubagentIds],
  )
  const assignmentsDirty = useMemo(
    () => toSnapshot(selectedSubagentIds) !== selectedSnapshot,
    [selectedSnapshot, selectedSubagentIds],
  )

  const toggleSubagent = (subagentId: string) => {
    setSelectedSubagentIds((current) => {
      if (current.includes(subagentId)) {
        return current.filter((id) => id !== subagentId)
      }
      return [...current, subagentId]
    })
  }

  const selectAllAgents = () => {
    setSelectedSubagentIds(personalSubagents.map((subagent) => subagent.id))
  }

  const clearAllAgents = () => {
    setSelectedSubagentIds([])
  }

  const saveAssignments = async () => {
    if (!selectedSkill) {
      return
    }

    setIsSavingAssignments(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/permission-policies/${selectedSkill.id}/subagents`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subagentIds: selectedSubagentIds,
        }),
      })
      if (!response.ok) {
        setNotice({ type: "error", text: await readApiError(response) })
        return
      }

      const payload = await response.json()
      const enabledSubagentIds = Array.isArray(payload)
        ? payload
            .filter((entry: any) => entry && typeof entry.subagentId === "string" && entry.enabled !== false)
            .map((entry: any) => entry.subagentId)
        : []

      setSelectedSubagentIds(enabledSubagentIds)
      setSelectedSnapshot(toSnapshot(enabledSubagentIds))
      setNotice({ type: "success", text: "Allowed agents updated for this skill." })
      await loadSkills()
    } catch (error) {
      console.error("Failed to save policy assignments:", error)
      setNotice({ type: "error", text: "Unable to save allowed agents." })
    } finally {
      setIsSavingAssignments(false)
    }
  }

  return (
    <div className="space-y-4">
      {notice ? <InlineNotice variant={notice.type}>{notice.text}</InlineNotice> : null}

      <FilterBar>
        <input
          type="text"
          value={skillSearch}
          onChange={(event) => setSkillSearch(event.target.value)}
          placeholder="Search skills..."
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        />
        <input
          type="text"
          value={agentSearch}
          onChange={(event) => setAgentSearch(event.target.value)}
          placeholder="Search personal agents..."
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        />
      </FilterBar>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SurfaceCard className="lg:col-span-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">Available skills</h2>

          {isSkillsLoading ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading skills...</p>
          ) : filteredSkills.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No skills found" description="Create or search for a different permission profile." />
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {filteredSkills.map((skill) => {
                const isSelected = skill.id === selectedSkillId
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => {
                      setSelectedSkillId(skill.id)
                      setNotice(null)
                    }}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? "border-cyan-500/45 bg-cyan-500/10"
                        : "border-slate-300/70 bg-white/80 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {skill.name}
                      {skill.isSystem ? (
                        <span className="ml-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
                          system
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{skill.slug}</p>
                    {skill.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{skill.description}</p>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard className="space-y-4 lg:col-span-8">
          {!selectedSkill ? (
            <EmptyState title="Select a skill" description="Choose a skill to manage which personal agents can use it." />
          ) : (
            <>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedSkill.name}</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedSkill.slug} · {selectedSkill.rules.length} rule{selectedSkill.rules.length === 1 ? "" : "s"} ·{" "}
                  {selectedSkill._count?.assignments || 0} assignment{(selectedSkill._count?.assignments || 0) === 1 ? "" : "s"}
                </p>
                {selectedSkill.description ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selectedSkill.description}</p>
                ) : null}
              </div>

              {selectedSkill.isSystem ? (
                <InlineNotice variant="info">
                  System skill rules are read-only. Agent assignment controls below are still editable.
                </InlineNotice>
              ) : null}

              <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Allowed Agents</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Select personal agents that can use this skill. Saving applies an authoritative set for your personal agents.
                </p>

                {isSubagentsLoading || isAssignmentsLoading ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading agent assignments...</p>
                ) : personalSubagents.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      title="No personal agents found"
                      description="Create personal agents first, then return to assign this skill."
                    />
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllAgents}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={clearAllAgents}
                        className="rounded-lg border border-rose-500/35 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-500/10 dark:text-rose-300"
                      >
                        Clear all
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedPersonalCount} of {personalSubagents.length} selected
                      </span>
                    </div>

                    {filteredSubagents.length === 0 ? (
                      <EmptyState title="No matching agents" description="Adjust your search to find a personal agent." />
                    ) : (
                      <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                        {filteredSubagents.map((subagent) => (
                          <label
                            key={subagent.id}
                            className="flex items-start gap-3 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
                          >
                            <input
                              type="checkbox"
                              checked={selectedSubagentSet.has(subagent.id)}
                              onChange={() => toggleSubagent(subagent.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{subagent.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {subagent.description || "No description"}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    <div>
                      <button
                        type="button"
                        onClick={() => void saveAssignments()}
                        disabled={isSavingAssignments || !assignmentsDirty}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                      >
                        {isSavingAssignments ? "Saving..." : "Save Allowed Agents"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SurfaceCard>
      </div>
    </div>
  )
}
