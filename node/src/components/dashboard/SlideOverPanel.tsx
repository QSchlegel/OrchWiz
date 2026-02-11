"use client"

import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

interface SlideOverPanelProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  maxWidthClassName?: string
}

export function SlideOverPanel({
  open,
  title,
  description,
  onClose,
  children,
  maxWidthClassName = "sm:max-w-2xl",
}: SlideOverPanelProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-hidden={!open}
        aria-label={title}
        className={`fixed inset-y-0 right-0 z-[71] w-full transform border-l border-slate-200/80 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-white/10 dark:bg-slate-950 ${maxWidthClassName} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-4 py-3 dark:border-white/10 sm:px-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
              {description ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        </div>
      </aside>
    </>
  )
}
