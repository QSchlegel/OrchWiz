"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { CheckCircle2, Loader2, Send, TestTube2, Trash2, Webhook } from "lucide-react"
import { buildUiError, isWalletEnclaveCode, walletEnclaveGuidance } from "@/lib/api-errors"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import { EmptyState, InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import type { BridgeConnectionProvider, BridgeDispatchStatus, BridgeDispatchSource } from "@prisma/client"

type BridgeConnectionPurpose = "bridge_group" | "xo_direct" | "custom"

interface ShipRecord {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  nodeId: string
  nodeType: "local" | "cloud" | "hybrid"
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
}

interface ConnectionRecord {
  id: string
  deploymentId: string
  provider: BridgeConnectionProvider
  name: string
  destination: string
  enabled: boolean
  autoRelay: boolean
  config: Record<string, unknown>
  credentials: {
    storageMode: "encrypted" | "plaintext-fallback" | "unknown"
    hasCredentials: boolean
  }
  lastDeliveryAt: string | null
  lastDeliveryStatus: BridgeDispatchStatus | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

interface DeliveryRecord {
  id: string
  deploymentId: string
  connectionId: string
  connectionName: string
  provider: BridgeConnectionProvider
  destination: string
  source: BridgeDispatchSource
  status: BridgeDispatchStatus
  message: string
  attempts: number
  nextAttemptAt: string | null
  providerMessageId: string | null
  lastError: string | null
  deliveredAt: string | null
  createdAt: string
  updatedAt: string
}

interface ConnectionsResponse {
  deploymentId: string
  connections: ConnectionRecord[]
  deliveries: DeliveryRecord[]
  summary: {
    total: number
    enabled: number
    autoRelay: number
    providers: {
      telegram: { total: number; enabled: number }
      discord: { total: number; enabled: number }
      whatsapp: { total: number; enabled: number }
    }
    lastDeliveryAt: string | null
    lastDeliveryStatus: BridgeDispatchStatus | null
  }
}

interface CreateFormState {
  provider: BridgeConnectionProvider
  name: string
  destination: string
  enabled: boolean
  autoRelay: boolean
  purpose: BridgeConnectionPurpose
  configText: string
  botToken: string
  webhookUrl: string
  accessToken: string
  phoneNumberId: string
}

interface EditDraftState {
  name: string
  destination: string
  enabled: boolean
  autoRelay: boolean
  purpose: BridgeConnectionPurpose
  configText: string
  botToken: string
  webhookUrl: string
  accessToken: string
  phoneNumberId: string
}

interface Notice {
  type: "success" | "error" | "info"
  text: string
  code?: string | null
  suggestedCommands?: string[]
}

const PROVIDER_LABELS: Record<BridgeConnectionProvider, string> = {
  telegram: "Telegram",
  discord: "Discord",
  whatsapp: "WhatsApp",
}

const STATUS_LABELS: Record<BridgeDispatchStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
}

function parsePurpose(value: unknown): BridgeConnectionPurpose {
  if (value === "bridge_group" || value === "xo_direct" || value === "custom") {
    return value
  }
  return "custom"
}

function configWithPurpose(
  config: Record<string, unknown>,
  purpose: BridgeConnectionPurpose,
): Record<string, unknown> {
  if (purpose === "custom") {
    const next = { ...config }
    delete next.purpose
    return next
  }

  return {
    ...config,
    purpose,
  }
}

function defaultCreateFormState(): CreateFormState {
  return {
    provider: "telegram",
    name: "",
    destination: "",
    enabled: true,
    autoRelay: true,
    purpose: "bridge_group",
    configText: "{}",
    botToken: "",
    webhookUrl: "",
    accessToken: "",
    phoneNumberId: "",
  }
}

function parseConfigJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {}
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config must be a JSON object.")
  }

  return parsed as Record<string, unknown>
}

function patchConfigTextPurpose(raw: string, purpose: BridgeConnectionPurpose): string {
  try {
    const config = configWithPurpose(parseConfigJson(raw), purpose)
    return JSON.stringify(config, null, 2)
  } catch {
    return raw
  }
}

