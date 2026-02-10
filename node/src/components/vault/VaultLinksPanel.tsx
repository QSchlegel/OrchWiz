"use client"

import { ArrowRight, Link2, Link2Off, ShieldCheck } from "lucide-react"
import type { VaultFileResponse, VaultId, VaultSummary } from "@/lib/vault/types"

interface VaultLinksPanelProps {
  file: VaultFileResponse | null
  selectedVaultSummary: VaultSummary | null
  onOpenLink: (vaultId: VaultId, path: string) => void
  onCreateFromUnresolved?: (target: string) => void
}

export function VaultLinksPanel({ file, selectedVaultSummary, onOpenLink, onCreateFromUnresolved }: VaultLinksPanelProps) {
  if (!file) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Select a note to inspect metadata and links.</p>
  }

  return (
    <div className="space-y-4">
      {selectedVaultSummary?.isPrivate ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
          <div className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{selectedVaultSummary.encryptedLabel || "Private vault"}</span>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Metadata</p>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Path</dt>
            <dd className="max-w-[190px] truncate text-right text-slate-800 dark:text-slate-100">{file.path}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Size</dt>
            <dd className="text-slate-800 dark:text-slate-100">{Math.max(1, Math.round(file.size / 1024))} KB</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500 dark:text-slate-400">Updated</dt>
            <dd className="text-slate-800 dark:text-slate-100">{new Date(file.mtime).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Outgoing Links ({file.outgoingLinks.length})
        </p>
        <div className="mt-2 space-y-1.5">
          {file.outgoingLinks.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No outgoing links.</p>
          ) : (
            file.outgoingLinks.map((link, index) => (
              <div
                key={`${link.kind}-${link.target}-${index}`}
                className="rounded-md border border-slate-200/80 bg-white/80 px-2.5 py-2 text-xs dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700 dark:text-slate-200">{link.label}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:bg-white/[0.08] dark:text-slate-300">
                    {link.kind}
                  </span>
                </div>
                {link.exists && link.resolvedPath && link.resolvedVaultId ? (
                  <button
                    type="button"
                    onClick={() => onOpenLink(link.resolvedVaultId as VaultId, link.resolvedPath as string)}
                    className="mt-1.5 inline-flex items-center gap-1 text-cyan-700 hover:underline dark:text-cyan-300"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="truncate">{link.resolvedPath}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <div className="mt-1.5 space-y-1.5 text-slate-500 dark:text-slate-400">
                    <div className="inline-flex items-center gap-1">
                      <Link2Off className="h-3.5 w-3.5" />
                      <span className="truncate">Unresolved in current scope: {link.target}</span>
                    </div>
                    {onCreateFromUnresolved ? (
                      <button
                        type="button"
                        onClick={() => onCreateFromUnresolved(link.target)}
                        className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-200"
                      >
                        Create note from link
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Backlinks ({file.backlinks.length})
        </p>
        <div className="mt-2 space-y-1.5">
          {file.backlinks.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No backlinks.</p>
          ) : (
            file.backlinks.map((backlink, index) => (
              <button
                key={`${backlink.sourcePath}-${backlink.target}-${index}`}
                type="button"
                onClick={() => onOpenLink(file.vaultId, backlink.sourcePath)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-white/80 px-2.5 py-2 text-left text-xs hover:border-cyan-500/40 hover:bg-cyan-50/70 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-cyan-500/10"
              >
                <span className="truncate text-slate-700 dark:text-slate-200">{backlink.sourcePath}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
