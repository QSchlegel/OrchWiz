"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import "xterm/css/xterm.css"

type ConsoleStatus = "idle" | "preflight" | "connecting" | "connected" | "closed" | "error"

interface OpenClawSshConsoleProps {
  stationKey: BridgeStationKey
  stationLabel: string
  shipDeploymentId: string | null
}

interface PreflightSuccessPayload {
  ok: true
  shipDeploymentId: string
  wsPath: string
  namespace: string
  strategy: string
  commandPreview: string
}

interface PreflightErrorPayload {
  ok: false
  code?: string
  detail?: string
  suggestedActions?: string[]
}

function parseErrorPayload(value: unknown): PreflightErrorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false }
  }

  const payload = value as Record<string, unknown>
  return {
    ok: false,
    code: typeof payload.code === "string" ? payload.code : undefined,
    detail: typeof payload.detail === "string" ? payload.detail : undefined,
    suggestedActions: Array.isArray(payload.suggestedActions)
      ? payload.suggestedActions.filter((entry): entry is string => typeof entry === "string")
      : undefined,
  }
}

function sessionKey(shipDeploymentId: string | null, stationKey: BridgeStationKey): string {
  return `${shipDeploymentId || "auto"}:${stationKey}`
}

function wsUrlFromPath(wsPath: string): string {
  const absolute = new URL(wsPath, window.location.href)
  absolute.protocol = absolute.protocol === "https:" ? "wss:" : "ws:"
  return absolute.toString()
}

