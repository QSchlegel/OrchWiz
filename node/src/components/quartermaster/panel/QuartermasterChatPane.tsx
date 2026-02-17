"use client"

import Link from "next/link"
import { Loader2, RefreshCw } from "lucide-react"
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react"

interface QuartermasterInteraction {
  id: string
  type: "user_input" | "ai_response" | "tool_use" | "error"
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

interface QuartermasterLoopRunSummary {
  iterationCount: number
  loopDefaults: {
    maxIterations: number
  }
}

interface FallbackProviderError {
  provider: string
  code: string
  message: string
}

interface FallbackDiagnostics {
  active: boolean
  provider: string
  reason: string
  providerErrors: FallbackProviderError[]
}

interface QuartermasterChatPaneProps {
  interactions: QuartermasterInteraction[]
  isSending: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onPromptKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  sendDisabled: boolean
  chatLogRef: RefObject<HTMLDivElement | null>
  compact: boolean
  activeLoopRun: QuartermasterLoopRunSummary | null
  activeLoopElapsedSeconds: number
  formatDurationSeconds: (seconds: number) => string
  onRetryLastPrompt: () => void
  onRefreshConnector: () => void
  isConnectorRefreshing: boolean
}

function interactionLabel(type: QuartermasterInteraction["type"]): string {
  if (type === "user_input") return "Operator"
  if (type === "ai_response") return "Quartermaster"
  if (type === "tool_use") return "Tool"
  return "Error"
}

function formatInteractionTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function extractFallbackDiagnostics(metadata: Record<string, unknown> | undefined): FallbackDiagnostics | null {
  if (!metadata || typeof metadata !== "object") {
    return null
  }

  const fallback = metadata.fallback
  if (!fallback || typeof fallback !== "object") {
    return null
  }

  const record = fallback as Record<string, unknown>
  if (record.active !== true) {
    return null
  }

  const providerErrors = Array.isArray(record.providerErrors)
    ? record.providerErrors
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null
        }
        const detail = entry as Record<string, unknown>
        const provider = asString(detail.provider)
        const code = asString(detail.code)
        const message = asString(detail.message)
        if (!provider || !code || !message) {
          return null
        }
        return { provider, code, message }
      })
      .filter((entry): entry is FallbackProviderError => Boolean(entry))
    : []

  return {
    active: true,
    provider: asString(record.provider) || "local-fallback",
    reason: asString(record.reason) || "Provider chain did not return a result.",
    providerErrors,
  }
}

export function QuartermasterChatPane(props: QuartermasterChatPaneProps) {
  const {
    interactions,
    isSending,
    prompt,
    onPromptChange,
    onPromptKeyDown,
    onSend,
    sendDisabled,
    chatLogRef,
    compact,
    activeLoopRun,
    activeLoopElapsedSeconds,
    formatDurationSeconds,
    onRetryLastPrompt,
    onRefreshConnector,
    isConnectorRefreshing,
  } = props

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-300/70 bg-white/80 dark:border-white/12 dark:bg-white/[0.03]">
      <div
        ref={chatLogRef}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {interactions.length === 0 && !isSending ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">No Quartermaster interactions yet.</p>
        ) : (
          <div className="space-y-3">
            {interactions.map((interaction) => {
              const isOperator = interaction.type === "user_input"
              const fallbackDiagnostics = interaction.type === "ai_response"
                ? extractFallbackDiagnostics(interaction.metadata)
                : null

              return (
                <article
                  key={interaction.id}
                  className={`max-w-[94%] rounded-xl border px-3 py-2.5 ${
                    isOperator
                      ? "ml-auto border-cyan-300/45 bg-cyan-500/15 text-cyan-950 dark:text-cyan-50"
                      : "mr-auto border-slate-200/80 bg-white text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className={`rounded-md border px-1.5 py-0.5 font-medium uppercase tracking-wide ${
                      isOperator
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-100"
                        : "border-slate-300/70 text-slate-600 dark:border-white/15 dark:text-slate-300"
                    }`}>
                      {interactionLabel(interaction.type)}
                    </span>
                    <time title={new Date(interaction.timestamp).toISOString()}>
                      {formatInteractionTimestamp(interaction.timestamp)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{interaction.content}</p>

                  {fallbackDiagnostics && (
                    <div className="mt-2 rounded-md border border-amber-400/45 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-100">
                      <p className="font-medium">Runtime fallback in effect</p>
                      <p className="mt-0.5">{fallbackDiagnostics.reason}</p>
                      <details className="mt-2">
                        <summary className="cursor-pointer font-medium">Diagnostics</summary>
                        <div className="mt-1 space-y-1">
                          <p>
                            Provider: <code>{fallbackDiagnostics.provider}</code>
                          </p>
                          {fallbackDiagnostics.providerErrors.length > 0 ? (
                            <ul className="list-disc space-y-0.5 pl-4">
                              {fallbackDiagnostics.providerErrors.map((detail, index) => (
                                <li key={`${detail.provider}:${detail.code}:${index}`}>
                                  <code>{detail.provider}</code> · <code>{detail.code}</code> · {detail.message}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>No provider diagnostics were attached.</p>
                          )}
                        </div>
                      </details>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={onRetryLastPrompt}
                          className="rounded-md border border-amber-500/45 bg-amber-500/15 px-2 py-1 font-medium"
                        >
                          Retry Last Prompt
                        </button>
                        <button
                          type="button"
                          onClick={onRefreshConnector}
                          disabled={isConnectorRefreshing}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-500/45 bg-amber-500/15 px-2 py-1 font-medium disabled:opacity-60"
                        >
                          {isConnectorRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Refresh Connector
                        </button>
                        <Link
                          href="/settings"
                          className="rounded-md border border-amber-500/45 bg-amber-500/15 px-2 py-1 font-medium"
                        >
                          Open Settings
                        </Link>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
            {isSending && (
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200/80 bg-white/90 px-2 py-1.5 text-[11px] text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Quartermaster is responding...
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-300/70 bg-white/85 p-3 dark:border-white/12 dark:bg-slate-950/35">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          <span className={`rounded-md border px-2 py-1 ${
            activeLoopRun
              ? "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              : "border-slate-300/70 text-slate-600 dark:border-white/15 dark:text-slate-300"
          }`}>
            Self Loop: {activeLoopRun ? "Running" : "Idle"}
          </span>
          {activeLoopRun && (
            <span className="rounded-md border border-slate-300/70 px-2 py-1 text-slate-600 dark:border-white/15 dark:text-slate-300">
              {activeLoopRun.iterationCount}/{activeLoopRun.loopDefaults.maxIterations} · {formatDurationSeconds(activeLoopElapsedSeconds)}
            </span>
          )}
        </div>

        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={onPromptKeyDown}
          rows={compact ? 2 : 3}
          placeholder="Ask Quartermaster about setup or ship maintenance diagnostics..."
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Enter sends · Cmd/Ctrl+Enter starts self loop · Shift+Enter adds a new line
          </p>
          <button
            type="button"
            onClick={onSend}
            disabled={sendDisabled}
            className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
          >
            {isSending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Ask Quartermaster
          </button>
        </div>
      </div>
    </div>
  )
}
