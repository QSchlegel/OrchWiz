"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import type { CloudProviderConfig } from "@/lib/shipyard/cloud/types"

interface CloudUtilityPanelProps {
  value: CloudProviderConfig
  onChange: (next: CloudProviderConfig) => void
  onSelectedSshKeyFingerprintChange?: (fingerprint: string | null) => void
  disabled?: boolean
}

interface ProviderReadinessResponse {
  providers?: Array<{
    id: string
    displayName: string
    enabled: boolean
    ready: boolean
    checks: Array<{
      key: string
      ok: boolean
      message: string
    }>
  }>
}

interface CredentialStatusResponse {
  configured?: boolean
  credential?: {
    id: string
    updatedAt: string
    summary?: {
      storageMode?: string
      hasSecret?: boolean
    }
  }
}

interface SshKeyRecord {
  id: string
  name: string
  publicKey: string
  fingerprint: string
  createdAt: string
}

interface SshKeysResponse {
  keys?: SshKeyRecord[]
}

interface CloudCatalogResponse {
  catalog?: {
    fetchedAt: string
    regions: Array<{
      id: string
      name: string
      description: string
    }>
    machineTypes: Array<{
      id: string
      name: string
      description: string
      cpu: number
      memoryGb: number
      diskGb: number
      priceHourlyEur: number | null
    }>
    images: Array<{
      id: string
      name: string
      description: string
      type: string
    }>
  }
}

interface EditableFileRecord {
  path: string
  content: string
  updatedAt: string | null
  exists: boolean
}

interface TunnelRecord {
  id: string
  name: string
  status: "stopped" | "starting" | "running" | "failed"
  sshHost: string
  remoteHost: string
  localPort: number
  lastError: string | null
  updatedAt: string
}

interface TunnelListResponse {
  tunnels?: TunnelRecord[]
}

interface GeneratedSshKeyResponse {
  key?: SshKeyRecord
  oneTimeDownload?: {
    fileName: string
    privateKey: string
  }
  providerSubmission?: {
    payload?: {
      name: string
      public_key: string
    }
  }
}

function fileNameFromPath(path: string): string {
  const parts = path.split("/")
  return parts[parts.length - 1] || path
}