export function OpenClawSshConsole({
  stationKey,
  stationLabel,
  shipDeploymentId,
}: OpenClawSshConsoleProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const socketsBySessionRef = useRef<Map<string, WebSocket>>(new Map())
  const activeSocketRef = useRef<WebSocket | null>(null)
  const activeSessionKeyRef = useRef<string | null>(null)

  const [status, setStatus] = useState<ConsoleStatus>("idle")
  const [detail, setDetail] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [suggestedActions, setSuggestedActions] = useState<string[]>([])
  const [strategy, setStrategy] = useState<string | null>(null)
  const [commandPreview, setCommandPreview] = useState<string | null>(null)

  const scopePrefix = useMemo(() => `${shipDeploymentId || "auto"}:`, [shipDeploymentId])
  const currentSessionKey = useMemo(() => sessionKey(shipDeploymentId, stationKey), [shipDeploymentId, stationKey])

  const appendOutput = useCallback((text: string) => {
    if (!text) {
      return
    }

    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.write(text)
  }, [])

  const applySocketHandlers = useCallback((socket: WebSocket, key: string) => {
    socket.onopen = () => {
      setStatus("connected")
      setErrorCode(null)
      setErrorDetail(null)
      setSuggestedActions([])
      const fitAddon = fitAddonRef.current
      const terminal = terminalRef.current
      if (fitAddon && terminal) {
        fitAddon.fit()
        terminal.focus()
        socket.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        )
      }
    }

    socket.onmessage = (event) => {
      const payload = typeof event.data === "string" ? event.data : ""
      const trimmed = payload.trim()
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const decoded = JSON.parse(trimmed) as Record<string, unknown>
          const type = typeof decoded.type === "string" ? decoded.type : ""
          if (type === "status") {
            const state = typeof decoded.state === "string" ? decoded.state : ""
            const nextDetail = typeof decoded.detail === "string" ? decoded.detail : null
            const nextStrategy = typeof decoded.strategy === "string" ? decoded.strategy : null
            if (state === "connecting") setStatus("connecting")
            if (state === "connected") setStatus("connected")
            if (state === "closed") setStatus("closed")
            if (nextDetail) {
              setDetail(nextDetail)
            }
            if (nextStrategy) {
              setStrategy(nextStrategy)
            }
            return
          }

          if (type === "error") {
            const nextDetail = typeof decoded.detail === "string" ? decoded.detail : "Unknown SSH console error."
            const nextCode = typeof decoded.code === "string" ? decoded.code : null
            const nextActions = Array.isArray(decoded.suggestedActions)
              ? decoded.suggestedActions.filter((entry): entry is string => typeof entry === "string")
              : []

            setStatus("error")
            setErrorDetail(nextDetail)
            setErrorCode(nextCode)
            setSuggestedActions(nextActions)
            return
          }
        } catch {
          // Fall back to terminal output handling.
        }
      }

      appendOutput(payload)
    }

    socket.onclose = () => {
      if (activeSessionKeyRef.current === key) {
        setStatus("closed")
      }
      if (socketsBySessionRef.current.get(key) === socket) {
        socketsBySessionRef.current.delete(key)
      }
      if (activeSocketRef.current === socket) {
        activeSocketRef.current = null
      }
    }

    socket.onerror = () => {
      setStatus("error")
      setErrorDetail("SSH websocket connection failed.")
    }
  }, [appendOutput])

  const detachActiveSocket = useCallback(() => {
    const current = activeSocketRef.current
    if (!current) {
      return
    }

    current.onopen = null
    current.onmessage = null
    current.onclose = null
    current.onerror = null
    activeSocketRef.current = null
    activeSessionKeyRef.current = null
  }, [])

  const closeSocketForSession = useCallback((key: string) => {
    const socket = socketsBySessionRef.current.get(key)
    if (!socket) {
      return
    }

    if (activeSocketRef.current === socket) {
      detachActiveSocket()
    }

    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null

    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "Client requested disconnect")
    }

    socketsBySessionRef.current.delete(key)
  }, [detachActiveSocket])

  const connect = useCallback(async (forceReconnect = false) => {
    setErrorCode(null)
    setErrorDetail(null)
    setSuggestedActions([])

    if (forceReconnect) {
      closeSocketForSession(currentSessionKey)
    }

    const existing = socketsBySessionRef.current.get(currentSessionKey)
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      detachActiveSocket()
      activeSocketRef.current = existing
      activeSessionKeyRef.current = currentSessionKey
      setStatus(existing.readyState === WebSocket.OPEN ? "connected" : "connecting")
      applySocketHandlers(existing, currentSessionKey)
      return
    }

    setStatus("preflight")
    try {
      const query = new URLSearchParams()
      if (shipDeploymentId) {
        query.set("shipDeploymentId", shipDeploymentId)
      }

      const response = await fetch(`/api/bridge/runtime-ssh/openclaw/${stationKey}?${query.toString()}`, {
        method: "GET",
        credentials: "include",
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const parsed = parseErrorPayload(payload)
        setStatus("error")
        setErrorCode(parsed.code || null)
        setErrorDetail(parsed.detail || `SSH preflight failed (HTTP ${response.status}).`)
        setSuggestedActions(parsed.suggestedActions || [])
        return
      }

      const success = payload as PreflightSuccessPayload
      if (!success.ok || typeof success.wsPath !== "string") {
        setStatus("error")
        setErrorDetail("SSH preflight returned an invalid response.")
        return
      }

      setStrategy(success.strategy)
      setCommandPreview(success.commandPreview)
      setDetail(`Namespace ${success.namespace} · ${stationLabel}`)

      const socket = new WebSocket(wsUrlFromPath(success.wsPath))
      socketsBySessionRef.current.set(currentSessionKey, socket)

      detachActiveSocket()
      activeSocketRef.current = socket
      activeSessionKeyRef.current = currentSessionKey
      setStatus("connecting")

      const terminal = terminalRef.current
      if (terminal) {
        terminal.clear()
        terminal.writeln(`Connecting SSH session for ${stationLabel} (${stationKey.toUpperCase()})...`)
        terminal.focus()
      }

      applySocketHandlers(socket, currentSessionKey)
    } catch (error) {
      setStatus("error")
      setErrorDetail(
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "SSH console preflight failed.",
      )
    }
  }, [
    applySocketHandlers,
    closeSocketForSession,
    currentSessionKey,
    detachActiveSocket,
    shipDeploymentId,
    stationKey,
    stationLabel,
  ])

  const disconnect = useCallback(() => {
    closeSocketForSession(currentSessionKey)
    setStatus("closed")
  }, [closeSocketForSession, currentSessionKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 12,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0",
        cursor: "#22d3ee",
      },
      scrollback: 6_000,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(container)
    fitAddon.fit()
    terminal.writeln("OpenClaw SSH console ready.")
    terminal.focus()

    const onDataDispose = terminal.onData((data: string) => {
      const socket = activeSocketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify({ type: "input", data }))
    })

    const onResizeDispose = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      const socket = activeSocketRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return
      }

      socket.send(JSON.stringify({ type: "resize", cols, rows }))
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(container)
    const onContainerMouseDown = () => {
      terminal.focus()
    }
    container.addEventListener("mousedown", onContainerMouseDown)

    return () => {
      resizeObserver.disconnect()
      container.removeEventListener("mousedown", onContainerMouseDown)
      onDataDispose.dispose()
      onResizeDispose.dispose()

      for (const socket of socketsBySessionRef.current.values()) {
        socket.onopen = null
        socket.onmessage = null
        socket.onclose = null
        socket.onerror = null
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, "Console unmounted")
        }
      }
      socketsBySessionRef.current.clear()

      terminal.dispose()
      fitAddonRef.current = null
      terminalRef.current = null
      activeSocketRef.current = null
      activeSessionKeyRef.current = null
    }
  }, [])

  useEffect(() => {
    for (const [key, socket] of socketsBySessionRef.current.entries()) {
      if (key.startsWith(scopePrefix)) {
        continue
      }
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, "Ship scope changed")
      }
      socketsBySessionRef.current.delete(key)
    }

    if (activeSessionKeyRef.current && !activeSessionKeyRef.current.startsWith(scopePrefix)) {
      detachActiveSocket()
      setStatus("idle")
    }
  }, [detachActiveSocket, scopePrefix])

  useEffect(() => {
    void connect(false)
  }, [connect, currentSessionKey])

  const statusLabel =
    status === "preflight"
      ? "Resolving SSH target..."
      : status === "connecting"
        ? "Connecting..."
        : status === "connected"
          ? "Connected"
          : status === "closed"
            ? "Disconnected"
            : status === "error"
              ? "Error"
              : "Idle"

  return (
    <div className="space-y-2 rounded-lg border border-slate-300/70 bg-white/80 p-2 dark:border-white/12 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
            SSH Console · {stationLabel} ({stationKey.toUpperCase()})
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-300">{statusLabel}</p>
          {detail && <p className="text-[11px] text-slate-500 dark:text-slate-300">{detail}</p>}
          {strategy && (
            <p className="text-[11px] text-slate-500 dark:text-slate-300">Strategy: {strategy}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void connect(false)}
            disabled={status === "preflight" || status === "connecting" || status === "connected"}
            className="rounded-md border border-cyan-300/45 bg-cyan-500/12 px-2 py-1 text-xs text-cyan-700 transition hover:bg-cyan-500/22 disabled:opacity-50 dark:text-cyan-100"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => void connect(true)}
            className="rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-xs text-slate-700 transition hover:bg-white dark:border-white/15 dark:bg-slate-900/60 dark:text-slate-200"
          >
            Reconnect
          </button>
          <button
            type="button"
            onClick={disconnect}
            className="rounded-md border border-amber-300/45 bg-amber-500/12 px-2 py-1 text-xs text-amber-700 transition hover:bg-amber-500/22 dark:text-amber-100"
          >
            Disconnect
          </button>
        </div>
      </div>

      {errorDetail && (
        <div className="rounded-md border border-rose-300/45 bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-200">
          <p className="font-medium">{errorCode ? `${errorCode}: ` : ""}{errorDetail}</p>
          {suggestedActions.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {suggestedActions.map((action, index) => (
                <li key={`${index}-${action}`}>{action}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-slate-300/70 bg-slate-950 dark:border-white/12">
        <div ref={containerRef} className="h-[420px] w-full" />
      </div>

      {commandPreview && (
        <p className="text-[11px] text-slate-500 dark:text-slate-300">Command preview: {commandPreview}</p>
      )}
    </div>
  )
}