function buildCredentialsPayload(
  provider: BridgeConnectionProvider,
  state: Pick<CreateFormState, "botToken" | "webhookUrl" | "accessToken" | "phoneNumberId">,
) {
  if (provider === "telegram") {
    return { botToken: state.botToken.trim() }
  }

  if (provider === "discord") {
    return { webhookUrl: state.webhookUrl.trim() }
  }

  return {
    accessToken: state.accessToken.trim(),
    phoneNumberId: state.phoneNumberId.trim(),
  }
}

function destinationPlaceholderForProvider(provider: BridgeConnectionProvider): string {
  if (provider === "telegram") {
    return "chat id (for example: -100123456789)"
  }

  if (provider === "discord") {
    return "destination label (for example: #bridge-updates)"
  }

  return "recipient phone (E.164, for example: +15551234567)"
}

function draftFromConnection(connection: ConnectionRecord): EditDraftState {
  const purpose = parsePurpose(connection.config?.purpose)

  return {
    name: connection.name,
    destination: connection.destination,
    enabled: connection.enabled,
    autoRelay: connection.autoRelay,
    purpose,
    configText: JSON.stringify(connection.config || {}, null, 2),
    botToken: "",
    webhookUrl: "",
    accessToken: "",
    phoneNumberId: "",
  }
}

