"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ExternalLink,
  Github,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { InlineNotice, PageLayout, SurfaceCard } from "@/components/dashboard/PageLayout"
import { CloudProvidersCard } from "@/components/settings/CloudProvidersCard"
import {
  CODEX_DEVICE_AUTH_PENDING_STORAGE_KEY,
  codexDeviceAuthPollDelayMs,
  codexDeviceAuthSecondsRemaining,
  createCodexDeviceAuthPendingMetadata,
  resolveCodexDeviceAuthFlowState,
  restoreCodexDeviceAuthFlow,
  type CodexDeviceAuthFlowState,
} from "@/lib/runtime/codex-cli-device-auth-flow"

type NoticeVariant = "info" | "success" | "error"
type CodexCliAccountProvider = "chatgpt" | "api_key" | "unknown" | null

interface NoticeState {
  variant: NoticeVariant
  text: string
}

interface CodexCliConnectorState {
  executable: string
  shellExecutable: string
  binaryAvailable: boolean
  version: string | null
  accountConnected: boolean
  accountProvider: CodexCliAccountProvider
  statusMessage: string | null
  setupHints: string[]
}

interface CodexCliActionResult {
  ok: boolean
  message: string
  verificationUrl?: string | null
  userCode?: string | null
  expiresInMinutes?: number | null
  awaitingAuthorization?: boolean
}

interface ConnectorResponsePayload {
  connector?: CodexCliConnectorState
  actionResult?: CodexCliActionResult
  error?: string
}

interface DeviceAuthState {
  verificationUrl: string | null
  userCode: string | null
  expiresInMinutes: number | null
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return value
}

function codexAccountProviderLabel(provider: CodexCliAccountProvider): string {
  if (provider === "chatgpt") return "ChatGPT"
  if (provider === "api_key") return "API Key"
  if (provider === "unknown") return "Connected"
  return "Not Connected"
}

function authErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const value = asString((error as { message?: unknown }).message)
    if (value) {
      return value
    }
  }
  return fallback
}

function isGitHubProviderMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }

  const message = asString((error as { message?: unknown }).message)?.toLowerCase() || ""
  const status = (error as { status?: unknown }).status
  return message.includes("provider not found") || status === 404
}

