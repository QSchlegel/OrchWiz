"use client"

import { SessionMode } from "@prisma/client"
import { useState } from "react"

interface ModeToggleProps {
  sessionId: string
  currentMode: SessionMode
  onModeChange?: (mode: SessionMode) => void
}

export function ModeToggle({
  sessionId,
  currentMode,
  onModeChange,
}: ModeToggleProps) {
  const [mode, setMode] = useState<SessionMode>(currentMode)
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async () => {
    const newMode: SessionMode = mode === "plan" ? "auto_accept" : "plan"
    setIsLoading(true)

    try {
      const response = await fetch(`/api/sessions/${sessionId}/mode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: newMode }),
      })

      if (response.ok) {
        setMode(newMode)
        onModeChange?.(newMode)
      } else {
        console.error("Failed to update mode")
      }
    } catch (error) {
      console.error("Error updating mode:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Mode:
      </span>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          mode === "auto_accept"
            ? "bg-blue-600"
            : "bg-gray-200 dark:bg-gray-700"
        } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            mode === "auto_accept" ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm text-gray-600 dark:text-gray-400">
        {mode === "plan" ? "Plan" : "Auto-accept"}
      </span>
    </div>
  )
}
