"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  Loader2,
  PackagePlus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react"
import type {
  ShipToolAccessRequestDto,
  ShipToolsStateDto,
  ToolImportRunDto,
} from "@/lib/tools/types"
import { isShipNotFoundApiError } from "@/lib/ships/errors"
import { asNotificationUpdatedPayload } from "@/lib/types/notifications"
import { useEventStream } from "@/lib/realtime/useEventStream"

interface ShipToolsPanelProps {
  shipDeploymentId: string | null
  shipName?: string
  className?: string
  compact?: boolean
  onShipNotFound?: (shipDeploymentId: string) => void | Promise<void>
}

interface NoticeState {
  type: "info" | "success" | "error"
  text: string
}

interface SubagentOption {
  id: string
  name: string
}

interface ApiResponseError extends Error {
  status?: number
  payload?: unknown
}

function asErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).error === "string") {
    const message = ((payload as Record<string, unknown>).error as string).trim()
    if (message.length > 0) {
      return message
    }
  }

  return fallback
}

function createApiResponseError(payload: unknown, status: number, fallback: string): ApiResponseError {
  const error = new Error(asErrorMessage(payload, fallback)) as ApiResponseError
  error.status = status
  error.payload = payload
  return error
}

function runStatusClass(status: ToolImportRunDto["status"]): string {
  if (status === "succeeded") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }

  if (status === "failed") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
  }

  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
}

function requestStatusClass(status: ShipToolAccessRequestDto["status"]): string {
  if (status === "approved") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  }

  if (status === "denied") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
}

function assignmentKey(bridgeCrewId: string, subagentId: string): string {
  return `${bridgeCrewId}:${subagentId}`
}

function serializeAssignmentDraft(value: Record<string, boolean>): string {
  return JSON.stringify(
    Object.keys(value)
      .filter((key) => value[key] === true)
      .sort((left, right) => left.localeCompare(right)),
  )
}

function draftFromAssignments(assignments: ShipToolsStateDto["subagentAssignments"]): Record<string, boolean> {
  const draft: Record<string, boolean> = {}
  for (const entry of assignments) {
    draft[assignmentKey(entry.bridgeCrewId, entry.subagentId)] = true
  }
  return draft
}

function governanceEventLabel(eventType: string): string {
  if (eventType === "ship_tool_grant_approved") return "Ship grant approved"
  if (eventType === "ship_tool_grant_revoked") return "Ship grant revoked"
  if (eventType === "subagent_tool_granted") return "Subagent tool granted"
  if (eventType === "subagent_tool_revoked") return "Subagent tool revoked"
  if (eventType === "tool_activation_approved") return "Tool activation approved"
  if (eventType === "tool_activation_denied") return "Tool activation denied"
  if (eventType === "skill_activation_approved") return "Skill activation approved"
  if (eventType === "skill_activation_denied") return "Skill activation denied"
  return eventType
}