export default function SettingsPage() {
  const [connector, setConnector] = useState<CodexCliConnectorState | null>(null)
  const [isConnectorLoading, setIsConnectorLoading] = useState(true)
  const [isConnectorUpdating, setIsConnectorUpdating] = useState(false)
  const [connectorNotice, setConnectorNotice] = useState<NoticeState | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [deviceAuth, setDeviceAuth] = useState<DeviceAuthState | null>(null)
  const [deviceAuthFlowState, setDeviceAuthFlowState] = useState<CodexDeviceAuthFlowState>("idle")
  const [deviceAuthFlowStartedAt, setDeviceAuthFlowStartedAt] = useState<number | null>(null)
  const [deviceAuthPollAttempts, setDeviceAuthPollAttempts] = useState(0)
  const [deviceAuthCountdownNow, setDeviceAuthCountdownNow] = useState(() => Date.now())
  const [isGitHubLoading, setIsGitHubLoading] = useState(true)
  const [isGitHubActionLoading, setIsGitHubActionLoading] = useState(false)
  const [isGitHubConnected, setIsGitHubConnected] = useState(false)
  const [isGitHubProviderConfigured, setIsGitHubProviderConfigured] = useState(true)
  const [githubAccountId, setGitHubAccountId] = useState<string | null>(null)
  const [gitHubNotice, setGitHubNotice] = useState<NoticeState | null>(null)
  const [copiedField, setCopiedField] = useState<"verification-url" | "one-time-code" | null>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistPendingDeviceAuth = useCallback((startedAt: number) => {
    if (typeof window === "undefined") {
      return
    }

    try {
      window.sessionStorage.setItem(
        CODEX_DEVICE_AUTH_PENDING_STORAGE_KEY,
        createCodexDeviceAuthPendingMetadata(startedAt),
      )
    } catch (error) {
      console.error("Failed to persist Codex device auth state:", error)
    }
  }, [])

  const clearPendingDeviceAuth = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }

    try {
      window.sessionStorage.removeItem(CODEX_DEVICE_AUTH_PENDING_STORAGE_KEY)
    } catch (error) {
      console.error("Failed to clear Codex device auth state:", error)
    }
  }, [])

  const setDeviceAuthFlowIdle = useCallback(() => {
    setDeviceAuthFlowState("idle")
    setDeviceAuthFlowStartedAt(null)
    setDeviceAuthPollAttempts(0)
    clearPendingDeviceAuth()
  }, [clearPendingDeviceAuth])

  const markDeviceAuthConnected = useCallback(() => {
    setDeviceAuthFlowState("connected")
    setDeviceAuthFlowStartedAt(null)
    setDeviceAuthPollAttempts(0)
    setDeviceAuth(null)
    clearPendingDeviceAuth()
    setConnectorNotice({
      variant: "success",
      text: "ChatGPT authorization detected. Codex CLI is now connected.",
    })
  }, [clearPendingDeviceAuth])

  const markDeviceAuthTimedOut = useCallback(() => {
    setDeviceAuthFlowState("timed_out")
    setDeviceAuthFlowStartedAt(null)
    setDeviceAuthPollAttempts(0)
    clearPendingDeviceAuth()
    setConnectorNotice({
      variant: "error",
      text: "Authorization not detected yet. Retry Connect ChatGPT or Refresh.",
    })
  }, [clearPendingDeviceAuth])

  const markDeviceAuthError = useCallback((message: string) => {
    setDeviceAuthFlowState("error")
    setDeviceAuthFlowStartedAt(null)
    setDeviceAuthPollAttempts(0)
    clearPendingDeviceAuth()
    setConnectorNotice({
      variant: "error",
      text: message,
    })
  }, [clearPendingDeviceAuth])

  const loadConnector = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true
    if (!silent) {
      setIsConnectorLoading(true)
    }

    try {
      const response = await fetch("/api/runtime/codex-cli/connector", {
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => ({}))) as ConnectorResponsePayload

      if (!response.ok) {
        if (!silent) {
          setConnector(null)
          setConnectorNotice({
            variant: "error",
            text: asString(payload.error) || "Unable to load Codex CLI connector status.",
          })
        }
        return null
      }

      const snapshot = payload.connector || null
      setConnector(snapshot)
      return snapshot
    } catch (error) {
      console.error("Failed to load Codex CLI connector status:", error)
      if (!silent) {
        setConnector(null)
        setConnectorNotice({
          variant: "error",
          text: "Unable to load Codex CLI connector status.",
        })
      }
      return null
    } finally {
      if (!silent) {
        setIsConnectorLoading(false)
      }
    }
  }, [])

  const runConnectorAction = useCallback(
    async (
      action: "connect_api_key" | "start_device_auth" | "logout",
      body: Record<string, unknown> = {},
    ) => {
      setIsConnectorUpdating(true)
      try {
        const response = await fetch("/api/runtime/codex-cli/connector", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            ...body,
          }),
        })
        const payload = (await response.json().catch(() => ({}))) as ConnectorResponsePayload
        if (!response.ok) {
          throw new Error(asString(payload.error) || `HTTP ${response.status}`)
        }

        const snapshot = payload.connector || null
        const actionResult = payload.actionResult
        const message = asString(actionResult?.message) || "Connector action completed."
        const ok = actionResult?.ok === true

        setConnector(snapshot)

        if (action === "connect_api_key") {
          setApiKeyInput("")
          setDeviceAuth(null)
          setDeviceAuthFlowIdle()
        }

        if (action === "logout") {
          setDeviceAuth(null)
          setDeviceAuthFlowIdle()
        }

        if (action === "start_device_auth") {
          const verificationUrl = asString(actionResult?.verificationUrl) || null
          const userCode = asString(actionResult?.userCode) || null
          const expiresInMinutes = asNumber(actionResult?.expiresInMinutes)
          const hasDeviceAuthData = Boolean(verificationUrl && userCode)
          const awaitingAuthorization = actionResult?.awaitingAuthorization === true

          setDeviceAuth(
            hasDeviceAuthData
              ? {
                  verificationUrl,
                  userCode,
                  expiresInMinutes,
                }
              : null,
          )

          if (hasDeviceAuthData) {
            const startedAt = Date.now()
            setDeviceAuthFlowState("awaiting_authorization")
            setDeviceAuthFlowStartedAt(startedAt)
            setDeviceAuthPollAttempts(0)
            setDeviceAuthCountdownNow(startedAt)
            persistPendingDeviceAuth(startedAt)
            setConnectorNotice({
              variant: "info",
              text: awaitingAuthorization
                ? "Waiting for ChatGPT authorization confirmation..."
                : "Device authorization started. Waiting for ChatGPT authorization confirmation...",
            })
          } else if (!ok) {
            markDeviceAuthError(message)
          } else {
            setDeviceAuthFlowIdle()
            setConnectorNotice({
              variant: "success",
              text: message,
            })
          }
          return
        }

        setConnectorNotice({
          variant: ok ? "success" : "error",
          text: message,
        })
      } catch (error) {
        console.error("Codex connector action failed:", error)
        if (action === "start_device_auth") {
          markDeviceAuthError(error instanceof Error ? error.message : "Connector action failed.")
          return
        }

        setConnectorNotice({
          variant: "error",
          text: error instanceof Error ? error.message : "Connector action failed.",
        })
      } finally {
        setIsConnectorUpdating(false)
      }
    },
    [markDeviceAuthError, persistPendingDeviceAuth, setDeviceAuthFlowIdle],
  )

  const refreshGitHubConnection = useCallback(async () => {
    setIsGitHubLoading(true)
    try {
      const { data, error } = await authClient.listAccounts()
      if (error) {
        throw new Error(authErrorMessage(error, "Unable to verify GitHub connection right now."))
      }

      const accounts = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
      const githubAccount = accounts.find((account) => account.providerId === "github")
      setIsGitHubConnected(Boolean(githubAccount))
      setGitHubAccountId(asString(githubAccount?.accountId))
    } catch (error) {
      console.error("Failed to load linked accounts:", error)
      setIsGitHubConnected(false)
      setGitHubAccountId(null)
      setGitHubNotice({
        variant: "error",
        text: error instanceof Error ? error.message : "Unable to verify GitHub connection right now.",
      })
    } finally {
      setIsGitHubLoading(false)
    }
  }, [])

  const connectGitHub = useCallback(async () => {
    setIsGitHubActionLoading(true)
    setGitHubNotice(null)
    try {
      const { data, error } = await authClient.linkSocial({
        provider: "github",
        callbackURL: "/settings",
        disableRedirect: true,
      })

      if (error) {
        if (isGitHubProviderMissing(error)) {
          setIsGitHubProviderConfigured(false)
          setGitHubNotice({
            variant: "error",
            text: "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in node/.env, restart the app, then try again.",
          })
          return
        }
        throw new Error(authErrorMessage(error, "Unable to start GitHub connection."))
      }

      setIsGitHubProviderConfigured(true)
      const redirectUrl = asString((data as { url?: unknown } | null)?.url)
      if (redirectUrl) {
        window.location.href = redirectUrl
        return
      }

      await refreshGitHubConnection()
      setGitHubNotice({
        variant: "success",
        text: "GitHub account connected.",
      })
    } catch (error) {
      if (isGitHubProviderMissing(error)) {
        setIsGitHubProviderConfigured(false)
        setGitHubNotice({
          variant: "error",
          text: "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in node/.env, restart the app, then try again.",
        })
        return
      }

      console.error("GitHub connect failed:", error)
      setGitHubNotice({
        variant: "error",
        text: error instanceof Error ? error.message : "Unable to start GitHub connection.",
      })
    } finally {
      setIsGitHubActionLoading(false)
    }
  }, [refreshGitHubConnection])

  const disconnectGitHub = useCallback(async () => {
    setIsGitHubActionLoading(true)
    setGitHubNotice(null)
    try {
      let result = await authClient.unlinkAccount({
        providerId: "github",
      })

      if (result.error && githubAccountId) {
        result = await authClient.unlinkAccount({
          providerId: "github",
          accountId: githubAccountId,
        })
      }

      if (result.error) {
        throw new Error(authErrorMessage(result.error, "Unable to disconnect GitHub account."))
      }

      await refreshGitHubConnection()
      setGitHubNotice({
        variant: "success",
        text: "GitHub account disconnected.",
      })
    } catch (error) {
      console.error("GitHub disconnect failed:", error)
      setGitHubNotice({
        variant: "error",
        text: error instanceof Error ? error.message : "Unable to disconnect GitHub account.",
      })
    } finally {
      setIsGitHubActionLoading(false)
    }
  }, [githubAccountId, refreshGitHubConnection])

  const copyToClipboard = useCallback(async (
    value: string,
    label: string,
    field: "verification-url" | "one-time-code",
  ) => {
    try {
      await navigator.clipboard.writeText(value)
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
      }
      setCopiedField(field)
      copiedTimerRef.current = setTimeout(() => {
        setCopiedField(null)
      }, 1800)
      setConnectorNotice({
        variant: "info",
        text: `${label} copied to clipboard.`,
      })
    } catch (error) {
      console.error("Failed to copy value:", error)
      setConnectorNotice({
        variant: "error",
        text: `Unable to copy ${label.toLowerCase()}.`,
      })
    }
  }, [])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const restored = restoreCodexDeviceAuthFlow(
      window.sessionStorage.getItem(CODEX_DEVICE_AUTH_PENDING_STORAGE_KEY),
    )

    if (restored.flowState === "awaiting_authorization" && restored.startedAt) {
      setDeviceAuthFlowState("awaiting_authorization")
      setDeviceAuthFlowStartedAt(restored.startedAt)
      setDeviceAuthPollAttempts(0)
      setDeviceAuthCountdownNow(Date.now())
      setConnectorNotice({
        variant: "info",
        text: "Waiting for ChatGPT authorization confirmation...",
      })
      return
    }

    if (restored.flowState === "timed_out") {
      clearPendingDeviceAuth()
      setDeviceAuthFlowState("timed_out")
      setDeviceAuthFlowStartedAt(null)
      setDeviceAuthPollAttempts(0)
      setConnectorNotice({
        variant: "error",
        text: "Authorization not detected yet. Retry Connect ChatGPT or Refresh.",
      })
    }
  }, [clearPendingDeviceAuth])

  useEffect(() => {
    void loadConnector()
    void refreshGitHubConnection()
  }, [loadConnector, refreshGitHubConnection])

  useEffect(() => {
    if (deviceAuthFlowState !== "awaiting_authorization" || !deviceAuthFlowStartedAt) {
      return
    }

    setDeviceAuthCountdownNow(Date.now())
    const timer = window.setInterval(() => {
      setDeviceAuthCountdownNow(Date.now())
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [deviceAuthFlowState, deviceAuthFlowStartedAt])

  useEffect(() => {
    if (deviceAuthFlowState !== "awaiting_authorization") {
      return
    }

    const nextState = resolveCodexDeviceAuthFlowState({
      flowState: deviceAuthFlowState,
      startedAt: deviceAuthFlowStartedAt,
      connectorConnected: connector?.accountConnected === true,
    })

    if (nextState === "connected") {
      markDeviceAuthConnected()
      return
    }

    if (nextState === "timed_out") {
      markDeviceAuthTimedOut()
    }
  }, [
    connector?.accountConnected,
    deviceAuthFlowStartedAt,
    deviceAuthFlowState,
    markDeviceAuthConnected,
    markDeviceAuthTimedOut,
  ])

  useEffect(() => {
    if (deviceAuthFlowState !== "awaiting_authorization") {
      return
    }

    if (!deviceAuthFlowStartedAt || connector?.accountConnected) {
      return
    }

    const delayMs = codexDeviceAuthPollDelayMs(deviceAuthFlowStartedAt)
    const timer = window.setTimeout(() => {
      void (async () => {
        const snapshot = await loadConnector({ silent: true })
        if (!snapshot) {
          markDeviceAuthError(
            "Unable to confirm Codex CLI authorization automatically. Please click Refresh to retry.",
          )
          return
        }

        setDeviceAuthPollAttempts((attempts) => attempts + 1)
      })()
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [
    connector?.accountConnected,
    deviceAuthFlowStartedAt,
    deviceAuthFlowState,
    deviceAuthPollAttempts,
    loadConnector,
    markDeviceAuthError,
  ])

  const deviceAuthSecondsRemaining =
    deviceAuthFlowState === "awaiting_authorization" && deviceAuthFlowStartedAt
      ? codexDeviceAuthSecondsRemaining(deviceAuthFlowStartedAt, deviceAuthCountdownNow)
      : null

  return (
    <PageLayout
      title="Settings"
      description="Manage Codex CLI and GitHub account connections for runtime and developer workflows."
    >
      <div className="space-y-4">
        {connectorNotice ? <InlineNotice variant={connectorNotice.variant}>{connectorNotice.text}</InlineNotice> : null}
        <SurfaceCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-slate-300 bg-slate-900 p-2 text-white dark:border-white/15">
                <TerminalSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">Codex CLI Connector</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Connect your local Codex CLI with ChatGPT device auth or API key login.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadConnector()}
              disabled={isConnectorLoading || isConnectorUpdating}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              {isConnectorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
          </div>

          {isConnectorLoading ? (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Inspecting Codex CLI connector...
            </div>
          ) : connector ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full border px-3 py-1 ${
                    connector.binaryAvailable
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {connector.binaryAvailable ? "CLI Ready" : "CLI Missing"}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 ${
                    connector.accountConnected
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  Account: {codexAccountProviderLabel(connector.accountProvider)}
                </span>
                {connector.version ? (
                  <span className="rounded-full border border-slate-300/80 px-3 py-1 text-slate-700 dark:border-white/20 dark:text-slate-300">
                    {connector.version}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Binary: <code>{connector.executable}</code>
              </p>
              {connector.statusMessage ? (
                <p className="text-sm text-slate-700 dark:text-slate-200">{connector.statusMessage}</p>
              ) : null}
              {connector.setupHints.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
                  {connector.setupHints.map((hint, index) => (
                    <li key={`${hint}:${index}`}>{hint}</li>
                  ))}
                </ol>
              ) : null}

              {deviceAuthFlowState === "awaiting_authorization" ? (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-cyan-800 dark:text-cyan-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Awaiting authorization...
                  </div>
                  <p className="mt-1 text-xs text-cyan-700/85 dark:text-cyan-200/85">
                    Checking status automatically
                    {typeof deviceAuthSecondsRemaining === "number"
                      ? ` (${deviceAuthSecondsRemaining}s remaining)`
                      : ""}{" "}
                    • Attempt {deviceAuthPollAttempts + 1}
                  </p>
                </div>
              ) : null}

              {deviceAuthFlowState === "connected" ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Authorization confirmed. Codex CLI is connected.
                </p>
              ) : null}

              {deviceAuthFlowState === "timed_out" ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Authorization not detected yet. Retry <strong>Connect ChatGPT</strong> or click{" "}
                  <strong>Refresh</strong>.
                </p>
              ) : null}

              {deviceAuthFlowState === "error" ? (
                <p className="text-xs text-rose-700 dark:text-rose-300">
                  Automatic authorization checks stopped due to an error. Click <strong>Refresh</strong> to retry.
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runConnectorAction("start_device_auth")}
                  disabled={isConnectorUpdating || !connector.binaryAvailable}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {isConnectorUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Connect ChatGPT
                </button>
                {connector.accountConnected ? (
                  <button
                    type="button"
                    onClick={() => void runConnectorAction("logout")}
                    disabled={isConnectorUpdating}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  >
                    {isConnectorUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                    Logout
                  </button>
                ) : null}
              </div>

              {!connector.accountConnected && connector.binaryAvailable ? (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
                    API Key Setup
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(event) => setApiKeyInput(event.target.value)}
                      placeholder="sk-..."
                      className="min-w-[220px] flex-1 rounded-lg border border-cyan-500/30 bg-white px-3 py-2 text-sm text-slate-900 dark:border-cyan-300/30 dark:bg-white/[0.06] dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => void runConnectorAction("connect_api_key", { apiKey: apiKeyInput.trim() })}
                      disabled={isConnectorUpdating || !apiKeyInput.trim()}
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-700 disabled:opacity-50 dark:text-cyan-200"
                    >
                      {isConnectorUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Connect API Key
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-cyan-700/80 dark:text-cyan-200/80">
                    Uses <code>codex login --with-api-key</code> on this machine. The key is not stored by this page.
                  </p>
                </div>
              ) : null}

              {deviceAuth && (deviceAuth.verificationUrl || deviceAuth.userCode) ? (
                <div className="rounded-xl border border-slate-300/80 bg-white/80 p-3 dark:border-white/15 dark:bg-white/[0.03]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <ShieldCheck className="h-4 w-4" />
                    ChatGPT Device Authorization
                  </div>
                  {deviceAuth.verificationUrl ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <a
                        href={deviceAuth.verificationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-700 underline decoration-cyan-600/40 underline-offset-2 hover:text-cyan-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                      >
                        Open verification page
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(deviceAuth.verificationUrl!, "Verification URL", "verification-url")}
                        className={`rounded-md border px-2 py-1 transition-colors ${
                          copiedField === "verification-url"
                            ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                        }`}
                      >
                        {copiedField === "verification-url" ? "Copied URL" : "Copy URL"}
                      </button>
                    </div>
                  ) : null}
                  {deviceAuth.userCode ? (
                    <div className="mt-3">
                      <p className="text-xs text-slate-600 dark:text-slate-400">One-time code</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <code className="rounded-md border border-slate-300/80 bg-slate-100 px-2 py-1 text-base font-semibold tracking-widest text-slate-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-100">
                          {deviceAuth.userCode}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(deviceAuth.userCode!, "One-time code", "one-time-code")}
                          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                            copiedField === "one-time-code"
                              ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                          }`}
                        >
                          {copiedField === "one-time-code" ? "Copied code" : "Copy code"}
                        </button>
                      </div>
                      {deviceAuth.expiresInMinutes ? (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          Expires in about {deviceAuth.expiresInMinutes} minutes.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Connector status unavailable.</p>
          )}
        </SurfaceCard>

        {gitHubNotice ? <InlineNotice variant={gitHubNotice.variant}>{gitHubNotice.text}</InlineNotice> : null}
        <SurfaceCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-slate-300 bg-slate-900 p-2 text-white dark:border-white/15">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">GitHub Account</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Connect your GitHub account to enable PR workflows in the Ready Room.
                </p>
              </div>
            </div>
            {isGitHubLoading ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking connection...
              </div>
            ) : isGitHubConnected ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                <Link2 className="h-4 w-4" />
                GitHub connected
              </span>
            ) : !isGitHubProviderConfigured ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-700 dark:text-rose-300">
                GitHub OAuth not configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
                GitHub not connected
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isGitHubConnected ? (
              <button
                type="button"
                onClick={() => void disconnectGitHub()}
                disabled={isGitHubActionLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
              >
                {isGitHubActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Disconnect GitHub
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void connectGitHub()}
                disabled={isGitHubActionLoading || !isGitHubProviderConfigured}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {isGitHubActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                Connect GitHub
              </button>
            )}
            <Link
              href="/github/prs"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/[0.08]"
            >
              Open GitHub PRs
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          {!isGitHubProviderConfigured ? (
            <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">
              Missing local OAuth setup: set <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> in <code>node/.env</code>, then restart.
            </p>
          ) : null}
        </SurfaceCard>

        <CloudProvidersCard />
      </div>
    </PageLayout>
  )
}