function parseNumberInput(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

export function CloudUtilityPanel({
  value,
  onChange,
  onSelectedSshKeyFingerprintChange,
  disabled = false,
}: CloudUtilityPanelProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "info" | "error" | "success"; text: string } | null>(null)

  const [providers, setProviders] = useState<NonNullable<ProviderReadinessResponse["providers"]>>([])
  const [credentialConfigured, setCredentialConfigured] = useState(false)
  const [credentialUpdatedAt, setCredentialUpdatedAt] = useState<string | null>(null)
  const [credentialToken, setCredentialToken] = useState("")

  const [sshKeys, setSshKeys] = useState<SshKeyRecord[]>([])
  const [newSshKeyName, setNewSshKeyName] = useState("")
  const [latestOneTimePrivateKey, setLatestOneTimePrivateKey] = useState<{
    fileName: string
    privateKey: string
    providerPayload: {
      name: string
      public_key: string
    } | null
  } | null>(null)

  const [catalog, setCatalog] = useState<CloudCatalogResponse["catalog"] | null>(null)

  const [files, setFiles] = useState<EditableFileRecord[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState("")
  const [generatedBundle, setGeneratedBundle] = useState<Record<string, string>>({})

  const [tunnels, setTunnels] = useState<TunnelRecord[]>([])
  const [newTunnelSshHost, setNewTunnelSshHost] = useState("")
  const [newTunnelRemoteHost, setNewTunnelRemoteHost] = useState("")

  const selectedFile = useMemo(() => {
    if (!selectedFilePath) return null
    return files.find((file) => file.path === selectedFilePath) || null
  }, [files, selectedFilePath])

  const refreshProviders = useCallback(async () => {
    const response = await fetch("/api/ship-yard/cloud/providers")
    if (!response.ok) {
      throw new Error(`Providers load failed: HTTP ${response.status}`)
    }
    const payload = (await response.json()) as ProviderReadinessResponse
    setProviders(payload.providers || [])
  }, [])

  const refreshCredentials = useCallback(async () => {
    const response = await fetch("/api/ship-yard/cloud/providers/hetzner/credentials")
    if (!response.ok) {
      throw new Error(`Credentials load failed: HTTP ${response.status}`)
    }
    const payload = (await response.json()) as CredentialStatusResponse
    setCredentialConfigured(Boolean(payload.configured))
    setCredentialUpdatedAt(payload.credential?.updatedAt || null)
  }, [])

  const refreshSshKeys = useCallback(async () => {
    const response = await fetch("/api/ship-yard/cloud/providers/hetzner/ssh-keys")
    if (!response.ok) {
      throw new Error(`SSH keys load failed: HTTP ${response.status}`)
    }
    const payload = (await response.json()) as SshKeysResponse
    const keys = payload.keys || []
    setSshKeys(keys)

    if (!value.sshKeyId && keys.length > 0) {
      onChange({
        ...value,
        sshKeyId: keys[0].id,
      })
    }
  }, [onChange, value])

  const refreshTunnels = useCallback(async () => {
    const response = await fetch("/api/ship-yard/cloud/providers/hetzner/tunnels")
    if (!response.ok) {
      throw new Error(`Tunnels load failed: HTTP ${response.status}`)
    }
    const payload = (await response.json()) as TunnelListResponse
    setTunnels(payload.tunnels || [])
  }, [])

  const refreshFiles = useCallback(async () => {
    const response = await fetch("/api/ship-yard/cloud/providers/hetzner/files")
    if (!response.ok) {
      throw new Error(`Files load failed: HTTP ${response.status}`)
    }
    const payload = (await response.json()) as { files?: EditableFileRecord[] }
    const loaded = payload.files || []
    setFiles(loaded)
    if (loaded.length > 0 && !selectedFilePath) {
      setSelectedFilePath(loaded[0].path)
      setEditorContent(loaded[0].content)
    }
  }, [selectedFilePath])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    try {
      await Promise.all([
        refreshProviders(),
        refreshCredentials(),
        refreshSshKeys(),
        refreshTunnels(),
        refreshFiles(),
      ])
      setMessage(null)
    } catch (error) {
      setMessage({
        type: "error",
        text: (error as Error).message || "Failed to load cloud utility data",
      })
    } finally {
      setIsLoading(false)
    }
  }, [refreshCredentials, refreshFiles, refreshProviders, refreshSshKeys, refreshTunnels])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  useEffect(() => {
    if (!selectedFile) {
      return
    }

    setEditorContent(selectedFile.content)
  }, [selectedFile])

  const selectedSshKey = useMemo(
    () => sshKeys.find((key) => key.id === value.sshKeyId) || null,
    [sshKeys, value.sshKeyId],
  )

  useEffect(() => {
    onSelectedSshKeyFingerprintChange?.(selectedSshKey?.fingerprint || null)
  }, [onSelectedSshKeyFingerprintChange, selectedSshKey])

  const handleSaveCredentials = async () => {
    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/credentials", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: credentialToken,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      setCredentialToken("")
      await refreshCredentials()
      setMessage({ type: "success", text: "Hetzner API token saved." })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to save credentials" })
    }
  }

  const handleDeleteCredentials = async () => {
    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/credentials", {
        method: "DELETE",
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      await refreshCredentials()
      setMessage({ type: "success", text: "Hetzner API token removed." })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to delete credentials" })
    }
  }

  const handleGenerateSshKey = async () => {
    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/ssh-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newSshKeyName,
        }),
      })

      const payload = (await response.json()) as GeneratedSshKeyResponse & { error?: string }
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      await refreshSshKeys()
      if (payload.key?.id) {
        onChange({
          ...value,
          sshKeyId: payload.key.id,
        })
      }

      setLatestOneTimePrivateKey(
        payload.oneTimeDownload
          ? {
              fileName: payload.oneTimeDownload.fileName,
              privateKey: payload.oneTimeDownload.privateKey,
              providerPayload: payload.providerSubmission?.payload || null,
            }
          : null,
      )
      setMessage({ type: "success", text: "SSH key generated. Download the private key now." })
      setNewSshKeyName("")
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to generate SSH key" })
    }
  }

  const handleDownloadOneTimePrivateKey = () => {
    if (!latestOneTimePrivateKey) return
    const blob = new Blob([latestOneTimePrivateKey.privateKey], { type: "application/x-pem-file" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = latestOneTimePrivateKey.fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const handleLoadCatalog = async () => {
    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/catalog")
      const payload = (await response.json()) as CloudCatalogResponse & { error?: string }
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      setCatalog(payload.catalog || null)
      setMessage({ type: "success", text: "Hetzner catalog loaded." })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to load catalog" })
    }
  }

  const handleRenderFiles = async () => {
    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/files/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cloudProvider: value,
          sshKeyId: value.sshKeyId,
        }),
      })
      const payload = (await response.json()) as { files?: Array<{ path: string; content: string }>; error?: string }
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      const bundle = Object.fromEntries((payload.files || []).map((file) => [file.path, file.content]))
      setGeneratedBundle(bundle)
      setMessage({ type: "success", text: "Terraform/Ansible files rendered. Use Reset to Generated to apply to editor." })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to render files" })
    }
  }

  const handleSaveSelectedFile = async () => {
    if (!selectedFilePath) return

    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/files", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: [
            {
              path: selectedFilePath,
              content: editorContent,
            },
          ],
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      await refreshFiles()
      setMessage({ type: "success", text: `Saved ${fileNameFromPath(selectedFilePath)}.` })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to save file" })
    }
  }

  const handleResetSelectedFileToGenerated = () => {
    if (!selectedFilePath) return
    const generated = generatedBundle[selectedFilePath]
    if (!generated) {
      setMessage({ type: "info", text: "Render files first, then reset from generated output." })
      return
    }
    setEditorContent(generated)
    setMessage({ type: "info", text: `Editor reset from generated ${fileNameFromPath(selectedFilePath)}.` })
  }

  const handleCreateOrUpdateTunnel = async () => {
    try {
      setMessage(null)
      const response = await fetch("/api/ship-yard/cloud/providers/hetzner/tunnels", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "kubernetes-api",
          localHost: "127.0.0.1",
          localPort: value.tunnelPolicy.localPort,
          remoteHost: newTunnelRemoteHost,
          remotePort: 6443,
          sshHost: newTunnelSshHost,
          sshPort: 22,
          sshUser: "root",
          sshKeyId: value.sshKeyId,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      await refreshTunnels()
      setMessage({ type: "success", text: "Tunnel definition saved." })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || "Failed to save tunnel" })
    }
  }

  const handleTunnelAction = async (tunnelId: string, action: "start" | "stop" | "restart" | "ensure") => {
    try {
      setMessage(null)
      const response = await fetch(`/api/ship-yard/cloud/providers/hetzner/tunnels/${tunnelId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`)
      }

      await refreshTunnels()
      setMessage({ type: "success", text: `Tunnel action ${action} complete.` })
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message || `Tunnel action ${action} failed` })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="readout text-cyan-700 dark:text-cyan-300">Cloud Utility (Hetzner First)</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Generate SSH keys, sync catalog, render/edit Terraform + Ansible, and manage Kubernetes API tunnels.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={disabled || isLoading}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/80 px-2 py-1 text-xs text-slate-700 hover:bg-white disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div
          className={`rounded-md border px-2 py-1.5 text-xs ${
            message.type === "error"
              ? "border-rose-400/35 bg-rose-500/10 text-rose-700 dark:text-rose-200"
              : message.type === "success"
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
              : "border-slate-300/70 bg-white/70 text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-2 text-xs dark:border-white/12 dark:bg-white/[0.04]">
          <p className="font-medium text-slate-800 dark:text-slate-100">Provider Readiness</p>
          {providers.length === 0 ? (
            <p className="mt-1 text-slate-600 dark:text-slate-300">No provider status available yet.</p>
          ) : (
            <div className="mt-1 space-y-1">
              {providers.map((provider) => (
                <div key={provider.id}>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    {provider.displayName} {provider.ready ? "(ready)" : "(missing tools)"}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">Checks: {provider.checks.filter((c) => c.ok).length}/{provider.checks.length}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-2 text-xs dark:border-white/12 dark:bg-white/[0.04]">
          <p className="font-medium text-slate-800 dark:text-slate-100">Credentials</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {credentialConfigured ? `Configured${credentialUpdatedAt ? ` (${new Date(credentialUpdatedAt).toLocaleString()})` : ""}` : "Not configured"}
          </p>
          <input
            type="password"
            value={credentialToken}
            onChange={(event) => setCredentialToken(event.target.value)}
            placeholder="Hetzner API token"
            disabled={disabled}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => void handleSaveCredentials()}
              disabled={disabled || credentialToken.trim().length === 0}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteCredentials()}
              disabled={disabled || !credentialConfigured}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-2 text-xs dark:border-white/12 dark:bg-white/[0.04]">
          <p className="font-medium text-slate-800 dark:text-slate-100">SSH Keys</p>
          <select
            value={value.sshKeyId || ""}
            onChange={(event) =>
              onChange({
                ...value,
                sshKeyId: event.target.value || null,
              })
            }
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          >
            <option value="">Select SSH key</option>
            {sshKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.name} ({key.fingerprint})
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <input
              type="text"
              value={newSshKeyName}
              onChange={(event) => setNewSshKeyName(event.target.value)}
              placeholder="new-key-name"
              disabled={disabled}
              className="min-w-[9rem] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => void handleGenerateSshKey()}
              disabled={disabled}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Generate
            </button>
          </div>
          {selectedSshKey && (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Selected fingerprint: {selectedSshKey.fingerprint}</p>
          )}
          {latestOneTimePrivateKey && (
            <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-200">
              <p>Private key is shown once. Download now.</p>
              <button
                type="button"
                onClick={handleDownloadOneTimePrivateKey}
                className="mt-1 rounded-md border border-amber-500/40 bg-transparent px-2 py-0.5 text-[11px]"
              >
                Download {latestOneTimePrivateKey.fileName}
              </button>
              {latestOneTimePrivateKey.providerPayload && (
                <pre className="mt-1 overflow-x-auto rounded border border-amber-500/30 bg-amber-500/5 p-1 text-[10px]">
{JSON.stringify(latestOneTimePrivateKey.providerPayload, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-2 text-xs dark:border-white/12 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-slate-800 dark:text-slate-100">Hetzner Catalog + Cluster Sizing</p>
            <button
              type="button"
              onClick={() => void handleLoadCatalog()}
              disabled={disabled || !credentialConfigured}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Load Catalog
            </button>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Cluster Name</span>
              <input
                type="text"
                value={value.cluster.clusterName}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      clusterName: event.target.value,
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Network CIDR</span>
              <input
                type="text"
                value={value.cluster.networkCidr}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      networkCidr: event.target.value,
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Location</span>
              <select
                value={value.cluster.location}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      location: event.target.value,
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              >
                {catalog?.regions?.length ? (
                  catalog.regions.map((region) => (
                    <option key={region.id} value={region.name}>
                      {region.name} ({region.description})
                    </option>
                  ))
                ) : (
                  <option value={value.cluster.location}>{value.cluster.location}</option>
                )}
              </select>
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Image</span>
              <select
                value={value.cluster.image}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      image: event.target.value,
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              >
                {catalog?.images?.length ? (
                  catalog.images.map((image) => (
                    <option key={image.id} value={image.name}>
                      {image.name} ({image.type})
                    </option>
                  ))
                ) : (
                  <option value={value.cluster.image}>{value.cluster.image}</option>
                )}
              </select>
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Control Plane Type</span>
              <select
                value={value.cluster.controlPlane.machineType}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      controlPlane: {
                        ...value.cluster.controlPlane,
                        machineType: event.target.value,
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              >
                {catalog?.machineTypes?.length ? (
                  catalog.machineTypes.map((machine) => (
                    <option key={machine.id} value={machine.name}>
                      {machine.name} ({machine.cpu}C / {machine.memoryGb}G)
                    </option>
                  ))
                ) : (
                  <option value={value.cluster.controlPlane.machineType}>{value.cluster.controlPlane.machineType}</option>
                )}
              </select>
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Workers Type</span>
              <select
                value={value.cluster.workers.machineType}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      workers: {
                        ...value.cluster.workers,
                        machineType: event.target.value,
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              >
                {catalog?.machineTypes?.length ? (
                  catalog.machineTypes.map((machine) => (
                    <option key={machine.id} value={machine.name}>
                      {machine.name} ({machine.cpu}C / {machine.memoryGb}G)
                    </option>
                  ))
                ) : (
                  <option value={value.cluster.workers.machineType}>{value.cluster.workers.machineType}</option>
                )}
              </select>
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Control Plane Count</span>
              <input
                type="number"
                min={1}
                value={value.cluster.controlPlane.count}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      controlPlane: {
                        ...value.cluster.controlPlane,
                        count: Math.max(1, parseNumberInput(event.target.value, value.cluster.controlPlane.count)),
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Worker Count</span>
              <input
                type="number"
                min={1}
                value={value.cluster.workers.count}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cluster: {
                      ...value.cluster,
                      workers: {
                        ...value.cluster.workers,
                        count: Math.max(1, parseNumberInput(event.target.value, value.cluster.workers.count)),
                      },
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </label>
            <label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">K3s Channel</span>
              <input
                type="text"
                value={value.k3s.channel}
                onChange={(event) =>
                  onChange({
                    ...value,
                    k3s: {
                      ...value.k3s,
                      channel: event.target.value,
                    },
                  })
                }
                disabled={disabled}
                className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              />
            </label>
          </div>
          <label className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={value.k3s.disableTraefik}
              onChange={(event) =>
                onChange({
                  ...value,
                  k3s: {
                    ...value.k3s,
                    disableTraefik: event.target.checked,
                  },
                })
              }
              disabled={disabled}
            />
            Disable Traefik
          </label>
        </div>

        <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-2 text-xs dark:border-white/12 dark:bg-white/[0.04]">
          <p className="font-medium text-slate-800 dark:text-slate-100">Managed Tunnel Policy</p>
          <label className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={value.tunnelPolicy.manage}
              onChange={(event) =>
                onChange({
                  ...value,
                  tunnelPolicy: {
                    ...value.tunnelPolicy,
                    manage: event.target.checked,
                  },
                })
              }
              disabled={disabled}
            />
            Manage Kubernetes API tunnel automatically
          </label>
          <label className="mt-1 block">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Local Port</span>
            <input
              type="number"
              min={1024}
              max={65535}
              value={value.tunnelPolicy.localPort}
              onChange={(event) =>
                onChange({
                  ...value,
                  tunnelPolicy: {
                    ...value.tunnelPolicy,
                    localPort: parseNumberInput(event.target.value, value.tunnelPolicy.localPort),
                  },
                })
              }
              disabled={disabled}
              className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
          </label>

          <div className="mt-2 rounded border border-slate-300/70 bg-white/70 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.03]">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Create tunnel definition</p>
            <input
              type="text"
              value={newTunnelSshHost}
              onChange={(event) => setNewTunnelSshHost(event.target.value)}
              placeholder="Control-plane public IP"
              disabled={disabled}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <input
              type="text"
              value={newTunnelRemoteHost}
              onChange={(event) => setNewTunnelRemoteHost(event.target.value)}
              placeholder="Control-plane private IP"
              disabled={disabled}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
            />
            <button
              type="button"
              onClick={() => void handleCreateOrUpdateTunnel()}
              disabled={disabled || !value.sshKeyId || newTunnelSshHost.trim().length === 0 || newTunnelRemoteHost.trim().length === 0}
              className="mt-1 rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Save Tunnel
            </button>
          </div>

          <div className="mt-2 space-y-1">
            {tunnels.length === 0 ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">No tunnels yet.</p>
            ) : (
              tunnels.map((tunnel) => (
                <div key={tunnel.id} className="rounded border border-slate-300/70 bg-white/75 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.03]">
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {tunnel.name} ({tunnel.status})
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {tunnel.sshHost} {"->"} {tunnel.remoteHost} (local {tunnel.localPort})
                  </p>
                  {tunnel.lastError && (
                    <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-300">{tunnel.lastError}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(["start", "stop", "restart", "ensure"] as const).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void handleTunnelAction(tunnel.id, action)}
                        disabled={disabled}
                        className="rounded-md border border-slate-300/70 bg-white px-1.5 py-0.5 text-[10px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-2 text-xs dark:border-white/12 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-slate-800 dark:text-slate-100">Terraform + Ansible Files</p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => void handleRenderFiles()}
              disabled={disabled || !value.sshKeyId}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Render
            </button>
            <button
              type="button"
              onClick={() => void refreshFiles()}
              disabled={disabled}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={handleResetSelectedFileToGenerated}
              disabled={disabled || !selectedFilePath}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Reset To Generated
            </button>
            <button
              type="button"
              onClick={() => void handleSaveSelectedFile()}
              disabled={disabled || !selectedFilePath}
              className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
            >
              Save File
            </button>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-1">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedFilePath(file.path)}
                className={`block w-full rounded border px-2 py-1 text-left text-[11px] ${
                  selectedFilePath === file.path
                    ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200"
                    : "border-slate-300/70 bg-white text-slate-700 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-200"
                }`}
              >
                {fileNameFromPath(file.path)}
              </button>
            ))}
          </div>
          <textarea
            value={editorContent}
            onChange={(event) => setEditorContent(event.target.value)}
            rows={18}
            disabled={disabled || !selectedFilePath}
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-2 font-mono text-[11px] text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  )
}
