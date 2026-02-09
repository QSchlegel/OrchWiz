"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, RefreshCw, Search } from "lucide-react"
import { InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"
import type {
  VaultFileResponse,
  VaultId,
  VaultSearchResponse,
  VaultSearchResult,
  VaultSummary,
  VaultTreeNode,
  VaultTreeResponse,
} from "@/lib/vault/types"
import { VaultTree } from "./VaultTree"
import { VaultNotePreview } from "./VaultNotePreview"
import { VaultLinksPanel } from "./VaultLinksPanel"

const VAULT_IDS: VaultId[] = ["orchwiz", "ship", "agent-public", "agent-private", "joined"]

type MobileSection = "tree" | "note" | "links"

function isVaultId(value: string | null): value is VaultId {
  return Boolean(value && VAULT_IDS.includes(value as VaultId))
}

function flattenFilePaths(nodes: VaultTreeNode[]): string[] {
  const paths: string[] = []

  const walk = (nodeList: VaultTreeNode[]) => {
    for (const node of nodeList) {
      if (node.nodeType === "file") {
        paths.push(node.path)
      } else if (node.children?.length) {
        walk(node.children)
      }
    }
  }

  walk(nodes)
  return paths
}

export function VaultExplorer() {
  const searchParams = useSearchParams()
  const queryString = searchParams.toString()
  const router = useRouter()
  const pathname = usePathname()

  const initialVault = isVaultId(searchParams.get("vault")) ? (searchParams.get("vault") as VaultId) : "orchwiz"
  const initialNote = searchParams.get("note")

  const [vaults, setVaults] = useState<VaultSummary[]>([])
  const [selectedVault, setSelectedVault] = useState<VaultId>(initialVault)
  const [selectedNotePath, setSelectedNotePath] = useState<string | null>(initialNote)

  const [tree, setTree] = useState<VaultTreeNode[]>([])
  const [treeExists, setTreeExists] = useState(true)
  const [file, setFile] = useState<VaultFileResponse | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<VaultSearchResult[]>([])
  const [mobileSection, setMobileSection] = useState<MobileSection>("tree")

  const [isLoadingVaults, setIsLoadingVaults] = useState(true)
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)

  const selectedVaultSummary = useMemo(
    () => vaults.find((vault) => vault.id === selectedVault) || null,
    [vaults, selectedVault],
  )

  const loadVaultSummaries = useCallback(async () => {
    setIsLoadingVaults(true)
    try {
      const response = await fetch("/api/vaults")
      const payload = await response.json()
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to load vault list." })
        setVaults([])
        return
      }

      setVaults(Array.isArray(payload) ? payload : [])
    } catch (error) {
      console.error("Error loading vault summaries:", error)
      setMessage({ type: "error", text: "Failed to load vault list." })
    } finally {
      setIsLoadingVaults(false)
    }
  }, [])

  const loadTree = useCallback(
    async (vaultId: VaultId, preferredPath: string | null) => {
      setIsLoadingTree(true)
      try {
        const response = await fetch(`/api/vaults/tree?vault=${encodeURIComponent(vaultId)}`)
        const payload = (await response.json()) as VaultTreeResponse | { error?: string }
        if (!response.ok) {
          setMessage({
            type: "error",
            text: (payload as { error?: string })?.error || "Failed to load vault tree.",
          })
          setTree([])
          setTreeExists(false)
          setSelectedNotePath(null)
          setFile(null)
          return
        }

        const treePayload = payload as VaultTreeResponse
        setTree(treePayload.tree || [])
        setTreeExists(Boolean(treePayload.exists))

        const filePaths = flattenFilePaths(treePayload.tree || [])
        const nextPath = preferredPath && filePaths.includes(preferredPath) ? preferredPath : filePaths[0] || null
        setSelectedNotePath(nextPath)
        if (!nextPath) {
          setFile(null)
        }
      } catch (error) {
        console.error("Error loading vault tree:", error)
        setMessage({ type: "error", text: "Failed to load vault tree." })
        setTree([])
        setTreeExists(false)
        setSelectedNotePath(null)
        setFile(null)
      } finally {
        setIsLoadingTree(false)
      }
    },
    [],
  )

  const loadFile = useCallback(async (vaultId: VaultId, notePath: string) => {
    setIsLoadingFile(true)
    try {
      const params = new URLSearchParams({
        vault: vaultId,
        path: notePath,
      })
      const response = await fetch(`/api/vaults/file?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) {
        setFile(null)
        setMessage({ type: "error", text: payload?.error || "Failed to load note." })
        return
      }

      setFile(payload as VaultFileResponse)
    } catch (error) {
      console.error("Error loading vault note:", error)
      setMessage({ type: "error", text: "Failed to load note." })
      setFile(null)
    } finally {
      setIsLoadingFile(false)
    }
  }, [])

  useEffect(() => {
    loadVaultSummaries()
  }, [loadVaultSummaries])

  useEffect(() => {
    loadTree(selectedVault, selectedNotePath)
    setSearchResults([])
  }, [loadTree, selectedVault])

  useEffect(() => {
    if (!selectedNotePath) return
    loadFile(selectedVault, selectedNotePath)
  }, [loadFile, selectedVault, selectedNotePath])

  useEffect(() => {
    const params = new URLSearchParams(queryString)
    const queryVault = params.get("vault")
    const queryNote = params.get("note")
    const queryTab = params.get("tab")
    const activeQueryVault = isVaultId(queryVault) ? queryVault : "orchwiz"
    const activeQueryNote = queryNote || null

    if (queryTab !== "explorer") {
      return
    }

    setSelectedVault((previous) => (previous === activeQueryVault ? previous : activeQueryVault))
    setSelectedNotePath((previous) => (previous === activeQueryNote ? previous : activeQueryNote))
  }, [queryString])

  useEffect(() => {
    const params = new URLSearchParams(queryString)
    const queryVault = params.get("vault")
    const queryNote = params.get("note")
    const queryTab = params.get("tab")
    const normalizedQueryVault = isVaultId(queryVault) ? queryVault : "orchwiz"

    if (
      queryTab === "explorer" &&
      normalizedQueryVault === selectedVault &&
      (queryNote || null) === selectedNotePath
    ) {
      return
    }

    params.set("tab", "explorer")
    params.set("vault", selectedVault)
    if (selectedNotePath) {
      params.set("note", selectedNotePath)
    } else {
      params.delete("note")
    }

    const nextQueryString = params.toString()
    if (nextQueryString === queryString) {
      return
    }

    router.replace(`${pathname}?${nextQueryString}`, { scroll: false })
  }, [pathname, queryString, router, selectedVault, selectedNotePath])

  const runSearch = async () => {
    setIsSearching(true)
    try {
      const params = new URLSearchParams({
        vault: selectedVault,
        q: searchQuery,
      })

      const response = await fetch(`/api/vaults/search?${params.toString()}`)
      const payload = (await response.json()) as VaultSearchResponse | { error?: string }
      if (!response.ok) {
        setMessage({
          type: "error",
          text: (payload as { error?: string })?.error || "Search failed.",
        })
        setSearchResults([])
        return
      }

      setSearchResults((payload as VaultSearchResponse).results || [])
    } catch (error) {
      console.error("Error searching vault notes:", error)
      setMessage({ type: "error", text: "Search failed." })
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleOpenResolvedLink = (vaultId: VaultId, path: string) => {
    if (!isVaultId(vaultId)) return

    setSelectedVault(vaultId)
    setSelectedNotePath(path)
    setMobileSection("note")
  }

  const treePanel = (
    <SurfaceCard className="flex h-[68vh] flex-col gap-3 overflow-hidden">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vault</label>
          <button
            type="button"
            onClick={() => {
              loadVaultSummaries()
              loadTree(selectedVault, selectedNotePath)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        <select
          value={selectedVault}
          onChange={(event) => {
            const nextVault = event.target.value as VaultId
            setSelectedVault(nextVault)
            setSelectedNotePath(null)
            setMobileSection("tree")
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          {vaults.map((vault) => (
            <option key={vault.id} value={vault.id}>
              {vault.label} {vault.exists ? `(${vault.noteCount})` : "(unavailable)"}
            </option>
          ))}
        </select>
        {selectedVaultSummary?.isPrivate ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-200">
            {selectedVaultSummary.encryptedLabel || "Private vault"}
          </p>
        ) : null}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          runSearch()
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search notes..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-slate-900"
        >
          {isSearching ? "..." : "Go"}
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200/80 bg-white/70 p-2 dark:border-white/10 dark:bg-white/[0.03]">
        {isLoadingTree ? (
          <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">Loading tree...</p>
        ) : !treeExists ? (
          <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">This vault path is unavailable.</p>
        ) : (
          <VaultTree
            nodes={tree}
            selectedPath={selectedNotePath}
            onSelectFile={(path) => {
              setSelectedNotePath(path)
              setMobileSection("note")
            }}
          />
        )}
      </div>

      {searchResults.length > 0 ? (
        <div className="max-h-44 overflow-auto rounded-lg border border-slate-200/80 bg-white/70 p-2 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Search Results ({searchResults.length})
          </p>
          <div className="space-y-1.5">
            {searchResults.map((result) => (
              <button
                key={`${result.vaultId}:${result.path}`}
                type="button"
                onClick={() => {
                  setSelectedVault(result.vaultId)
                  setSelectedNotePath(result.path)
                  setMobileSection("note")
                }}
                className="w-full rounded-md border border-slate-200/80 bg-white/80 px-2.5 py-2 text-left text-xs hover:border-cyan-500/40 hover:bg-cyan-50/70 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-cyan-500/10"
              >
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{result.path}</p>
                {result.excerpt ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{result.excerpt}</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  )

  const notePanel = (
    <SurfaceCard className="h-[68vh] overflow-auto">
      <VaultNotePreview
        file={file}
        isLoading={isLoadingFile}
        error={null}
        onOpenLink={handleOpenResolvedLink}
      />
    </SurfaceCard>
  )

  const linksPanel = (
    <SurfaceCard className="h-[68vh] overflow-auto">
      <VaultLinksPanel
        file={file}
        selectedVaultSummary={selectedVaultSummary}
        onOpenLink={handleOpenResolvedLink}
      />
    </SurfaceCard>
  )

  return (
    <div className="space-y-4">
      {message ? <InlineNotice variant={message.type}>{message.text}</InlineNotice> : null}

      {isLoadingVaults ? (
        <SurfaceCard>
          <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading vault explorer...
          </div>
        </SurfaceCard>
      ) : null}

      <div className="hidden gap-4 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        {treePanel}
        {notePanel}
        {linksPanel}
      </div>

      <div className="space-y-3 lg:hidden">
        <div className="inline-flex w-full items-center rounded-lg border border-slate-200/80 bg-white/80 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {(["tree", "note", "links"] as MobileSection[]).map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => setMobileSection(section)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wide ${
                mobileSection === section
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {section}
            </button>
          ))}
        </div>

        {mobileSection === "tree" ? treePanel : null}
        {mobileSection === "note" ? notePanel : null}
        {mobileSection === "links" ? linksPanel : null}
      </div>
    </div>
  )
}
