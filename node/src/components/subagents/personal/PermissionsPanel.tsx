"use client"

import Link from "next/link"
import { EmptyState, SurfaceCard } from "@/components/dashboard/PageLayout"
import type {
  AgentPermission,
  PermissionPolicy,
  PolicyAssignment,
} from "./types"

interface PermissionDraft {
  commandPattern: string
  type: "bash_command" | "tool_command"
  status: "allow" | "ask" | "deny"
  sourceFile: string
}

interface PermissionsPanelProps {
  readOnly: boolean
  quickPresetPolicies: PermissionPolicy[]
  attachablePolicies: PermissionPolicy[]
  policyAssignments: PolicyAssignment[]
  policyById: Map<string, PermissionPolicy>
  policyToAttachId: string
  onPolicyToAttachChange: (next: string) => void
  onAssignQuickPreset: (slug: string) => void
  onAttachPolicy: (policyId: string) => void
  onRemovePolicyAssignment: (policyId: string) => void
  onUpdatePolicyAssignment: (policyId: string, patch: Partial<PolicyAssignment>) => void
  onSavePolicyAssignments: () => void
  isPolicyAssignmentSaving: boolean
  policyAssignmentsDirty: boolean
  permissionDraft: PermissionDraft
  onPermissionDraftChange: (patch: Partial<PermissionDraft>) => void
  onCreatePermission: (event: React.FormEvent) => void
  isCreatingPermission: boolean
  isPermissionsLoading: boolean
  agentPermissions: AgentPermission[]
  onDeletePermission: (permissionId: string) => void
}

export function PermissionsPanel({
  readOnly,
  quickPresetPolicies,
  attachablePolicies,
  policyAssignments,
  policyById,
  policyToAttachId,
  onPolicyToAttachChange,
  onAssignQuickPreset,
  onAttachPolicy,
  onRemovePolicyAssignment,
  onUpdatePolicyAssignment,
  onSavePolicyAssignments,
  isPolicyAssignmentSaving,
  policyAssignmentsDirty,
  permissionDraft,
  onPermissionDraftChange,
  onCreatePermission,
  isCreatingPermission,
  isPermissionsLoading,
  agentPermissions,
  onDeletePermission,
}: PermissionsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assigned Profiles</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assign reusable policy profiles to this agent. Direct overrides still take precedence.
            </p>
          </div>
          {readOnly ? (
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
              Read-only
            </span>
          ) : null}
        </div>

        <div className="mt-3 rounded-lg border border-dashed border-slate-300/80 bg-slate-50/70 p-2 text-xs text-slate-600 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-300">
          Manage policy profile definitions in
          <Link href="/skills?tab=library" className="ml-1 font-medium text-cyan-700 underline dark:text-cyan-300">
            Skills / Policy Library
          </Link>
          .
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {quickPresetPolicies.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onAssignQuickPreset(preset.slug)}
              disabled={readOnly || isPolicyAssignmentSaving}
              className="w-full rounded-lg border border-cyan-500/35 px-3 py-1.5 text-xs text-cyan-700 hover:bg-cyan-500/10 disabled:opacity-50 sm:w-auto dark:text-cyan-300"
            >
              Quick preset: {preset.name}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select
            value={policyToAttachId}
            onChange={(event) => onPolicyToAttachChange(event.target.value)}
            disabled={readOnly || attachablePolicies.length === 0}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:max-w-xs dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">Attach profile...</option>
            {attachablePolicies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onAttachPolicy(policyToAttachId)}
            disabled={readOnly || !policyToAttachId}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
          >
            Attach
          </button>
        </div>

        {policyAssignments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No profiles assigned.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {policyAssignments
              .slice()
              .sort((left, right) => left.priority - right.priority)
              .map((assignment) => {
                const policy = policyById.get(assignment.policyId)
                if (!policy) {
                  return null
                }

                return (
                  <div
                    key={assignment.policyId}
                    className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{policy.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {policy.slug} · {policy.rules.length} rule{policy.rules.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemovePolicyAssignment(assignment.policyId)}
                        disabled={readOnly}
                        className="w-full rounded-lg border border-rose-500/35 px-2 py-1 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 sm:w-auto dark:text-rose-300"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <label className="text-xs text-slate-600 dark:text-slate-300">
                        Priority (lower runs first)
                        <input
                          type="number"
                          value={assignment.priority}
                          disabled={readOnly}
                          onChange={(event) =>
                            onUpdatePolicyAssignment(assignment.policyId, {
                              priority: Number(event.target.value) || 0,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </label>
                      <label className="inline-flex items-center justify-between rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200">
                        Enabled
                        <input
                          type="checkbox"
                          checked={assignment.enabled}
                          disabled={readOnly}
                          onChange={(event) =>
                            onUpdatePolicyAssignment(assignment.policyId, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                      </label>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {!readOnly ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onSavePolicyAssignments}
              disabled={isPolicyAssignmentSaving || !policyAssignmentsDirty}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 sm:w-auto dark:bg-white dark:text-slate-900"
            >
              {isPolicyAssignmentSaving ? "Saving..." : "Save Assigned Profiles"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent Overrides</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Direct rules that override assigned profiles for this agent.
        </p>

        {!readOnly ? (
          <form onSubmit={onCreatePermission} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              type="text"
              value={permissionDraft.commandPattern}
              onChange={(event) => onPermissionDraftChange({ commandPattern: event.target.value })}
              placeholder="bun run build:*"
              required
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-2 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <select
              value={permissionDraft.status}
              onChange={(event) => onPermissionDraftChange({ status: event.target.value as "allow" | "ask" | "deny" })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              <option value="allow">allow</option>
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </select>
            <select
              value={permissionDraft.type}
              onChange={(event) =>
                onPermissionDraftChange({ type: event.target.value as "bash_command" | "tool_command" })
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            >
              <option value="bash_command">bash_command</option>
              <option value="tool_command">tool_command</option>
            </select>
            <input
              type="text"
              value={permissionDraft.sourceFile}
              onChange={(event) => onPermissionDraftChange({ sourceFile: event.target.value })}
              placeholder="source file (optional)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 md:col-span-3 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={isCreatingPermission || !permissionDraft.commandPattern.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 md:w-auto dark:bg-white dark:text-slate-900"
            >
              {isCreatingPermission ? "Adding..." : "Add Override Rule"}
            </button>
          </form>
        ) : null}

        {isPermissionsLoading ? (
          <SurfaceCard className="mt-3">Loading override rules...</SurfaceCard>
        ) : agentPermissions.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No agent overrides"
              description="Add allow/ask/deny command patterns for direct agent precedence."
            />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {agentPermissions.map((permission) => (
              <div
                key={permission.id}
                className="rounded-lg border border-slate-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="break-all font-mono text-sm text-slate-900 dark:text-slate-100">{permission.commandPattern}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {permission.status} · {permission.type} · {permission.scope}
                    </p>
                  </div>
                  {!readOnly ? (
                    <button
                      type="button"
                      onClick={() => onDeletePermission(permission.id)}
                      className="w-full rounded-lg border border-rose-500/35 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-500/10 sm:w-auto dark:text-rose-300"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
                {permission.sourceFile ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Source: {permission.sourceFile}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
