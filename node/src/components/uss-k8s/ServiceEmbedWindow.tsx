"use client"

import { memo, useCallback, useRef, useState } from "react"
import { ExternalLink, Loader2, RefreshCw, X } from "lucide-react"

interface ServiceEmbedWindowProps {
  url: string
  label: string
  onClose: () => void
}

export const ServiceEmbedWindow = memo(function ServiceEmbedWindow({
  url,
  label,
  onClose,
}: ServiceEmbedWindowProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleLoad = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
  }, [])

  const handleError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])

  const handleRefresh = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    setIsLoading(true)
    setHasError(false)
    // Force reload by re-setting the src
    iframe.src = url
  }, [url])

  const handleOpenInNewTab = useCallback(() => {
    window.open(url, "_blank", "noopener,noreferrer")
  }, [url])

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-300/65 bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex min-w-0 items-center gap-2">
          {isLoading && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-600 dark:text-cyan-300" />}
          <span className="truncate text-[12px] font-medium text-slate-800 dark:text-slate-100">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            title="Refresh"
            className="flex h-6 w-6 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleOpenInNewTab}
            title="Open in new tab"
            className="flex h-6 w-6 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
          >
            <ExternalLink className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close embed"
            className="flex h-6 w-6 items-center justify-center rounded text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Iframe container */}
      <div className="relative flex-1">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-slate-950/60">
            <div className="flex flex-col items-center gap-2.5">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-600 dark:text-cyan-300" />
              <span className="readout text-slate-600 dark:text-slate-300">Loading {label}...</span>
            </div>
          </div>
        )}

        {hasError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
              Unable to load {label}
            </p>
            <p className="max-w-[280px] text-center text-[11px] text-slate-600 dark:text-slate-400">
              The service may be unavailable or the proxy route may not be configured.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="readout flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-cyan-700 transition-colors hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:border-cyan-300/45 dark:text-cyan-100"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
              <button
                type="button"
                onClick={handleOpenInNewTab}
                className="readout flex items-center gap-1.5 rounded-md border border-slate-400/45 bg-white/70 px-3 py-1.5 text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200"
              >
                <ExternalLink className="h-3 w-3" />
                Open in tab
              </button>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            title={label}
            className="h-full w-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
      </div>
    </div>
  )
})
