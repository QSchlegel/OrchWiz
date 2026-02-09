"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { VaultFileResponse, VaultId } from "@/lib/vault/types"

interface VaultNotePreviewProps {
  file: VaultFileResponse | null
  isLoading: boolean
  error: string | null
  onOpenLink: (vaultId: VaultId, path: string) => void
}

interface VaultLinkPayload {
  vaultId: VaultId
  path: string
}

function createVaultHref(payload: VaultLinkPayload): string {
  return `vault-link:${encodeURIComponent(JSON.stringify(payload))}`
}

function parseVaultHref(href: string): VaultLinkPayload | null {
  if (!href.startsWith("vault-link:")) return null
  try {
    const encoded = href.slice("vault-link:".length)
    const parsed = JSON.parse(decodeURIComponent(encoded)) as VaultLinkPayload
    if (!parsed?.vaultId || !parsed?.path) return null
    return parsed
  } catch {
    return null
  }
}

function rewriteWikiLinks(markdown: string, file: VaultFileResponse): string {
  const wikiLinks = file.outgoingLinks.filter((link) => link.kind === "wiki")
  const linksByTarget = new Map<string, typeof wikiLinks>()
  for (const link of wikiLinks) {
    const key = link.target.toLowerCase()
    const queue = linksByTarget.get(key) || []
    queue.push(link)
    linksByTarget.set(key, queue)
  }

  return markdown.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu, (_match, rawTarget, rawLabel) => {
    const target = String(rawTarget || "").trim()
    const defaultLabel = target.split("/").at(-1) || target
    const label = String(rawLabel || defaultLabel).trim()
    const queue = linksByTarget.get(target.toLowerCase()) || []
    const resolved = queue.shift()
    linksByTarget.set(target.toLowerCase(), queue)

    if (!resolved || !resolved.exists || !resolved.resolvedVaultId || !resolved.resolvedPath) {
      return label
    }

    return `[${label}](${createVaultHref({ vaultId: resolved.resolvedVaultId, path: resolved.resolvedPath })})`
  })
}

export function VaultNotePreview({ file, isLoading, error, onOpenLink }: VaultNotePreviewProps) {
  const markdownLinkMap = useMemo(() => {
    const map = new Map<string, { vaultId: VaultId; path: string }>()
    if (!file) return map
    for (const link of file.outgoingLinks) {
      if (!link.exists || !link.resolvedVaultId || !link.resolvedPath) continue
      if (link.kind !== "markdown") continue
      map.set(link.target, {
        vaultId: link.resolvedVaultId,
        path: link.resolvedPath,
      })
    }
    return map
  }, [file])

  const markdown = useMemo(() => {
    if (!file) return ""
    return rewriteWikiLinks(file.content, file)
  }, [file])

  if (isLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading note...</p>
  }

  if (error) {
    return <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
  }

  if (!file) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Select a note from the vault tree.</p>
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200/70 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
        <p className="truncate font-medium">{file.path}</p>
        <p className="mt-1">
          Updated {new Date(file.mtime).toLocaleString()} · {Math.max(1, Math.round(file.size / 1024))} KB
        </p>
        {file.truncated ? (
          <p className="mt-1 text-amber-700 dark:text-amber-200">Preview is truncated due to file size limit.</p>
        ) : null}
      </div>

      <article className="prose prose-slate max-w-none dark:prose-invert">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              if (!href) return <span>{children}</span>

              const vaultPayload = parseVaultHref(href)
              if (vaultPayload) {
                return (
                  <button
                    type="button"
                    className="cursor-pointer text-cyan-700 underline decoration-cyan-600/50 underline-offset-2 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                    onClick={() => onOpenLink(vaultPayload.vaultId, vaultPayload.path)}
                  >
                    {children}
                  </button>
                )
              }

              const resolvedMarkdown = markdownLinkMap.get(href)
              if (resolvedMarkdown) {
                return (
                  <button
                    type="button"
                    className="cursor-pointer text-cyan-700 underline decoration-cyan-600/50 underline-offset-2 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                    onClick={() => onOpenLink(resolvedMarkdown.vaultId, resolvedMarkdown.path)}
                  >
                    {children}
                  </button>
                )
              }

              return (
                <a href={href} target="_blank" rel="noreferrer" className="break-all">
                  {children}
                </a>
              )
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  )
}