export default function BridgeConnectionsPage() {
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()

  const [ships, setShips] = useState<ShipRecord[]>([])
  const [isLoadingShips, setIsLoadingShips] = useState(true)

  const [connections, setConnections] = useState<ConnectionRecord[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  const [summary, setSummary] = useState<ConnectionsResponse["summary"] | null>(null)
  const [isLoadingConnections, setIsLoadingConnections] = useState(false)

  const [createForm, setCreateForm] = useState<CreateFormState>(defaultCreateFormState)
  const [isCreating, setIsCreating] = useState(false)
  const [savingConnectionId, setSavingConnectionId] = useState<string | null>(null)
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null)
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, EditDraftState>>({})
  const [manualMessage, setManualMessage] = useState("")
  const [manualConnectionIds, setManualConnectionIds] = useState<string[]>([])
  const [isDispatchingManual, setIsDispatchingManual] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const selectedShip = useMemo(
    () => ships.find((ship) => ship.id === selectedShipDeploymentId) || null,
    [selectedShipDeploymentId, ships],
  )

  const loadShips = useCallback(async () => {
    setIsLoadingShips(true)
    try {
      const response = await fetch("/api/ships")
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = await response.json()
      const parsed = Array.isArray(payload) ? (payload as ShipRecord[]) : []
      setShips(parsed)

      if (parsed.length === 0) {
        setSelectedShipDeploymentId(null)
      } else if (!selectedShipDeploymentId || !parsed.some((ship) => ship.id === selectedShipDeploymentId)) {
        setSelectedShipDeploymentId(parsed[0].id)
      }
    } catch (error) {
      console.error("Failed to load ship list:", error)
      setNotice({ type: "error", text: "Unable to load ships." })
    } finally {
      setIsLoadingShips(false)
    }
  }, [selectedShipDeploymentId, setSelectedShipDeploymentId])

  const loadConnections = useCallback(async () => {
    if (!selectedShipDeploymentId) {
      setConnections([])
      setDeliveries([])
      setSummary(null)
      return
    }

    setIsLoadingConnections(true)
    try {
      const response = await fetch(
        `/api/bridge/connections?deploymentId=${selectedShipDeploymentId}&deliveriesTake=40`,
      )
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as ConnectionsResponse
      const nextConnections = Array.isArray(payload.connections) ? payload.connections : []
      setConnections(nextConnections)
      setDeliveries(Array.isArray(payload.deliveries) ? payload.deliveries : [])
      setSummary(payload.summary || null)
      setDrafts((current) => {
        const next: Record<string, EditDraftState> = {}
        for (const connection of nextConnections) {
          next[connection.id] = current[connection.id] || draftFromConnection(connection)
        }
        return next
      })
      setNotice(null)
    } catch (error) {
      console.error("Failed to load bridge connections:", error)
      setNotice({ type: "error", text: "Unable to load bridge connections." })
    } finally {
      setIsLoadingConnections(false)
    }
  }, [selectedShipDeploymentId])

  useEffect(() => {
    void loadShips()
  }, [loadShips])

  useEffect(() => {
    void loadConnections()
  }, [loadConnections])

  const handleCreate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!selectedShipDeploymentId || isCreating) {
        return
      }

      setIsCreating(true)
      try {
        const config = configWithPurpose(parseConfigJson(createForm.configText), createForm.purpose)
        const credentials = buildCredentialsPayload(createForm.provider, createForm)

        const response = await fetch("/api/bridge/connections", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deploymentId: selectedShipDeploymentId,
            provider: createForm.provider,
            name: createForm.name.trim(),
            destination: createForm.destination.trim(),
            enabled: createForm.enabled,
            autoRelay: createForm.autoRelay,
            config,
            credentials,
          }),
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const ui = buildUiError(payload, response.status, `HTTP ${response.status}`)
          setNotice({
            type: "error",
            text: ui.text,
            code: ui.code,
            suggestedCommands: ui.suggestedCommands,
          })
          return
        }

        setCreateForm(defaultCreateFormState())
        setNotice({ type: "success", text: "Connection created." })
        await loadConnections()
      } catch (error) {
        console.error("Failed to create bridge connection:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to create connection.",
        })
      } finally {
        setIsCreating(false)
      }
    },
    [createForm, isCreating, loadConnections, selectedShipDeploymentId],
  )

  const handleSaveDraft = useCallback(
    async (connection: ConnectionRecord) => {
      const draft = drafts[connection.id]
      if (!draft || savingConnectionId) {
        return
      }

      setSavingConnectionId(connection.id)
      try {
        const payload: Record<string, unknown> = {
          name: draft.name.trim(),
          destination: draft.destination.trim(),
          enabled: draft.enabled,
          autoRelay: draft.autoRelay,
          config: configWithPurpose(parseConfigJson(draft.configText), draft.purpose),
        }

        if (connection.provider === "telegram" && draft.botToken.trim()) {
          payload.credentials = { botToken: draft.botToken.trim() }
        } else if (connection.provider === "discord" && draft.webhookUrl.trim()) {
          payload.credentials = { webhookUrl: draft.webhookUrl.trim() }
        } else if (
          connection.provider === "whatsapp" &&
          draft.accessToken.trim() &&
          draft.phoneNumberId.trim()
        ) {
          payload.credentials = {
            accessToken: draft.accessToken.trim(),
            phoneNumberId: draft.phoneNumberId.trim(),
          }
        }

        const response = await fetch(`/api/bridge/connections/${connection.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })
        const parsed = await response.json().catch(() => ({}))
        if (!response.ok) {
          const ui = buildUiError(parsed, response.status, `HTTP ${response.status}`)
          setNotice({
            type: "error",
            text: ui.text,
            code: ui.code,
            suggestedCommands: ui.suggestedCommands,
          })
          return
        }

        setNotice({ type: "success", text: `${connection.name} updated.` })
        await loadConnections()
      } catch (error) {
        console.error("Failed to update bridge connection:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to update connection.",
        })
      } finally {
        setSavingConnectionId(null)
      }
    },
    [drafts, loadConnections, savingConnectionId],
  )

  const handleDelete = useCallback(
    async (connectionId: string) => {
      if (deletingConnectionId) {
        return
      }

      if (!confirm("Delete this bridge connection and its delivery history?")) {
        return
      }

      setDeletingConnectionId(connectionId)
      try {
        const response = await fetch(`/api/bridge/connections/${connectionId}`, {
          method: "DELETE",
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
        }

        setNotice({ type: "success", text: "Connection deleted." })
        await loadConnections()
      } catch (error) {
        console.error("Failed to delete bridge connection:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to delete connection.",
        })
      } finally {
        setDeletingConnectionId(null)
      }
    },
    [deletingConnectionId, loadConnections],
  )

  const handleTest = useCallback(
    async (connectionId: string) => {
      if (testingConnectionId) {
        return
      }

      setTestingConnectionId(connectionId)
      try {
        const response = await fetch(`/api/bridge/connections/${connectionId}/test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: "Bridge Ops connection test",
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
        }

        setNotice({
          type: payload?.ok ? "success" : "info",
          text: payload?.ok ? "Test dispatch completed." : "Test dispatch queued; check delivery timeline.",
        })
        await loadConnections()
      } catch (error) {
        console.error("Failed to test bridge connection:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to test connection.",
        })
      } finally {
        setTestingConnectionId(null)
      }
    },
    [loadConnections, testingConnectionId],
  )

  const handleManualDispatch = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!selectedShipDeploymentId || !manualMessage.trim() || isDispatchingManual) {
        return
      }

      setIsDispatchingManual(true)
      try {
        const response = await fetch("/api/bridge/connections/dispatch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deploymentId: selectedShipDeploymentId,
            message: manualMessage.trim(),
            ...(manualConnectionIds.length > 0 ? { connectionIds: manualConnectionIds } : {}),
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
        }

        setNotice({
          type: "success",
          text: `Manual dispatch queued for ${payload?.queued || 0} connection(s).`,
        })
        setManualMessage("")
        await loadConnections()
      } catch (error) {
        console.error("Manual patch-through failed:", error)
        setNotice({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to dispatch message.",
        })
      } finally {
        setIsDispatchingManual(false)
      }
    },
    [isDispatchingManual, loadConnections, manualConnectionIds, manualMessage, selectedShipDeploymentId],
  )

  const enabledConnections = useMemo(
    () => connections.filter((connection) => connection.enabled),
    [connections],
  )

  return (
    <PageLayout
      title="Bridge Connections"
      description="Configure Telegram, Discord, and WhatsApp patch-through channels for COU-DEA outbound relay."
    >
      <div className="space-y-4">
        {notice ? (
          <InlineNotice variant={notice.type}>
            <div className="space-y-2">
              <p>{notice.text}</p>
              {notice.code ? (
                <p className="text-xs">
                  Code: <code>{notice.code}</code>
                </p>
              ) : null}
              {notice.code && isWalletEnclaveCode(notice.code) ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Next steps</p>
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    {walletEnclaveGuidance(notice.code).steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {notice.suggestedCommands && notice.suggestedCommands.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Suggested commands</p>
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    {notice.suggestedCommands.map((command) => (
                      <li key={command}>
                        <code>{command}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </InlineNotice>
        ) : null}

        <SurfaceCard>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-slate-600 dark:text-slate-300">Ship deployment</label>
            {isLoadingShips ? (
              <span className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading ships
              </span>
            ) : (
              <select
                value={selectedShipDeploymentId || ""}
                onChange={(event) => setSelectedShipDeploymentId(event.target.value || null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
              >
                {ships.map((ship) => (
                  <option key={ship.id} value={ship.id}>
                    {ship.name} ({ship.status})
                  </option>
                ))}
              </select>
            )}
            {selectedShip ? (
              <span className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-700 dark:text-cyan-200">
                {selectedShip.nodeType.toUpperCase()} • {selectedShip.nodeId}
              </span>
            ) : null}
          </div>
        </SurfaceCard>

        {!selectedShipDeploymentId ? (
          <EmptyState
            title="No ship selected"
            description="Create a ship deployment in Ship Yard first, then configure Bridge connections."
          />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <SurfaceCard>
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                  New Connection
                </h2>
                <form onSubmit={handleCreate} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-slate-600 dark:text-slate-300">Provider</span>
                      <select
                        value={createForm.provider}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            provider: event.target.value as BridgeConnectionProvider,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                      >
                        <option value="telegram">Telegram</option>
                        <option value="discord">Discord</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-slate-600 dark:text-slate-300">Connection name</span>
                      <input
                        type="text"
                        value={createForm.name}
                        onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        placeholder="Primary Comms"
                        required
                      />
                    </label>
                  </div>

                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600 dark:text-slate-300">Purpose</span>
                    <select
                      value={createForm.purpose}
                      onChange={(event) => {
                        const purpose = parsePurpose(event.target.value)
                        setCreateForm((current) => ({
                          ...current,
                          purpose,
                          autoRelay: purpose === "xo_direct" ? false : purpose === "bridge_group" ? true : current.autoRelay,
                          configText: patchConfigTextPurpose(current.configText, purpose),
                        }))
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    >
                      <option value="bridge_group">Bridge crew group</option>
                      <option value="xo_direct">XO direct</option>
                      <option value="custom">Custom</option>
                    </select>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Use <span className="font-medium">Bridge crew group</span> for COU auto-relay. Use{" "}
                      <span className="font-medium">XO direct</span> for a private outbound lane.
                    </p>
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600 dark:text-slate-300">Destination</span>
                    <input
                      type="text"
                      value={createForm.destination}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, destination: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                      placeholder={destinationPlaceholderForProvider(createForm.provider)}
                      required
                    />
                  </label>

                  {createForm.provider === "telegram" && (
                    <label className="text-sm">
                      <span className="mb-1 block text-slate-600 dark:text-slate-300">Telegram bot token</span>
                      <input
                        type="password"
                        value={createForm.botToken}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, botToken: event.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        required
                      />
                    </label>
                  )}

                  {createForm.provider === "discord" && (
                    <label className="text-sm">
                      <span className="mb-1 block text-slate-600 dark:text-slate-300">Discord webhook URL</span>
                      <input
                        type="password"
                        value={createForm.webhookUrl}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, webhookUrl: event.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        required
                      />
                    </label>
                  )}

                  {createForm.provider === "whatsapp" && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600 dark:text-slate-300">Meta access token</span>
                        <input
                          type="password"
                          value={createForm.accessToken}
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, accessToken: event.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          required
                        />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-slate-600 dark:text-slate-300">Phone number ID</span>
                        <input
                          type="password"
                          value={createForm.phoneNumberId}
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, phoneNumberId: event.target.value }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          required
                        />
                      </label>
                    </div>
                  )}

                  <label className="text-sm">
                    <span className="mb-1 block text-slate-600 dark:text-slate-300">Config (JSON)</span>
                    <textarea
                      rows={3}
                      value={createForm.configText}
                      onChange={(event) =>
                        setCreateForm((current) => ({ ...current, configText: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    />
                  </label>

                  <div className="flex items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={createForm.enabled}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, enabled: event.target.checked }))
                        }
                      />
                      Enabled
                    </label>
                    <label className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={createForm.autoRelay}
                        onChange={(event) =>
                          setCreateForm((current) => ({ ...current, autoRelay: event.target.checked }))
                        }
                      />
                      Auto relay (COU)
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isCreating}
                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-700 disabled:opacity-60 dark:text-cyan-200"
                  >
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Webhook className="h-4 w-4" />}
                    Create connection
                  </button>
                </form>
              </SurfaceCard>

              <SurfaceCard>
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Manual Patch Through
                </h2>
                <form onSubmit={handleManualDispatch} className="space-y-3">
                  <textarea
                    rows={5}
                    value={manualMessage}
                    onChange={(event) => setManualMessage(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    placeholder="Send manual outbound message via active connectors..."
                  />
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Optional: target specific enabled connectors
                    </p>
                    {enabledConnections.length === 0 ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        No enabled connectors available.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {enabledConnections.map((connection) => (
                          <label
                            key={connection.id}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200/80 bg-white/70 px-2 py-1.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
                          >
                            <input
                              type="checkbox"
                              checked={manualConnectionIds.includes(connection.id)}
                              onChange={(event) =>
                                setManualConnectionIds((current) =>
                                  event.target.checked
                                    ? [...new Set([...current, connection.id])]
                                    : current.filter((entry) => entry !== connection.id),
                                )
                              }
                            />
                            {connection.name} ({PROVIDER_LABELS[connection.provider]})
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isDispatchingManual || !manualMessage.trim()}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-700 disabled:opacity-60 dark:text-emerald-200"
                  >
                    {isDispatchingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Patch through
                  </button>
                </form>
              </SurfaceCard>
            </div>

            <SurfaceCard>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Connections ({summary?.total ?? connections.length})
                </h2>
                {summary ? (
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    Enabled {summary.enabled} • Auto relay {summary.autoRelay}
                  </span>
                ) : null}
              </div>

              {isLoadingConnections ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading connections
                </div>
              ) : connections.length === 0 ? (
                <EmptyState
                  title="No bridge connections yet"
                  description="Create your first Telegram, Discord, or WhatsApp bridge connection above."
                />
              ) : (
                <div className="space-y-3">
                  {connections.map((connection) => {
                    const draft = drafts[connection.id] || draftFromConnection(connection)
                    const isSaving = savingConnectionId === connection.id
                    const isTesting = testingConnectionId === connection.id
                    const isDeleting = deletingConnectionId === connection.id
                    const purposeLabel =
                      draft.purpose === "bridge_group"
                        ? "Bridge group"
                        : draft.purpose === "xo_direct"
                          ? "XO direct"
                          : null

                    return (
                      <div
                        key={connection.id}
                        className="rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {connection.name}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {PROVIDER_LABELS[connection.provider]} • {connection.destination}
                            </p>
                            {purposeLabel ? (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Purpose: {purposeLabel}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-md border border-slate-300/70 px-2 py-1 text-slate-600 dark:border-white/15 dark:text-slate-300">
                              {connection.credentials.storageMode}
                            </span>
                            {connection.lastDeliveryStatus ? (
                              <span className="rounded-md border border-slate-300/70 px-2 py-1 text-slate-600 dark:border-white/15 dark:text-slate-300">
                                Last: {STATUS_LABELS[connection.lastDeliveryStatus]}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [connection.id]: { ...draft, name: event.target.value },
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                          <input
                            type="text"
                            value={draft.destination}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [connection.id]: { ...draft, destination: event.target.value },
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <textarea
                            rows={2}
                            value={draft.configText}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [connection.id]: { ...draft, configText: event.target.value },
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                          />
                          <div className="space-y-2">
                            {connection.provider === "telegram" && (
                              <input
                                type="password"
                                value={draft.botToken}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [connection.id]: { ...draft, botToken: event.target.value },
                                  }))
                                }
                                placeholder="Rotate bot token (optional)"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                              />
                            )}
                            {connection.provider === "discord" && (
                              <input
                                type="password"
                                value={draft.webhookUrl}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [connection.id]: { ...draft, webhookUrl: event.target.value },
                                  }))
                                }
                                placeholder="Rotate webhook URL (optional)"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                              />
                            )}
                            {connection.provider === "whatsapp" && (
                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  type="password"
                                  value={draft.accessToken}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [connection.id]: { ...draft, accessToken: event.target.value },
                                    }))
                                  }
                                  placeholder="Rotate access token (optional)"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                />
                                <input
                                  type="password"
                                  value={draft.phoneNumberId}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [connection.id]: { ...draft, phoneNumberId: event.target.value },
                                    }))
                                  }
                                  placeholder="Rotate phone number ID (optional)"
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                            <label className="inline-flex items-center gap-2">
                              <span>Purpose</span>
                              <select
                                value={draft.purpose}
                                onChange={(event) => {
                                  const purpose = parsePurpose(event.target.value)
                                  setDrafts((current) => ({
                                    ...current,
                                    [connection.id]: {
                                      ...draft,
                                      purpose,
                                      autoRelay: purpose === "xo_direct" ? false : purpose === "bridge_group" ? true : draft.autoRelay,
                                      configText: patchConfigTextPurpose(draft.configText, purpose),
                                    },
                                  }))
                                }}
                                className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-xs text-slate-700 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200"
                              >
                                <option value="bridge_group">Bridge group</option>
                                <option value="xo_direct">XO direct</option>
                                <option value="custom">Custom</option>
                              </select>
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={draft.enabled}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [connection.id]: { ...draft, enabled: event.target.checked },
                                  }))
                                }
                              />
                              Enabled
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={draft.autoRelay}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [connection.id]: { ...draft, autoRelay: event.target.checked },
                                  }))
                                }
                              />
                              Auto relay
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveDraft(connection)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs text-cyan-700 disabled:opacity-60 dark:text-cyan-200"
                            >
                              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleTest(connection.id)}
                              disabled={isTesting}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 disabled:opacity-60 dark:text-emerald-200"
                            >
                              {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
                              Test
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(connection.id)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 disabled:opacity-60 dark:text-rose-200"
                            >
                              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard>
              <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                Delivery Timeline
              </h2>
              {deliveries.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  No bridge delivery events yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {deliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {delivery.connectionName} • {PROVIDER_LABELS[delivery.provider]}
                        </p>
                        <span className="rounded-md border border-slate-300/70 px-2 py-0.5 text-xs text-slate-600 dark:border-white/15 dark:text-slate-300">
                          {STATUS_LABELS[delivery.status]}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{delivery.message}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>Source: {delivery.source}</span>
                        <span>Attempts: {delivery.attempts}</span>
                        <span>Created: {new Date(delivery.createdAt).toLocaleString()}</span>
                        {delivery.deliveredAt ? (
                          <span>Delivered: {new Date(delivery.deliveredAt).toLocaleString()}</span>
                        ) : null}
                        {delivery.lastError ? <span>Error: {delivery.lastError}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SurfaceCard>
          </>
        )}
      </div>
    </PageLayout>
  )
}
