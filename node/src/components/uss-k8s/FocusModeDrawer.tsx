"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { X } from "lucide-react"

interface FocusModeDrawerProps {
  title: string
  subtitle: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}

export function FocusModeDrawer({ title, subtitle, isOpen, onClose, children }: FocusModeDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isOpen, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`pointer-events-auto absolute inset-0 z-30 bg-slate-950/20 backdrop-blur-[2px] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className={`pointer-events-auto absolute right-0 top-0 z-40 flex h-full w-full max-w-[400px] flex-col border-l border-slate-300/75 bg-white/95 shadow-[-8px_0_32px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-white/12 dark:bg-slate-950/92 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-300/65 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="min-w-0">
            <p className="readout text-cyan-700 dark:text-cyan-300">{subtitle}</p>
            <p className="truncate text-[13px] font-medium text-slate-900 dark:text-slate-50">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300/70 bg-white/80 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.09] dark:hover:text-slate-100 dark:focus-visible:ring-cyan-400/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  )
}
