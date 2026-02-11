"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowRightLeft, FilePlus2, Loader2, PenSquare, RefreshCw, Save, Search, Trash2 } from "lucide-react"
import { InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"
import type {
  VaultDeleteMode,
  VaultFileReadMode,
  VaultFileResponse,
  VaultId,
  VaultRagBackend,
  VaultRagMode,
  VaultSeedPackInstallResponse,
  VaultSeedPackSummary,
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
const PHYSICAL_VAULT_IDS: VaultId[] = ["orchwiz", "ship", "agent-public", "agent-private"]

type MobileSection = "tree" | "note" | "links"
type SaveState = "idle" | "saving" | "saved" | "error"

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

function normalizePathInput(raw: string): string | null {
  const trimmed = raw.trim().replaceAll("\\", "/")
  if (!trimmed) return null
  if (trimmed.startsWith("/")) return null

  const noLeading = trimmed.replace(/^\.\/+/, "")
  const noTrailing = noLeading.replace(/\/+$/, "")
  const parts = noTrailing.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) {
    return null
  }

  let normalized = parts.join("/")
  if (!normalized.toLowerCase().endsWith(".md")) {
    normalized = `${normalized}.md`
  }

  return normalized
}

function ensureJoinedNamespace(path: string): boolean {
  const namespace = path.split("/")[0]
  return Boolean(namespace && PHYSICAL_VAULT_IDS.includes(namespace as VaultId))
}

function inferCreatePathFromFolder(folderPath: string, selectedVault: VaultId): string {
  if (!folderPath) {
    return selectedVault === "joined" ? "orchwiz/Untitled.md" : "Untitled.md"
  }
  return `${folderPath}/Untitled.md`
}

function inferCreatePathFromUnresolved(target: string, selectedVault: VaultId, selectedNotePath: string | null): string {
  const normalizedTarget = target.trim().replaceAll("\\", "/").split("#")[0].split("?")[0]

  if (!normalizedTarget) {
    return selectedVault === "joined" ? "orchwiz/Untitled.md" : "Untitled.md"
  }

  if (selectedVault === "joined") {
    if (ensureJoinedNamespace(normalizedTarget)) {
      return normalizedTarget.toLowerCase().endsWith(".md") ? normalizedTarget : `${normalizedTarget}.md`
    }

    const namespace = selectedNotePath?.split("/")[0]
    if (namespace && ensureJoinedNamespace(`${namespace}/x.md`)) {
      const withNamespace = `${namespace}/${normalizedTarget}`
      return withNamespace.toLowerCase().endsWith(".md") ? withNamespace : `${withNamespace}.md`
    }

    return `orchwiz/${normalizedTarget.toLowerCase().endsWith(".md") ? normalizedTarget : `${normalizedTarget}.md`}`
  }

  const sourceDir = selectedNotePath?.includes("/") ? selectedNotePath.split("/").slice(0, -1).join("/") : ""
  if (normalizedTarget.startsWith("/")) {
    const absolute = normalizedTarget.slice(1)
    return absolute.toLowerCase().endsWith(".md") ? absolute : `${absolute}.md`
  }

  const composed = sourceDir ? `${sourceDir}/${normalizedTarget}` : normalizedTarget
  return composed.toLowerCase().endsWith(".md") ? composed : `${composed}.md`
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
  const [searchMode, setSearchMode] = useState<VaultRagMode>("hybrid")
  const [searchBackend, setSearchBackend] = useState<VaultRagBackend>("auto")
  const [searchResults, setSearchResults] = useState<VaultSearchResult[]>([])
  const [mobileSection, setMobileSection] = useState<MobileSection>("tree")

  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState("")
  const [draftDirty, setDraftDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>("idle")

  const [isLoadingVaults, setIsLoadingVaults] = useState(true)
  const [isLoadingTree, setIsLoadingTree] = useState(false)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingFullForEdit, setIsLoadingFullForEdit] = useState(false)
  const [message, setMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null)
  const [seedPacks, setSeedPacks] = useState<VaultSeedPackSummary[]>([])
  const [selectedSeedPackId, setSelectedSeedPackId] = useState("")
  const [isLoadingSeedPacks, setIsLoadingSeedPacks] = useState(false)
  const [isInstallingSeedPack, setIsInstallingSeedPack] = useState(false)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createPathInput, setCreatePathInput] = useState("")
  const [createContentInput, setCreateContentInput] = useState("")

  const [showRenameForm, setShowRenameForm] = useState(false)
  const [renameSourcePath, setRenameSourcePath] = useState<string | null>(null)
  const [renameTargetPath, setRenameTargetPath] = useState("")
  const latestDraftRef = useRef(draftContent)

  const selectedVaultSummary = useMemo(
    () => vaults.find((vault) => vault.id === selectedVault) || null,
    [vaults, selectedVault],
  )
  const seedPackControlsVisible = selectedVault === "orchwiz" || selectedVault === "joined"
  const orchwizSeedPacks = useMemo(
    () => seedPacks.filter((pack) => pack.vaultId === "orchwiz"),
    [seedPacks],
  )

  useEffect(() => {
    latestDraftRef.current = draftContent
  }, [draftContent])

  const fetchVaultFile = useCallback(async (vaultId: VaultId, notePath: string, mode: VaultFileReadMode) => {
    const params = new URLSearchParams({
      vault: vaultId,
      path: notePath,
      mode,
    })

    const response = await fetch(`/api/vaults/file?${params.toString()}`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.error || `Failed to load note (${response.status}).`)
    }

    return payload as VaultFileResponse
  }, [])

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

  const loadSeedPacks = useCallback(async () => {
    setIsLoadingSeedPacks(true)
    try {
      const response = await fetch("/api/vaults/packs")
      const payload = (await response.json().catch(() => ({}))) as { packs?: VaultSeedPackSummary[]; error?: string }
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to load seed packs." })
        setSeedPacks([])
        return
      }

      setSeedPacks(Array.isArray(payload.packs) ? payload.packs : [])
    } catch (error) {
      console.error("Error loading vault seed packs:", error)
      setMessage({ type: "error", text: "Failed to load seed packs." })
      setSeedPacks([])
    } finally {
      setIsLoadingSeedPacks(false)
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
          setIsEditing(false)
        }
      } catch (error) {
        console.error("Error loading vault tree:", error)
        setMessage({ type: "error", text: "Failed to load vault tree." })
        setTree([])
        setTreeExists(false)
        setSelectedNotePath(null)
        setFile(null)
        setIsEditing(false)
      } finally {
        setIsLoadingTree(false)
      }
    },
    [],
  )

  const loadPreviewFile = useCallback(
    async (vaultId: VaultId, notePath: string) => {
      setIsLoadingFile(true)
      try {
        const payload = await fetchVaultFile(vaultId, notePath, "preview")
        setFile(payload)
      } catch (error) {
        console.error("Error loading vault note:", error)
        setMessage({ type: "error", text: (error as Error).message || "Failed to load note." })
        setFile(null)
      } finally {
        setIsLoadingFile(false)
      }
    },
    [fetchVaultFile],
  )

  useEffect(() => {
    loadVaultSummaries()
  }, [loadVaultSummaries])

  useEffect(() => {
    loadSeedPacks()
  }, [loadSeedPacks])

  useEffect(() => {
    const defaultPackId = orchwizSeedPacks[0]?.id || ""
    setSelectedSeedPackId((current) =>
      current && orchwizSeedPacks.some((pack) => pack.id === current) ? current : defaultPackId,
    )
  }, [orchwizSeedPacks])

  useEffect(() => {
    loadTree(selectedVault, selectedNotePath)
    setSearchResults([])
  }, [loadTree, selectedVault])

  useEffect(() => {
    if (!selectedNotePath) return
    setIsEditing(false)
    setDraftDirty(false)
    setSaveState("idle")
    loadPreviewFile(selectedVault, selectedNotePath)
  }, [loadPreviewFile, selectedVault, selectedNotePath])

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
      queryTab === "explorer"
      && normalizedQueryVault === selectedVault
      && (queryNote || null) === selectedNotePath
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
        mode: searchMode,
        backend: searchBackend,
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

  const handleInstallSeedPack = async () => {
    if (!selectedSeedPackId) {
      setMessage({ type: "error", text: "Select a seed pack first." })
      return
    }

    if (isEditing && draftDirty) {
      const shouldDiscard = window.confirm("Installing a seed pack will replace managed notes. Discard unsaved changes?")
      if (!shouldDiscard) {
        return
      }
    }

    setIsInstallingSeedPack(true)
    try {
      const response = await fetch("/api/vaults/packs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          packId: selectedSeedPackId,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as
        | VaultSeedPackInstallResponse
        | { error?: string }
      if (!response.ok) {
        setMessage({ type: "error", text: (payload as { error?: string })?.error || "Failed to install seed pack." })
        return
      }

      const install = payload as VaultSeedPackInstallResponse
      const nextPath = install.files[0]?.path || null

      setSelectedVault("orchwiz")
      setSelectedNotePath(nextPath)
      setSearchResults([])
      setIsEditing(false)
      setDraftDirty(false)
      setSaveState("idle")
      setShowCreateForm(false)
      setShowRenameForm(false)
      setRenameSourcePath(null)
      setRenameTargetPath("")

      await loadVaultSummaries()
      await loadTree("orchwiz", nextPath)
      setMobileSection("note")
      setMessage({
        type: "success",
        text: `Installed ${install.noteCount} notes from ${install.packId}.`,
      })
    } catch (error) {
      console.error("Error installing vault seed pack:", error)
      setMessage({ type: "error", text: "Failed to install seed pack." })
    } finally {
      setIsInstallingSeedPack(false)
    }
  }

  const saveCurrentDraft = useCallback(async (announce = false) => {
    if (!isEditing || !selectedNotePath) return false

    const path = selectedNotePath
    const content = latestDraftRef.current
    setSaveState("saving")

    try {
      const response = await fetch("/api/vaults/file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vault: selectedVault,
          path,
          content,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setSaveState("error")
        setMessage({ type: "error", text: payload?.error || "Failed to save note." })
        return false
      }

      const unchangedSinceSaveStart = latestDraftRef.current === content
      setDraftDirty(!unchangedSinceSaveStart)
      setSaveState(unchangedSinceSaveStart ? "saved" : "idle")

      if (announce) {
        setMessage({ type: "success", text: "Note saved." })
      }

      if (unchangedSinceSaveStart) {
        try {
          const refreshed = await fetchVaultFile(selectedVault, path, "preview")
          setFile(refreshed)
        } catch {
          setFile((previous) => {
            if (!previous) return previous
            return {
              ...previous,
              content,
              truncated: false,
              mtime: payload?.mtime || previous.mtime,
              size: payload?.size || previous.size,
            }
          })
        }
      }

      return true
    } catch (error) {
      console.error("Error saving note:", error)
      setSaveState("error")
      setMessage({ type: "error", text: "Failed to save note." })
      return false
    }
  }, [fetchVaultFile, isEditing, selectedNotePath, selectedVault])

  useEffect(() => {
    if (!isEditing || !draftDirty) return

    const timeout = window.setTimeout(() => {
      void saveCurrentDraft(false)
    }, 1200)

    return () => window.clearTimeout(timeout)
  }, [draftContent, draftDirty, isEditing, saveCurrentDraft])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "s") return
      if (!isEditing) return
      event.preventDefault()
      void saveCurrentDraft(true)
    }

    window.addEventListener("keydown", handleSaveShortcut)
    return () => window.removeEventListener("keydown", handleSaveShortcut)
  }, [isEditing, saveCurrentDraft])

  const startEditing = async () => {
    if (!selectedNotePath) return

    setIsLoadingFullForEdit(true)
    try {
      const fullFile = await fetchVaultFile(selectedVault, selectedNotePath, "full")
      setFile(fullFile)
      setDraftContent(fullFile.content)
      setDraftDirty(false)
      setSaveState("saved")
      setIsEditing(true)
      setMobileSection("note")
    } catch (error) {
      console.error("Error loading full note for editing:", error)
      setMessage({ type: "error", text: (error as Error).message || "Unable to open editor for this note." })
    } finally {
      setIsLoadingFullForEdit(false)
    }
  }

  const stopEditing = () => {
    if (draftDirty) {
      const shouldDiscard = window.confirm("Discard unsaved changes?")
      if (!shouldDiscard) {
        return
      }
    }
    setIsEditing(false)
    setDraftDirty(false)
    setSaveState("idle")
  }

  const handleSelectFile = (path: string) => {
    if (isEditing && draftDirty && selectedNotePath !== path) {
      const shouldLeave = window.confirm("You have unsaved changes. Continue and discard them?")
      if (!shouldLeave) {
        return
      }
    }

    setSelectedNotePath(path)
    setMobileSection("note")
  }

  const openCreateForm = (suggestedPath?: string) => {
    setShowCreateForm(true)
    setCreatePathInput(suggestedPath || (selectedVault === "joined" ? "orchwiz/Untitled.md" : "Untitled.md"))
    setCreateContentInput("")
    setMobileSection("tree")
  }

  const handleCreateNote = async () => {
    const normalizedPath = normalizePathInput(createPathInput)
    if (!normalizedPath) {
      setMessage({ type: "error", text: "Provide a valid markdown path." })
      return
    }

    if (selectedVault === "joined" && !ensureJoinedNamespace(normalizedPath)) {
      setMessage({ type: "error", text: "Joined vault notes must start with a vault namespace (e.g. orchwiz/...)." })
      return
    }

    try {
      const response = await fetch("/api/vaults/file", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vault: selectedVault,
          path: normalizedPath,
          content: createContentInput || "# New Note\n",
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to create note." })
        return
      }

      setShowCreateForm(false)
      setCreatePathInput("")
      setCreateContentInput("")
      setSelectedNotePath(normalizedPath)
      setMessage({ type: "success", text: "Note created." })
      await loadTree(selectedVault, normalizedPath)
      setMobileSection("note")
    } catch (error) {
      console.error("Error creating note:", error)
      setMessage({ type: "error", text: "Failed to create note." })
    }
  }

  const openRenameForm = (path: string) => {
    setRenameSourcePath(path)
    setRenameTargetPath(path)
    setShowRenameForm(true)
  }

  const handleRenameMove = async () => {
    if (!renameSourcePath) {
      setMessage({ type: "error", text: "No note selected for rename." })
      return
    }

    const normalizedTarget = normalizePathInput(renameTargetPath)
    if (!normalizedTarget) {
      setMessage({ type: "error", text: "Provide a valid destination path." })
      return
    }

    if (selectedVault === "joined" && !ensureJoinedNamespace(normalizedTarget)) {
      setMessage({ type: "error", text: "Joined vault moves must keep a namespace prefix." })
      return
    }

    try {
      const response = await fetch("/api/vaults/file", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vault: selectedVault,
          fromPath: renameSourcePath,
          toPath: normalizedTarget,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to rename note." })
        return
      }

      const movedTo = typeof payload?.toPath === "string" ? payload.toPath : normalizedTarget

      if (selectedNotePath === renameSourcePath) {
        setSelectedNotePath(movedTo)
      }

      setShowRenameForm(false)
      setRenameSourcePath(null)
      setRenameTargetPath("")
      setMessage({ type: "success", text: "Note moved." })
      await loadTree(selectedVault, movedTo)
    } catch (error) {
      console.error("Error renaming note:", error)
      setMessage({ type: "error", text: "Failed to rename note." })
    }
  }

  const handleDelete = async (path: string, mode: VaultDeleteMode = "soft") => {
    const confirmed = window.confirm(
      mode === "soft"
        ? "Move this note to vault trash?"
        : "Permanently delete this note? This cannot be undone.",
    )
    if (!confirmed) return

    try {
      const params = new URLSearchParams({
        vault: selectedVault,
        path,
        mode,
      })
      const response = await fetch(`/api/vaults/file?${params.toString()}`, {
        method: "DELETE",
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ type: "error", text: payload?.error || "Failed to delete note." })
        return
      }

      if (selectedNotePath === path) {
        setSelectedNotePath(null)
        setIsEditing(false)
        setDraftDirty(false)
        setDraftContent("")
        setFile(null)
      }

      setMessage({
        type: "success",
        text: mode === "soft" ? "Note moved to trash." : "Note permanently deleted.",
      })
      await loadTree(selectedVault, null)
    } catch (error) {
      console.error("Error deleting note:", error)
      setMessage({ type: "error", text: "Failed to delete note." })
    }
  }

  const handleOpenResolvedLink = (vaultId: VaultId, path: string) => {
    if (!isVaultId(vaultId)) return

    setSelectedVault(vaultId)
    setSelectedNotePath(path)
    setMobileSection("note")
  }

  const handleCreateFromUnresolvedLink = (target: string) => {
    const suggestedPath = inferCreatePathFromUnresolved(target, selectedVault, selectedNotePath)
    openCreateForm(suggestedPath)
  }

  const saveStatusText = isEditing
    ? saveState === "saving"
      ? "Saving..."
      : saveState === "error"
        ? "Save failed"
        : draftDirty
          ? "Unsaved changes"
          : "Saved"
    : null

  const treePanel = (
    <SurfaceCard className="flex h-[68vh] flex-col gap-3 overflow-hidden">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Vault</label>
          <button
            type="button"
            onClick={() => {
              loadVaultSummaries()
              loadSeedPacks()
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
            if (!isVaultId(nextVault)) return
            setSelectedVault(nextVault)
            setSelectedNotePath(null)
            setMobileSection("tree")
            setIsEditing(false)
            setDraftDirty(false)
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          {vaults.map((vault) => (
            <option key={vault.id} value={vault.id}>
              {vault.label} {vault.exists ? `(${vault.noteCount})` : "(unavailable)"}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreateForm()}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            New Note
          </button>
        </div>

        {seedPackControlsVisible ? (
          <div className="space-y-2 rounded-lg border border-slate-200/80 bg-white/70 p-2.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Seed Pack</p>
              <button
                type="button"
                onClick={() => {
                  loadSeedPacks()
                }}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300"
              >
                Refresh
              </button>
            </div>
            <select
              value={selectedSeedPackId}
              onChange={(event) => setSelectedSeedPackId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/[0.05]"
              disabled={isLoadingSeedPacks || orchwizSeedPacks.length === 0}
            >
              {isLoadingSeedPacks ? (
                <option value="">Loading packs...</option>
              ) : null}
              {!isLoadingSeedPacks && orchwizSeedPacks.length === 0 ? (
                <option value="">No seed packs available</option>
              ) : null}
              {!isLoadingSeedPacks
                ? orchwizSeedPacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.label} ({pack.noteCount})
                    </option>
                  ))
                : null}
            </select>
            <button
              type="button"
              onClick={() => void handleInstallSeedPack()}
              disabled={isInstallingSeedPack || !selectedSeedPackId}
              className="w-full rounded-md bg-slate-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {isInstallingSeedPack ? "Installing..." : "Install Pack"}
            </button>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Installs or refreshes managed notes under <code>00-Inbox/PopeBot</code>.
            </p>
          </div>
        ) : null}

        {selectedVaultSummary?.isPrivate ? (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-200">
            {selectedVaultSummary.encryptedLabel || "Private vault"}
          </p>
        ) : null}
      </div>

      {showCreateForm ? (
        <div className="space-y-2 rounded-lg border border-slate-200/80 bg-white/70 p-2.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
          <p className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Create Note</p>
          <input
            type="text"
            value={createPathInput}
            onChange={(event) => setCreatePathInput(event.target.value)}
            placeholder={selectedVault === "joined" ? "orchwiz/path/to/note.md" : "path/to/note.md"}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/15 dark:bg-white/[0.05]"
          />
          <textarea
            value={createContentInput}
            onChange={(event) => setCreateContentInput(event.target.value)}
            placeholder="# New Note"
            className="h-24 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-white/15 dark:bg-white/[0.05]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNote}
              className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          runSearch()
        }}
      >
        <select
          value={searchMode}
          onChange={(event) => setSearchMode(event.target.value === "lexical" ? "lexical" : "hybrid")}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          <option value="hybrid">Hybrid</option>
          <option value="lexical">Lexical</option>
        </select>
        <select
          value={searchBackend}
          onChange={(event) => {
            const next = event.target.value
            if (next === "vault-local" || next === "data-core-merged") {
              setSearchBackend(next)
              return
            }
            setSearchBackend("auto")
          }}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-800 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
        >
          <option value="auto">Backend: Auto</option>
          <option value="vault-local">Backend: Vault Local</option>
          <option value="data-core-merged">Backend: Data Core Merged</option>
        </select>
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
          <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">This vault path is unavailable. Create your first note to bootstrap it.</p>
        ) : (
          <VaultTree
            nodes={tree}
            selectedPath={selectedNotePath}
            onSelectFile={handleSelectFile}
            onRequestRenameFile={openRenameForm}
            onRequestDeleteFile={(path) => void handleDelete(path, "soft")}
            onRequestNewNoteInFolder={(folderPath) => openCreateForm(inferCreatePathFromFolder(folderPath, selectedVault))}
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
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-100">{result.path}</p>
                  <div className="flex items-center gap-1">
                    {typeof result.score === "number" ? (
                      <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-white/15 dark:text-slate-400">
                        {result.score.toFixed(2)}
                      </span>
                    ) : null}
                    {result.scopeType ? (
                      <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-white/15 dark:text-slate-400">
                        {result.scopeType}
                      </span>
                    ) : null}
                  </div>
                </div>
                {result.excerpt ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-600 dark:text-slate-300">{result.excerpt}</p>
                ) : null}
                {Array.isArray(result.citations) && result.citations.length > 0 ? (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                    citations: {result.citations.map((citation) => citation.id).join(", ")}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  )

  const notePanel = (
    <SurfaceCard className="flex h-[68vh] flex-col gap-3 overflow-hidden">
      <div className="space-y-2 rounded-lg border border-slate-200/80 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {selectedNotePath || "No note selected"}
          </p>
          {saveStatusText ? (
            <span className={`rounded border px-2 py-1 text-[11px] ${saveState === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-200" : "border-slate-300 bg-white text-slate-600 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-300"}`}>
              {saveStatusText}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => void startEditing()}
              disabled={!selectedNotePath || isLoadingFullForEdit}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-200"
            >
              <PenSquare className="h-3.5 w-3.5" />
              {isLoadingFullForEdit ? "Preparing..." : "Edit"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void saveCurrentDraft(true)}
                disabled={!draftDirty || saveState === "saving"}
                className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                type="button"
                onClick={stopEditing}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-200"
              >
                Preview
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => selectedNotePath && openRenameForm(selectedNotePath)}
            disabled={!selectedNotePath}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-200"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Rename/Move
          </button>

          <button
            type="button"
            onClick={() => selectedNotePath && void handleDelete(selectedNotePath, "soft")}
            disabled={!selectedNotePath}
            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Trash
          </button>

          <button
            type="button"
            onClick={() => selectedNotePath && void handleDelete(selectedNotePath, "hard")}
            disabled={!selectedNotePath}
            className="rounded-md border border-rose-500/40 px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-200"
          >
            Hard Delete
          </button>
        </div>

        {showRenameForm ? (
          <div className="space-y-2 rounded-md border border-slate-200/80 bg-white/70 p-2 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Rename / Move</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">From: {renameSourcePath}</p>
            <input
              type="text"
              value={renameTargetPath}
              onChange={(event) => setRenameTargetPath(event.target.value)}
              placeholder="new/path/to/note.md"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/[0.05]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRenameMove()}
                className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-black dark:bg-white dark:text-slate-900"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRenameForm(false)
                  setRenameSourcePath(null)
                  setRenameTargetPath("")
                }}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/[0.08]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isEditing ? (
          <textarea
            value={draftContent}
            onChange={(event) => {
              setDraftContent(event.target.value)
              setDraftDirty(true)
              if (saveState === "saved" || saveState === "error") {
                setSaveState("idle")
              }
            }}
            className="h-full min-h-[52vh] w-full rounded-lg border border-slate-200/80 bg-white/80 p-3 font-mono text-sm text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-100"
          />
        ) : (
          <VaultNotePreview
            file={file}
            isLoading={isLoadingFile}
            error={null}
            onOpenLink={handleOpenResolvedLink}
          />
        )}
      </div>
    </SurfaceCard>
  )

  const linksPanel = (
    <SurfaceCard className="h-[68vh] overflow-auto">
      <VaultLinksPanel
        file={file}
        selectedVaultSummary={selectedVaultSummary}
        onOpenLink={handleOpenResolvedLink}
        onCreateFromUnresolved={handleCreateFromUnresolvedLink}
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

      <div className="hidden gap-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)_320px]">
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
