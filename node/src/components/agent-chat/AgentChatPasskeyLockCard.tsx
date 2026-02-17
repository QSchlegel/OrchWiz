"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { authClient, signIn } from "@/lib/auth-client"
import { getPasskeySignInErrorMessage } from "@/lib/auth-utils"

export function AgentChatPasskeyLockCard(props: {
  timeoutMs: number
  onUnlocked: () => void
}) {
  const { timeoutMs, onUnlocked } = props

  const minutesAway = useMemo(() => Math.max(1, Math.ceil(timeoutMs / 60000)), [timeoutMs])
  const subtitle = useMemo(() => {
    const unit = minutesAway === 1 ? "minute" : "minutes"
    return `Locked after being away for more than ${minutesAway} ${unit}.`
  }, [minutesAway])

  const [passkeyCount, setPasskeyCount] = useState<number | null>(null)
  const [isListingPasskeys, setIsListingPasskeys] = useState(true)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setIsListingPasskeys(true)
      try {
        const { data, error } = await authClient.passkey.listUserPasskeys()
        if (cancelled) return
        if (error) {
          setPasskeyCount(null)
          return
        }
        setPasskeyCount(Array.isArray(data) ? data.length : 0)
      } catch {
        if (!cancelled) {
          setPasskeyCount(null)
        }
      } finally {
        if (!cancelled) {
          setIsListingPasskeys(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const knownNoPasskeys = passkeyCount === 0

  const handleUnlock = async () => {
    if (isUnlocking) return

    setErrorMessage(null)
    setIsUnlocking(true)
    try {
      const result = await signIn.passkey()
      if (result.error) {
        setErrorMessage(getPasskeySignInErrorMessage(result.error))
        return
      }

      onUnlocked()
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown passkey sign-in error"
      setErrorMessage(getPasskeySignInErrorMessage({ message }))
    } finally {
      setIsUnlocking(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_16px_44px_rgba(15,23,42,0.24)] backdrop-blur dark:border-white/12 dark:bg-slate-950/75">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-300" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300">
              Agent Chat Locked
            </p>
          </div>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{subtitle}</p>
        </div>

        <Link
          href="/sessions"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.12]"
        >
          Manage passkeys
        </Link>
      </div>

      {knownNoPasskeys && (
        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          No passkeys found for this account. Add one in{" "}
          <Link href="/sessions" className="underline underline-offset-2">
            Sessions
          </Link>
          .
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
          {errorMessage}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUnlock}
          disabled={isUnlocking}
          className="inline-flex min-h-8 items-center gap-2 rounded-md border border-amber-500/45 bg-amber-500/12 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:opacity-60 dark:border-amber-300/45 dark:text-amber-200"
        >
          {isUnlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Unlock with passkey
        </button>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {isListingPasskeys ? "Checking passkeys..." : "Passkey required after extended absence."}
        </p>
      </div>
    </div>
  )
}

