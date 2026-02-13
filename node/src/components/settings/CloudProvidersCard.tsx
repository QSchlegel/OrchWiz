"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Cloud, ExternalLink, Loader2, RefreshCw } from "lucide-react"
import { buildUiError, isWalletEnclaveCode, walletEnclaveGuidance } from "@/lib/api-errors"
import { SurfaceCard } from "@/components/dashboard/PageLayout"

type ProviderId = "hetzner" | "aws" | "gcp" | "azure"

interface CredentialStatusResponse {
  configured?: boolean
  credential?: {
    updatedAt?: string
  }
  error?: string
  code?: string
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

export function CloudProvidersCard() {
  const providers = useMemo(
    () =>
      [
        {
          id: "hetzner" as const,
          name: "Hetzner Cloud",
          hint: "Supported for Ship Yard cloud clusters.",
          badge: "H",
          badgeClassName: "bg-cyan-500/10 text-cyan-800 dark:text-cyan-200 border-cyan-500/25",
          supported: true,
        },
        {
          id: "aws" as const,
          name: "AWS",
          hint: "Coming soon.",
          badge: "AWS",
          badgeClassName: "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/25",
          supported: false,
        },
        {
          id: "gcp" as const,
          name: "Google Cloud",
          hint: "Coming soon.",
          badge: "GCP",
          badgeClassName: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/25",
          supported: false,
        },
        {
          id: "azure" as const,
          name: "Azure",
          hint: "Coming soon.",
          badge: "AZ",
          badgeClassName: "bg-sky-500/10 text-sky-800 dark:text-sky-200 border-sky-500/25",
          supported: false,
        },
      ] satisfies Array<{
        id: ProviderId
        name: string
        hint: string
        badge: string
        badgeClassName: string
        supported: boolean
      }>,
    [],
  )

  const [selectedProvider, setSelectedProvider] = useState<ProviderId>("hetzner")
  const [isLoading, setIsLoading] = useState(false)
  const [hetznerConfigured, setHetznerConfigured] = useState(false)
  const [hetznerUpdatedAt, setHetznerUpdatedAt] = useState<string | null>(null)
  const [hetznerTokenInput, setHetznerTokenInput] = useState("")
  const [message, setMessage] = useState<{
    type: "info" | "success" | "error"
    text: string
    code?: string | null
    suggestedCommands?: string[]
  } | null>(null)

  const loadHetznerCredentialStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/credentials", {
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => ({}))) as CredentialStatusResponse
      if (!response.ok) {
        const ui = buildUiError(payload, response.status, "Unable to load Hetzner credential status.")
        setMessage({
          type: "error",
          text: ui.text,
          code: ui.code,
          ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
            ? { suggestedCommands: ui.suggestedCommands }
            : {}),
        })
        setHetznerConfigured(false)
        setHetznerUpdatedAt(null)
        return
      }

      setHetznerConfigured(Boolean(payload.configured))
      setHetznerUpdatedAt(payload.credential?.updatedAt || null)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to load Hetzner credential status.",
      })
      setHetznerConfigured(false)
      setHetznerUpdatedAt(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const saveHetznerToken = useCallback(async () => {
    const token = hetznerTokenInput.trim()
    if (!token) return

    setIsLoading(true)
    try {
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/credentials", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      })
      const payload = (await response.json().catch(() => ({}))) as CredentialStatusResponse

      if (!response.ok) {
        const ui = buildUiError(payload, response.status, "Unable to save Hetzner API token.")
        setMessage({
          type: "error",
          text: ui.text,
          code: ui.code,
          ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
            ? { suggestedCommands: ui.suggestedCommands }
            : {}),
        })
        return
      }

      setHetznerTokenInput("")
      setHetznerConfigured(true)
      setHetznerUpdatedAt(payload.credential?.updatedAt || null)
      setMessage({ type: "success", text: "Hetzner API token saved." })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Hetzner API token.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [hetznerTokenInput])

  const removeHetznerToken = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/credentials", {
        method: "DELETE",
      })
      const payload = (await response.json().catch(() => ({}))) as CredentialStatusResponse

      if (!response.ok) {
        const ui = buildUiError(payload, response.status, "Unable to remove Hetzner API token.")
        setMessage({
          type: "error",
          text: ui.text,
          code: ui.code,
          ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
            ? { suggestedCommands: ui.suggestedCommands }
            : {}),
        })
        return
      }

      setHetznerTokenInput("")
      setHetznerConfigured(false)
      setHetznerUpdatedAt(null)
      setMessage({ type: "success", text: "Hetzner API token removed." })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to remove Hetzner API token.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHetznerCredentialStatus()
  }, [loadHetznerCredentialStatus])

  const selected = providers.find((provider) => provider.id === selectedProvider) || providers[0]
  const hetznerStatusLabel = hetznerConfigured ? "Configured" : "Not configured"
  const hetznerStatusClasses = hetznerConfigured
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"

  return (
    <SurfaceCard>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-slate-300 bg-slate-900 p-2 text-white dark:border-white/15">
            <Cloud className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Cloud Providers</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Store encrypted credentials for supported providers and manage cloud launch settings.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadHetznerCredentialStatus()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <Link
            href="/ship-yard"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
          >
            Open Ship Yard
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {providers.map((provider) => {
          const isSelected = provider.id === selectedProvider
          const statusLabel =
            provider.id === "hetzner"
              ? hetznerStatusLabel
              : provider.supported
                ? "Available"
                : "Coming soon"

          const statusClasses =
            provider.id === "hetzner"
              ? hetznerStatusClasses
              : provider.supported
                ? "border-slate-300/70 bg-slate-100/60 text-slate-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-200"
                : "border-slate-300/70 bg-slate-100/60 text-slate-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-400"

          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => {
                setSelectedProvider(provider.id)
                setMessage(null)
              }}
              className={`group rounded-xl border px-3 py-3 text-left transition-colors ${
                isSelected
                  ? "border-slate-900 bg-white dark:border-white/35 dark:bg-white/[0.06]"
                  : "border-slate-300/70 bg-white/60 hover:bg-white dark:border-white/12 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold tracking-wide ${provider.badgeClassName}`}
                >
                  {provider.badge}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {provider.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{provider.hint}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${statusClasses}`}>
                  {statusLabel}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selected.name} credentials
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {selected.id === "hetzner"
                ? `Status: ${hetznerStatusLabel}${hetznerUpdatedAt ? ` • Updated ${formatTimestamp(hetznerUpdatedAt)}` : ""}`
                : "Status: Coming soon"}
            </p>
          </div>
        </div>

        {message ? (
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
              message.type === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200"
                : message.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                  : "border-slate-300/70 bg-white/70 text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            }`}
          >
            <div className="space-y-2">
              <p>{message.text}</p>
              {message.code ? (
                <p className="text-[11px] opacity-90">
                  Code: <code>{message.code}</code>
                </p>
              ) : null}
              {message.code && isWalletEnclaveCode(message.code) ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">Next steps</p>
                  <ul className="list-disc space-y-1 pl-5 text-[11px]">
                    {walletEnclaveGuidance(message.code).steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {message.suggestedCommands && message.suggestedCommands.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">Suggested commands</p>
                  <ul className="list-disc space-y-1 pl-5 text-[11px]">
                    {message.suggestedCommands.map((command) => (
                      <li key={command}>
                        <code>{command}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {selected.id === "hetzner" ? (
          <div className="mt-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Hetzner API token
              </span>
              <input
                type="password"
                value={hetznerTokenInput}
                onChange={(event) => setHetznerTokenInput(event.target.value)}
                placeholder="Enter token"
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveHetznerToken()}
                disabled={isLoading || hetznerTokenInput.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save token
              </button>
              <button
                type="button"
                onClick={() => void removeHetznerToken()}
                disabled={isLoading || !hetznerConfigured}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                Remove token
              </button>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Stored encrypted via the wallet enclave.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-sm text-slate-600 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-300">
            Provider support for {selected.name} is not available yet. Keep using Hetzner for cloud launches for now.
          </div>
        )}
      </div>
    </SurfaceCard>
  )
}

