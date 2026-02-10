"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, ShieldCheck, Wrench } from "lucide-react"
import { useEventStream } from "@/lib/realtime/useEventStream"

interface QuartermasterInteraction {
  id: string
  type: "user_input" | "ai_response" | "tool_use" | "error"
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

interface QuartermasterStatePayload {
  ship: {
    id: string
    name: string
    status: string
    nodeId: string
    nodeType: string
    deploymentProfile: string
    healthStatus: string | null
    lastHealthCheck: string | null
    updatedAt: string
  }
  quartermaster: {
    enabled: boolean
    roleKey: string
    callsign: string
    authority: string
    runtimeProfile: string
    diagnosticsScope: string
    channel: string
    policySlug: string
    subagentId: string | null
    sessionId: string | null
    provisionedAt: string | null
  }
  subagent: {
    id: string
    name: string
    description: string | null
  } | null
  session: {
    id: string
    title: string | null
    status: string
    updatedAt: string
    createdAt: string
  } | null
  interactions: QuartermasterInteraction[]
}

interface ShipQuartermasterPanelProps {
  shipDeploymentId: string | null
  shipName?: string
  className?: string
  compact?: boolean
}

function providerFromInteraction(interaction: QuartermasterInteraction | null): {
  provider: string | null
  fallbackUsed: boolean | null
} {
  if (!interaction?.metadata || typeof interaction.metadata !== "object") {
    return { provider: null, fallbackUsed: null }
  }

  const metadata = interaction.metadata as Record<string, unknown>
  const provider = typeof metadata.provider === "string" ? metadata.provider : null
  const fallbackUsed = typeof metadata.fallbackUsed === "boolean" ? metadata.fallbackUsed : null

  return { provider, fallbackUsed }
}

function interactionLabel(type: QuartermasterInteraction["type"]): string {
  if (type === "user_input") return "Operator"
  if (type === "ai_response") return "Quartermaster"
  if (type === "tool_use") return "Tool"
  return "Error"
}

export function ShipQuartermasterPanel({
  shipDeploymentId,
  shipName,
  className,
  compact = false,
}: ShipQuartermasterPanelProps) {
  const [state, setState] = useState<QuartermasterStatePayload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isProvisioning, setIsProvisioning] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    if (!shipDeploymentId) {
      setState(null)
      setError(null)
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setState(payload as QuartermasterStatePayload)
      setError(null)
    } catch (loadError) {
      console.error("Failed to load quartermaster state:", loadError)
      setState(null)
      setError(loadError instanceof Error ? loadError.message : "Failed to load quartermaster state")
    } finally {
      setIsLoading(false)
    }
  }, [shipDeploymentId])

  useEffect(() => {
    void fetchState()
  }, [fetchState])

  useEventStream({
    enabled: Boolean(state?.session?.id),
    types: ["session.prompted"],
    onEvent: (event) => {
      const payload = event.payload as { sessionId?: string }
      if (payload?.sessionId && payload.sessionId === state?.session?.id) {
        void fetchState()
      }
    },
  })

  const latestAiInteraction = useMemo(() => {
    if (!state) {
      return null
    }

    for (let i = state.interactions.length - 1; i >= 0; i -= 1) {
      if (state.interactions[i].type === "ai_response") {
        return state.interactions[i]
      }
    }

    return null
  }, [state])

  const providerState = providerFromInteraction(latestAiInteraction)

  const handleProvision = async () => {
    if (!shipDeploymentId || isProvisioning) {
      return
    }

    setIsProvisioning(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster/provision`, {
        method: "POST",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      await fetchState()
      setError(null)
    } catch (provisionError) {
      console.error("Quartermaster provisioning failed:", provisionError)
      setError(provisionError instanceof Error ? provisionError.message : "Failed to enable Quartermaster")
    } finally {
      setIsProvisioning(false)
    }
  }

  const handleSend = async () => {
    if (!shipDeploymentId || !prompt.trim() || isSending) {
      return
    }

    setIsSending(true)
    try {
      const response = await fetch(`/api/ships/${shipDeploymentId}/quartermaster`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      setPrompt("")
      if (Array.isArray(payload?.interactions)) {
        setState((current) => {
          if (!current) return current
          return {
            ...current,
            interactions: payload.interactions as QuartermasterInteraction[],
          }
        })
      } else {
        await fetchState()
      }
      setError(null)
    } catch (sendError) {
      console.error("Quartermaster prompt failed:", sendError)
      setError(sendError instanceof Error ? sendError.message : "Failed to submit prompt")
    } finally {
      setIsSending(false)
    }
  }

  if (!shipDeploymentId) {
    return (
      <div className={`rounded-xl border border-slate-300/70 bg-white/70 p-4 text-sm text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300 ${className || ""}`.trim()}>
        Select a ship to access Quartermaster.
      </div>
    )
  }

  return (
    <div className={`rounded-xl border border-slate-300/70 bg-white/75 p-4 dark:border-white/12 dark:bg-white/[0.04] ${className || ""}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Ship Quartermaster</p>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {state?.quartermaster.callsign || "QTM-LGR"} · {shipName || state?.ship.name || "Ship"}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-md border px-2 py-1 ${state?.quartermaster.enabled ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200"}`}>
            {state?.quartermaster.enabled ? "Enabled" : "Manual Enable"}
          </span>
          {providerState.provider && (
            <span className="rounded-md border border-cyan-400/45 bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-200">
              Provider: {providerState.provider}
            </span>
          )}
          {providerState.fallbackUsed === true && (
            <span className="rounded-md border border-orange-400/45 bg-orange-500/10 px-2 py-1 text-orange-700 dark:text-orange-200">
              Fallback
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
          <ShieldCheck className="h-3 w-3" />
          {state?.quartermaster.authority || "scoped_operator"}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/12">
          <Wrench className="h-3 w-3" />
          {state?.quartermaster.diagnosticsScope || "read_only"}
        </span>
      </div>

      {isLoading ? (
        <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Quartermaster state...
        </div>
      ) : state && !state.quartermaster.enabled ? (
        <div className="mt-3 rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03]">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Quartermaster is not enabled for this ship yet.
          </p>
          <button
            type="button"
            onClick={handleProvision}
            disabled={isProvisioning}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
          >
            {isProvisioning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enable Quartermaster
          </button>
        </div>
      ) : state ? (
        <>
          <div className={`mt-3 overflow-y-auto rounded-lg border border-slate-300/70 bg-white/80 p-3 dark:border-white/12 dark:bg-white/[0.03] ${compact ? "max-h-48" : "max-h-72"}`}>
            {state.interactions.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">No Quartermaster interactions yet.</p>
            ) : (
              <div className="space-y-2">
                {state.interactions.map((interaction) => (
                  <div key={interaction.id} className="rounded-md border border-slate-200/80 bg-white/90 p-2 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{interactionLabel(interaction.type)}</span>
                      <span>{new Date(interaction.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                      {interaction.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={compact ? 2 : 3}
              placeholder="Ask Quartermaster about setup or ship maintenance diagnostics..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSend}
                disabled={!prompt.trim() || isSending}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
              >
                {isSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ask Quartermaster
              </button>
            </div>
          </div>
        </>
      ) : null}

      {error && (
        <div className="mt-3 rounded-md border border-rose-400/45 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}
    </div>
  )
}