export function ShipToolsPanel({
  shipDeploymentId,
  shipName,
  className,
  compact = false,
  onShipNotFound,
}: ShipToolsPanelProps) {
  const [state, setState] = useState<ShipToolsStateDto | null>(null)
  const [runs, setRuns] = useState<ToolImportRunDto[]>([])
  const [notice, setNotice] = useState<NoticeState | null>(null)

  const [isStateLoading, setIsStateLoading] = useState(false)
  const [isRunsLoading, setIsRunsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isImportingCurated, setIsImportingCurated] = useState(false)
  const [isImportingGithub, setIsImportingGithub] = useState(false)
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false)

  const [curatedToolSlug, setCuratedToolSlug] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [githubTokenOverride, setGithubTokenOverride] = useState("")

  const [requestCatalogEntryId, setRequestCatalogEntryId] = useState("")
  const [requestBridgeCrewId, setRequestBridgeCrewId] = useState("")
  const [requestScopePreference, setRequestScopePreference] = useState<"requester_only" | "ship">("requester_only")
  const [requestRationale, setRequestRationale] = useState("")
  const [actingBridgeCrewId, setActingBridgeCrewId] = useState("")
  const [grantRationale, setGrantRationale] = useState("")
  const [revokeReason, setRevokeReason] = useState("")
  const [reviewNote, setReviewNote] = useState("")
  const [reviewGrantModeByRequestId, setReviewGrantModeByRequestId] = useState<Record<string, "requester_only" | "ship">>({})
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, boolean>>({})
  const [assignmentSnapshot, setAssignmentSnapshot] = useState("[]")
  const [isAssignmentsSaving, setIsAssignmentsSaving] = useState(false)
  const [subagentOptions, setSubagentOptions] = useState<SubagentOption[]>([])
  const [isSubagentsLoading, setIsSubagentsLoading] = useState(false)
  const [activatingCatalogEntryIds, setActivatingCatalogEntryIds] = useState<Set<string>>(new Set())

  const [reviewingRequestIds, setReviewingRequestIds] = useState<Set<string>>(new Set())
  const [revokingGrantIds, setRevokingGrantIds] = useState<Set<string>>(new Set())
  const shipNotFoundNotifiedRef = useRef<Set<string>>(new Set())

  const handleShipNotFound = useCallback(
    async (error: unknown): Promise<boolean> => {
      if (!shipDeploymentId || !(error instanceof Error)) {
        return false
      }

      const status = typeof (error as ApiResponseError).status === "number"
        ? (error as ApiResponseError).status
        : undefined
      const payload = (error as ApiResponseError).payload
      if (!isShipNotFoundApiError(payload, status)) {
        return false
      }

      setNotice({
        type: "info",
        text: "Selected ship is no longer available. Refreshing ship selection.",
      })

      if (shipNotFoundNotifiedRef.current.has(shipDeploymentId)) {
        return true
      }

      shipNotFoundNotifiedRef.current.add(shipDeploymentId)
      try {
        await onShipNotFound?.(shipDeploymentId)
      } catch (callbackError) {
        console.error("Ship-not-found recovery callback failed for ShipToolsPanel:", callbackError)
      }

      return true
    },
    [onShipNotFound, shipDeploymentId],
  )

  const loadState = useCallback(async () => {
    if (!shipDeploymentId) {
      setState(null)
      return
    }

    setIsStateLoading(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/tools`, {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to load ship tools (${response.status})`)
      }

      const nextState = payload as ShipToolsStateDto
      setState(nextState)
      const nextAssignmentDraft = draftFromAssignments(nextState.subagentAssignments || [])
      setAssignmentDraft(nextAssignmentDraft)
      setAssignmentSnapshot(serializeAssignmentDraft(nextAssignmentDraft))
      setNotice(null)
    } catch (error) {
      if (await handleShipNotFound(error)) {
        setState(null)
        return
      }

      console.error("Failed to load ship tools state:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to load ship tools state.",
      })
      setState(null)
    } finally {
      setIsStateLoading(false)
    }
  }, [handleShipNotFound, shipDeploymentId])

  const loadRuns = useCallback(async () => {
    setIsRunsLoading(true)
    try {
      const response = await fetch("/api/tools/import-runs?limit=20", {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(asErrorMessage(payload, `Failed to load import history (${response.status})`))
      }

      const parsed = Array.isArray((payload as { runs?: unknown[] }).runs)
        ? ((payload as { runs?: ToolImportRunDto[] }).runs || [])
        : []
      setRuns(parsed)
    } catch (error) {
      console.error("Failed to load tool import runs:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to load tool import history.",
      })
      setRuns([])
    } finally {
      setIsRunsLoading(false)
    }
  }, [])

  const loadSubagents = useCallback(async () => {
    setIsSubagentsLoading(true)
    try {
      const response = await fetch("/api/subagents", {
        cache: "no-store",
      })
      const payload = await response.json().catch(() => ([]))
      if (!response.ok) {
        throw new Error(asErrorMessage(payload, `Failed to load subagents (${response.status})`))
      }

      const normalized = Array.isArray(payload)
        ? payload
            .filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string")
            .map((entry) => ({
              id: (entry as { id: string }).id,
              name: (entry as { name: string }).name,
            }))
            .sort((left, right) => left.name.localeCompare(right.name))
        : []

      setSubagentOptions(normalized)
    } catch (error) {
      console.error("Failed to load subagents for assignment matrix:", error)
      setSubagentOptions([])
    } finally {
      setIsSubagentsLoading(false)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([loadState(), loadRuns(), loadSubagents()])
    setIsRefreshing(false)
  }, [loadRuns, loadState, loadSubagents])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const curatedCandidates = useMemo(
    () => (state?.catalog || [])
      .filter((entry) => entry.source === "curated" && !entry.isInstalled)
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    [state?.catalog],
  )

  useEffect(() => {
    if (curatedToolSlug || curatedCandidates.length === 0) {
      return
    }

    setCuratedToolSlug(curatedCandidates[0].slug)
  }, [curatedCandidates, curatedToolSlug])

  const grantedCatalogEntryIds = useMemo(
    () => new Set((state?.grants || []).map((grant) => grant.catalogEntryId)),
    [state?.grants],
  )

  const requestableEntries = useMemo(
    () => (state?.catalog || [])
      .filter((entry) => entry.isInstalled && entry.activationStatus === "approved" && !grantedCatalogEntryIds.has(entry.id))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    [grantedCatalogEntryIds, state?.catalog],
  )

  useEffect(() => {
    if (requestCatalogEntryId || requestableEntries.length === 0) {
      return
    }

    setRequestCatalogEntryId(requestableEntries[0].id)
  }, [requestCatalogEntryId, requestableEntries])

  const pendingRequests = useMemo(
    () => (state?.requests || []).filter((request) => request.status === "pending"),
    [state?.requests],
  )

  const sortedGrants = useMemo(
    () => [...(state?.grants || [])].sort((left, right) => left.catalogEntry.slug.localeCompare(right.catalogEntry.slug)),
    [state?.grants],
  )

  const sortedCatalog = useMemo(
    () => [...(state?.catalog || [])].sort((left, right) => left.slug.localeCompare(right.slug)),
    [state?.catalog],
  )

  const assignmentDirty = useMemo(
    () => serializeAssignmentDraft(assignmentDraft) !== assignmentSnapshot,
    [assignmentDraft, assignmentSnapshot],
  )

  const importPayload = useMemo(
    () => ({
      ...(githubTokenOverride.trim().length > 0
        ? {
            githubTokenOverride: githubTokenOverride.trim(),
          }
        : {}),
    }),
    [githubTokenOverride],
  )

  const importCurated = async () => {
    const slug = curatedToolSlug.trim()
    if (!slug) {
      setNotice({ type: "error", text: "Select a curated tool to import." })
      return
    }

    setIsImportingCurated(true)
    setNotice(null)
    try {
      const response = await fetch("/api/tools/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "curated",
          toolSlug: slug,
          ...importPayload,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(asErrorMessage(payload, `Curated import failed (${response.status})`))
      }

      await Promise.all([loadState(), loadRuns()])
      setNotice({ type: "success", text: `Imported curated tool: ${slug}` })
    } catch (error) {
      console.error("Failed importing curated tool:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to import curated tool.",
      })
    } finally {
      setIsImportingCurated(false)
    }
  }

  const importGithub = async () => {
    const trimmedUrl = githubUrl.trim()
    if (!trimmedUrl) {
      setNotice({ type: "error", text: "Enter a GitHub URL to import." })
      return
    }

    setIsImportingGithub(true)
    setNotice(null)
    try {
      const response = await fetch("/api/tools/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "github_url",
          githubUrl: trimmedUrl,
          ...importPayload,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(asErrorMessage(payload, `GitHub import failed (${response.status})`))
      }

      setGithubUrl("")
      await Promise.all([loadState(), loadRuns()])
      setNotice({ type: "success", text: "Imported tool from GitHub URL." })
    } catch (error) {
      console.error("Failed importing tool from GitHub URL:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to import tool from GitHub URL.",
      })
    } finally {
      setIsImportingGithub(false)
    }
  }

  const fileRequest = async () => {
    if (!shipDeploymentId || !requestCatalogEntryId) {
      setNotice({ type: "error", text: "Select a tool before filing a request." })
      return
    }

    setIsSubmittingRequest(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/tools/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catalogEntryId: requestCatalogEntryId,
          requesterBridgeCrewId: requestBridgeCrewId || null,
          scopePreference: requestScopePreference,
          rationale: requestRationale.trim() || null,
          metadata: {
            source: "ship_tools_panel",
          },
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to file request (${response.status})`)
      }

      setRequestRationale("")
      await loadState()
      setNotice({ type: "success", text: "Tool request filed." })
    } catch (error) {
      if (await handleShipNotFound(error)) {
        return
      }

      console.error("Failed creating tool request:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to file tool request.",
      })
    } finally {
      setIsSubmittingRequest(false)
    }
  }

  const reviewRequest = async (
    requestId: string,
    decision: "approve" | "deny",
    grantMode?: "requester_only" | "ship",
  ) => {
    if (!shipDeploymentId) {
      return
    }

    setReviewingRequestIds((current) => new Set(current).add(requestId))
    setNotice(null)
    try {
      const trimmedGrantRationale = grantRationale.trim()
      if (decision === "approve" && !trimmedGrantRationale) {
        throw new Error("Provide grant rationale before approving.")
      }

      const response = await fetch(`/api/ships/${shipDeploymentId}/tools/requests/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          ...(decision === "approve" && grantMode
            ? {
                grantMode,
                grantRationale: trimmedGrantRationale,
              }
            : {}),
          ...(actingBridgeCrewId.trim()
            ? {
                actingBridgeCrewId: actingBridgeCrewId.trim(),
              }
            : {}),
          ...(reviewNote.trim()
            ? {
                reviewNote: reviewNote.trim(),
              }
            : {}),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to ${decision} request (${response.status})`)
      }

      await loadState()
      setNotice({
        type: "success",
        text: decision === "approve" ? "Request approved." : "Request denied.",
      })
    } catch (error) {
      if (await handleShipNotFound(error)) {
        return
      }

      console.error("Failed reviewing tool request:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to review tool request.",
      })
    } finally {
      setReviewingRequestIds((current) => {
        const next = new Set(current)
        next.delete(requestId)
        return next
      })
    }
  }

  const revokeGrant = async (grantId: string) => {
    if (!shipDeploymentId) {
      return
    }

    setRevokingGrantIds((current) => new Set(current).add(grantId))
    setNotice(null)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/tools/grants/${grantId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actingBridgeCrewId: actingBridgeCrewId.trim() || null,
          revokeReason: revokeReason.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to revoke grant (${response.status})`)
      }

      await loadState()
      setNotice({ type: "success", text: "Tool grant revoked." })
    } catch (error) {
      if (await handleShipNotFound(error)) {
        return
      }

      console.error("Failed revoking tool grant:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to revoke tool grant.",
      })
    } finally {
      setRevokingGrantIds((current) => {
        const next = new Set(current)
        next.delete(grantId)
        return next
      })
    }
  }

  const toggleAssignment = (bridgeCrewId: string, subagentId: string, enabled: boolean) => {
    const key = assignmentKey(bridgeCrewId, subagentId)
    setAssignmentDraft((current) => {
      if (enabled) {
        return {
          ...current,
          [key]: true,
        }
      }

      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const saveAssignments = async () => {
    if (!shipDeploymentId) {
      return
    }

    setIsAssignmentsSaving(true)
    setNotice(null)
    try {
      const assignments = Object.keys(assignmentDraft)
        .filter((key) => assignmentDraft[key] === true)
        .map((key) => {
          const [bridgeCrewId, subagentId] = key.split(":")
          return {
            bridgeCrewId,
            subagentId,
          }
        })
        .filter((entry) => entry.bridgeCrewId && entry.subagentId)

      const response = await fetch(`/api/ships/${shipDeploymentId}/tools/subagent-assignments`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignments,
          actingBridgeCrewId: actingBridgeCrewId.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw createApiResponseError(payload, response.status, `Failed to save assignments (${response.status})`)
      }

      await loadState()
      setNotice({ type: "success", text: "Bridge crew subagent assignments saved." })
    } catch (error) {
      if (await handleShipNotFound(error)) {
        return
      }

      console.error("Failed to save bridge crew subagent assignments:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save subagent assignments.",
      })
    } finally {
      setIsAssignmentsSaving(false)
    }
  }

  const decideToolActivation = async (entryId: string, decision: "approve" | "deny") => {
    setActivatingCatalogEntryIds((current) => new Set(current).add(entryId))
    setNotice(null)
    try {
      const trimmedRationale = grantRationale.trim()
      if (!trimmedRationale) {
        throw new Error("Provide a grant rationale before changing activation status.")
      }

      const response = await fetch(`/api/tools/catalog/${entryId}/activation`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision,
          rationale: trimmedRationale,
          actingBridgeCrewId: actingBridgeCrewId.trim() || null,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(asErrorMessage(payload, `Failed to ${decision} activation (${response.status})`))
      }

      await loadState()
      setNotice({
        type: "success",
        text: decision === "approve" ? "Tool activation approved." : "Tool activation denied.",
      })
    } catch (error) {
      console.error("Failed deciding tool activation:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to decide tool activation.",
      })
    } finally {
      setActivatingCatalogEntryIds((current) => {
        const next = new Set(current)
        next.delete(entryId)
        return next
      })
    }
  }

  const handleRealtimeNotification = useCallback((event: { type: string; payload: unknown }) => {
    if (event.type !== "notification.updated") {
      return
    }

    const payload = asNotificationUpdatedPayload(event.payload)
    if (!payload) {
      return
    }

    if (payload.channel !== "ship-yard" && payload.channel !== "ships") {
      return
    }

    void loadState()
  }, [loadState])

  useEventStream({
    enabled: Boolean(shipDeploymentId),
    types: ["notification.updated"],
    onEvent: handleRealtimeNotification,
  })

  if (!shipDeploymentId) {
    return (
      <div className={`rounded-xl border border-slate-300/70 bg-white/70 p-4 text-sm text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300 ${className || ""}`.trim()}>
        Select a ship to manage tools.
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-slate-300/70 bg-white/75 p-4 dark:border-white/12 dark:bg-white/[0.04] ${className || ""}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Ship Tool Governance</p>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {shipName || state?.ship.name || "Ship"}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={isRefreshing || isStateLoading || isRunsLoading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${(isRefreshing || isStateLoading || isRunsLoading) ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {notice && (
        <div className={`mt-3 rounded-md border px-3 py-2 text-xs ${
          notice.type === "error"
            ? "border-rose-400/45 bg-rose-500/10 text-rose-700 dark:text-rose-200"
            : notice.type === "success"
              ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              : "border-cyan-400/45 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200"
        }`}>
          {notice.text}
        </div>
      )}

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-5">
          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Acting Context</p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Owner can optionally act as XO/bridge crew for audited governance actions.
            </p>
            <div className="mt-2 space-y-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Acting bridge crew (optional)</span>
                <select
                  value={actingBridgeCrewId}
                  onChange={(event) => setActingBridgeCrewId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="">Owner direct</option>
                  {(state?.bridgeCrew || []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.callsign} ({member.role})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Grant rationale (required for approvals)</span>
                <textarea
                  value={grantRationale}
                  onChange={(event) => setGrantRationale(event.target.value)}
                  rows={2}
                  placeholder="Why access or activation is being approved"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Revoke reason (optional)</span>
                <input
                  type="text"
                  value={revokeReason}
                  onChange={(event) => setRevokeReason(event.target.value)}
                  placeholder="Why grant is being revoked"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Review note (optional)</span>
                <input
                  type="text"
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Optional decision note"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Import Tools</p>
            <div className="mt-2 space-y-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Curated tool</span>
                <select
                  value={curatedToolSlug}
                  onChange={(event) => setCuratedToolSlug(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  {curatedCandidates.length === 0 ? (
                    <option value="">No curated tools pending install</option>
                  ) : (
                    curatedCandidates.map((entry) => (
                      <option key={entry.id} value={entry.slug}>
                        {entry.slug}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={() => void importCurated()}
                disabled={isImportingCurated || curatedCandidates.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:border-white dark:bg-white dark:text-slate-900"
              >
                {isImportingCurated ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                {isImportingCurated ? "Importing..." : "Import Curated"}
              </button>

              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">GitHub URL</span>
                <input
                  type="text"
                  value={githubUrl}
                  onChange={(event) => setGithubUrl(event.target.value)}
                  placeholder="https://github.com/<owner>/<repo>/tree/<ref>/<path>"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">GitHub token override (optional)</span>
                <input
                  type="password"
                  value={githubTokenOverride}
                  onChange={(event) => setGithubTokenOverride(event.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>

              <button
                type="button"
                onClick={() => void importGithub()}
                disabled={isImportingGithub || githubUrl.trim().length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2.5 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
              >
                {isImportingGithub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                {isImportingGithub ? "Importing..." : "Import from GitHub URL"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">File Access Request</p>
            </div>

            <div className="mt-2 space-y-2">
              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Tool</span>
                <select
                  value={requestCatalogEntryId}
                  onChange={(event) => setRequestCatalogEntryId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  {requestableEntries.length === 0 ? (
                    <option value="">No installed tools pending grant</option>
                  ) : (
                    requestableEntries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.slug}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Requester bridge crew (optional)</span>
                <select
                  value={requestBridgeCrewId}
                  onChange={(event) => setRequestBridgeCrewId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="">None (operator-level request)</option>
                  {(state?.bridgeCrew || []).map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.callsign} ({member.role})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Scope preference</span>
                <select
                  value={requestScopePreference}
                  onChange={(event) => setRequestScopePreference(event.target.value as "requester_only" | "ship")}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  <option value="requester_only">Requester only</option>
                  <option value="ship">Ship-wide</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] text-slate-600 dark:text-slate-300">Rationale</span>
                <textarea
                  value={requestRationale}
                  onChange={(event) => setRequestRationale(event.target.value)}
                  rows={2}
                  placeholder="Why this tool is needed"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>

              <button
                type="button"
                onClick={() => void fileRequest()}
                disabled={isSubmittingRequest || requestableEntries.length === 0 || !requestCatalogEntryId}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2.5 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
              >
                {isSubmittingRequest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {isSubmittingRequest ? "Submitting..." : "File Tool Request"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 xl:col-span-7">
          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current Grants ({sortedGrants.length})</p>
            {isStateLoading ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading grants...
              </div>
            ) : sortedGrants.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">No grants yet.</p>
            ) : (
              <div className={`mt-2 space-y-2 ${compact ? "max-h-56 overflow-auto" : "max-h-80 overflow-auto"}`}>
                {sortedGrants.map((grant) => (
                  <div key={grant.id} className="rounded-md border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{grant.catalogEntry.slug}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {grant.scope === "ship"
                            ? "ship-wide"
                            : `bridge crew: ${grant.bridgeCrew?.callsign || grant.bridgeCrewId || "unknown"}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void revokeGrant(grant.id)}
                        disabled={revokingGrantIds.has(grant.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-700 disabled:opacity-50 dark:text-rose-200"
                      >
                        {revokingGrantIds.has(grant.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pending Requests ({pendingRequests.length})
            </p>
            {pendingRequests.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">No pending tool requests.</p>
            ) : (
              <div className={`mt-2 space-y-2 ${compact ? "max-h-56 overflow-auto" : "max-h-80 overflow-auto"}`}>
                {pendingRequests.map((request) => {
                  const reviewMode = reviewGrantModeByRequestId[request.id] || request.scopePreference
                  const isReviewing = reviewingRequestIds.has(request.id)

                  return (
                    <div key={request.id} className="rounded-md border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-100">{request.catalogEntry.slug}</p>
                          <p className="text-slate-500 dark:text-slate-400">
                            Requested by {request.requesterBridgeCrew?.callsign || "operator"} · preference {request.scopePreference}
                          </p>
                          {request.rationale ? <p className="mt-1 text-slate-600 dark:text-slate-300">{request.rationale}</p> : null}
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${requestStatusClass(request.status)}`}>
                          {request.status}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={reviewMode}
                          onChange={(event) => setReviewGrantModeByRequestId((current) => ({
                            ...current,
                            [request.id]: event.target.value as "requester_only" | "ship",
                          }))}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        >
                          <option value="requester_only" disabled={!request.requesterBridgeCrewId}>
                            requester only
                          </option>
                          <option value="ship">ship-wide</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => void reviewRequest(request.id, "approve", reviewMode)}
                          disabled={isReviewing || (reviewMode === "requester_only" && !request.requesterBridgeCrewId)}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/45 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-50 dark:text-emerald-200"
                        >
                          {isReviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Approve
                        </button>

                        <button
                          type="button"
                          onClick={() => void reviewRequest(request.id, "deny")}
                          disabled={isReviewing}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-700 disabled:opacity-50 dark:text-rose-200"
                        >
                          {isReviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          Deny
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Bridge Crew to Subagent Assignment Matrix
              </p>
              <button
                type="button"
                onClick={() => void saveAssignments()}
                disabled={isAssignmentsSaving || !assignmentDirty}
                className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-700 disabled:opacity-50 dark:text-cyan-200"
              >
                {isAssignmentsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {isAssignmentsSaving ? "Saving..." : "Save Assignments"}
              </button>
            </div>

            {isSubagentsLoading ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading subagents...
              </div>
            ) : (state?.bridgeCrew || []).length === 0 || subagentOptions.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Need at least one bridge crew member and one subagent to manage assignments.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-slate-300/70 px-2 py-1 text-left font-semibold text-slate-600 dark:border-white/15 dark:text-slate-300">
                        Bridge Crew
                      </th>
                      {subagentOptions.map((subagent) => (
                        <th
                          key={subagent.id}
                          className="border border-slate-300/70 px-2 py-1 text-left font-semibold text-slate-600 dark:border-white/15 dark:text-slate-300"
                        >
                          {subagent.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(state?.bridgeCrew || []).map((member) => (
                      <tr key={member.id}>
                        <td className="border border-slate-300/70 px-2 py-1 text-slate-700 dark:border-white/15 dark:text-slate-200">
                          {member.callsign}
                        </td>
                        {subagentOptions.map((subagent) => {
                          const key = assignmentKey(member.id, subagent.id)
                          const checked = assignmentDraft[key] === true
                          return (
                            <td key={key} className="border border-slate-300/70 px-2 py-1 text-center dark:border-white/15">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => toggleAssignment(member.id, subagent.id, event.target.checked)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Owner Catalog ({sortedCatalog.length})</p>
            <div className={`mt-2 space-y-2 ${compact ? "max-h-40 overflow-auto" : "max-h-56 overflow-auto"}`}>
              {sortedCatalog.length === 0 ? (
                <p className="text-xs text-slate-600 dark:text-slate-300">No tools in catalog yet.</p>
              ) : (
                sortedCatalog.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-slate-200/80 bg-white/90 px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{entry.slug}</p>
                      <div className="flex items-center gap-1">
                        <span className="rounded-full border border-slate-300/70 px-2 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                          {entry.source}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${entry.isInstalled ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-slate-300/70 text-slate-500 dark:border-white/15 dark:text-slate-400"}`}>
                          {entry.isInstalled ? "installed" : "not installed"}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            entry.activationStatus === "approved"
                              ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : entry.activationStatus === "pending"
                                ? "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : "border-rose-400/45 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          }`}
                        >
                          activation: {entry.activationStatus}
                        </span>
                      </div>
                    </div>
                    {entry.description ? <p className="mt-1 text-slate-600 dark:text-slate-300">{entry.description}</p> : null}
                    {entry.activationStatus !== "approved" ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void decideToolActivation(entry.id, "approve")}
                          disabled={activatingCatalogEntryIds.has(entry.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/45 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 disabled:opacity-50 dark:text-emerald-200"
                        >
                          {activatingCatalogEntryIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void decideToolActivation(entry.id, "deny")}
                          disabled={activatingCatalogEntryIds.has(entry.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-700 disabled:opacity-50 dark:text-rose-200"
                        >
                          {activatingCatalogEntryIds.has(entry.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          Deny
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Governance Events ({state?.governanceEvents.length || 0})
            </p>
            {(!state?.governanceEvents || state.governanceEvents.length === 0) ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">No governance events yet.</p>
            ) : (
              <div className={`mt-2 space-y-2 ${compact ? "max-h-44 overflow-auto" : "max-h-64 overflow-auto"}`}>
                {state.governanceEvents.map((event) => (
                  <div key={event.id} className="rounded-md border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{governanceEventLabel(event.eventType)}</p>
                    <p className="text-slate-500 dark:text-slate-400">{new Date(event.createdAt).toLocaleString()}</p>
                    {event.rationale ? (
                      <p className="mt-1 text-slate-600 dark:text-slate-300">{event.rationale}</p>
                    ) : null}
                    {event.securityReport ? (
                      <p className="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400">
                        Report: {event.securityReport.reportPathMd}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Import Runs</p>
            {isRunsLoading ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading import history...
              </div>
            ) : runs.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">No tool import runs yet.</p>
            ) : (
              <div className={`mt-2 space-y-2 ${compact ? "max-h-44 overflow-auto" : "max-h-56 overflow-auto"}`}>
                {runs.map((run) => (
                  <div key={run.id} className="rounded-md border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${runStatusClass(run.status)}`}>
                        {run.status}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">{run.mode}</span>
                      <span className="text-slate-500 dark:text-slate-400">{new Date(run.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{run.toolSlug || run.sourceUrl || "Unknown tool"}</p>
                    {run.errorMessage ? (
                      <p className="mt-1 text-rose-700 dark:text-rose-300">{run.errorMessage}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
