"use client"

import { useCallback, useEffect, useState } from "react"
import {
  readLastPresenceAt,
  shouldLockFromAbsence,
  writeLastPresenceAt,
} from "@/lib/agent-chat/presenceLock"

export function useAgentChatAbsenceLock(args: {
  enabled: boolean
  timeoutMs: number
  onLock?: () => void
}) {
  const { enabled, timeoutMs, onLock } = args
  const [locked, setLocked] = useState(false)

  const refreshPresence = useCallback(() => {
    if (typeof window === "undefined") return
    writeLastPresenceAt(window.localStorage, Date.now())
  }, [])

  const unlock = useCallback(() => {
    setLocked(false)
    if (typeof window === "undefined") return
    writeLastPresenceAt(window.localStorage, Date.now())
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!enabled) {
      setLocked(false)
      return
    }

    const checkAndMaybeLock = () => {
      const now = Date.now()
      const lastPresenceAt = readLastPresenceAt(window.localStorage)
      const shouldLock = shouldLockFromAbsence({ now, lastPresenceAt, timeoutMs })

      if (shouldLock) {
        setLocked(true)
        onLock?.()
      }

      writeLastPresenceAt(window.localStorage, now)
    }

    checkAndMaybeLock()

    const handleBlur = () => {
      writeLastPresenceAt(window.localStorage, Date.now())
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        writeLastPresenceAt(window.localStorage, Date.now())
        return
      }

      if (document.visibilityState === "visible") {
        checkAndMaybeLock()
      }
    }

    const handleFocus = () => {
      if (document.visibilityState !== "visible") {
        return
      }
      checkAndMaybeLock()
    }

    window.addEventListener("blur", handleBlur)
    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("blur", handleBlur)
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, onLock, timeoutMs])

  return { locked, unlock, refreshPresence }
}

