"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CheckCircle2, Copy, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react"

interface ShipyardApiKeyRecord {
  id: string
  name: string | null
  keyId: string
  preview: string
  fingerprint: string
  status: "active" | "revoked"
  createdAt: string
  updatedAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

interface ApiKeysResponse {
  keys?: ShipyardApiKeyRecord[]
  error?: string
}

interface ApiKeyCreateResponse {
  key?: ShipyardApiKeyRecord
  plaintextKey?: string
  error?: string
}

interface ShipyardApiKeysPanelProps {
  className?: string
}

interface NoticeState {
  type: "success" | "error" | "info"
  text: string
}

function asApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).error === "string") {
    const message = ((payload as Record<string, unknown>).error as string).trim()
    if (message.length > 0) {
      return message
    }
  }

  return fallback
}

function formatRelative(value: string | null): string {
  if (!value) {
    return "never"
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return "unknown"
  }

  const diffMs = parsed - Date.now()
  const absMs = Math.abs(diffMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

  if (absMs < minute) {
    return "just now"
  }
  if (absMs < hour) {
    return formatter.format(Math.round(diffMs / minute), "minute")
  }
  if (absMs < day) {
    return formatter.format(Math.round(diffMs / hour), "hour")
  }
  return formatter.format(Math.round(diffMs / day), "day")
}

export function ShipyardApiKeysPanel({ className }: ShipyardApiKeysPanelProps) {
  const [keys, setKeys] = useState<ShipyardApiKeyRecord[]>([])
  const [keyName, setKeyName] = useState("")
  const [plaintextKey, setPlaintextKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [isCopying, setIsCopying] = useState(false)

  const activeKeys = useMemo(() => keys.filter((key) => key.status === "active"), [keys])

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/ship-yard/api-keys", {
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => ({}))) as ApiKeysResponse
      if (!response.ok) {
        setNotice({
          type: "error",
          text: asApiError(payload, `Failed to load API keys (${response.status})`),
        })
        setKeys([])
        return
      }

      setKeys(Array.isArray(payload.keys) ? payload.keys : [])
      setNotice(null)
    } catch (error) {
      console.error("Failed to load Ship Yard API keys:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to load API keys.",
      })
      setKeys([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  const refreshKeys = async () => {
    setIsRefreshing(true)
    await loadKeys()
    setIsRefreshing(false)
  }

  const createKey = async () => {
    setIsCreating(true)
    setNotice(null)
    try {
      const response = await fetch("/api/ship-yard/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: keyName,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as ApiKeyCreateResponse
      if (!response.ok) {
        setNotice({
          type: "error",
          text: asApiError(payload, `Failed to create API key (${response.status})`),
        })
        return
      }

      if (!payload.plaintextKey || !payload.key) {
        throw new Error("API key creation response is missing key material.")
      }

      setPlaintextKey(payload.plaintextKey)
      setKeyName("")
      setNotice({ type: "success", text: "API key created. Copy it now; this is the only time it is shown." })
      await loadKeys()
    } catch (error) {
      console.error("Failed to create Ship Yard API key:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to create API key.",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const revokeKey = async (id: string) => {
    setRevokingId(id)
    setNotice(null)
    try {
      const response = await fetch(`/api/ship-yard/api-keys/${id}`, {
        method: "DELETE",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setNotice({
          type: "error",
          text: asApiError(payload, `Failed to revoke API key (${response.status})`),
        })
        return
      }

      setNotice({ type: "success", text: "API key revoked." })
      await loadKeys()
    } catch (error) {
      console.error("Failed to revoke Ship Yard API key:", error)
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to revoke API key.",
      })
    } finally {
      setRevokingId(null)
    }
  }

  const copyOneTimeKey = async () => {
    if (!plaintextKey) return

    try {
      setIsCopying(true)
      await navigator.clipboard.writeText(plaintextKey)
      setNotice({ type: "success", text: "API key copied to clipboard." })
    } catch (error) {
      console.error("Failed to copy API key:", error)
      setNotice({ type: "error", text: "Unable to copy key. Copy it manually from the field." })
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className={`rounded-xl border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35 ${className || ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
            <p className="readout text-cyan-700 dark:text-cyan-300">Ship Yard API Keys</p>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Create user-scoped keys for external agents to call Ship Yard APIs. Key auth infers your user identity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshKeys()}
          disabled={isLoading || isRefreshing}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/80 px-2 py-1 text-xs text-slate-700 hover:bg-white disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <label className="space-y-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Key label (optional)</span>
          <input
            type="text"
            value={keyName}
            onChange={(event) => setKeyName(event.target.value)}
            placeholder="Outside Agent"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void createKey()}
          disabled={isCreating}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/40 dark:text-cyan-200"
        >
          {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Create Key
        </button>
      </div>

      {plaintextKey && (
        <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-medium">One-time key reveal</p>
          <p className="mt-1">Copy now. The plaintext key will not be shown again.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-amber-400/35 bg-amber-500/5 px-2 py-1 text-[11px]">
              {plaintextKey}
            </code>
            <button
              type="button"
              onClick={() => void copyOneTimeKey()}
              disabled={isCopying}
              className="inline-flex items-center gap-1 rounded-md border border-amber-500/45 bg-transparent px-2 py-1 text-[11px] font-medium"
            >
              {isCopying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${
            notice.type === "error"
              ? "border-rose-400/35 bg-rose-500/10 text-rose-700 dark:text-rose-200"
              : notice.type === "success"
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              : "border-slate-300/70 bg-white/70 text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="mt-2 rounded-md border border-slate-300/70 bg-white/75 dark:border-white/12 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-slate-300/70 px-2.5 py-1.5 text-[11px] uppercase tracking-wide text-slate-500 dark:border-white/12 dark:text-slate-400">
          <span>Keys</span>
          <span>
            {activeKeys.length} active / {keys.length} total
          </span>
        </div>

        {isLoading ? (
          <div className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading API keys...
            </span>
          </div>
        ) : keys.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-slate-600 dark:text-slate-300">No API keys yet.</p>
        ) : (
          <div className="divide-y divide-slate-300/70 dark:divide-white/10">
            {keys.map((key) => (
              <div key={key.id} className="px-2.5 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {key.name || "Unnamed key"}
                      <span className="ml-2 rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-white/15 dark:text-slate-300">
                        {key.status}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">{key.preview}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Fingerprint {key.fingerprint} • Last used {formatRelative(key.lastUsedAt)} • Created {formatRelative(key.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revokeKey(key.id)}
                    disabled={key.status !== "active" || revokingId === key.id}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-700 disabled:opacity-50 dark:border-rose-300/45 dark:text-rose-200"
                  >
                    {revokingId === key.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1.5 text-[11px] text-slate-600 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-300">
        Use in external agent requests: <code>Authorization: Bearer &lt;shipyard-user-api-key&gt;</code>
      </div>
    </div>
  )
}
