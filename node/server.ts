import "./server-dotenv"
import http from "node:http"
import next from "next"
import { WebSocket, WebSocketServer, type RawData } from "ws"
import { createAuth } from "./src/lib/auth"
import { prisma } from "./src/lib/prisma"
import {
  isBridgeStationKey,
  resolveOpenClawRuntimeUrlForStation,
  resolveShipNamespace,
} from "./src/lib/bridge/openclaw-runtime"

interface ShipSelectionRecord {
  id: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
  config: unknown
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function parseBooleanEnv(value: unknown): boolean | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false
  }
  return null
}

function parseCliArgs(argv: string[]) {
  const args: Record<string, string> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith("--")) {
      continue
    }

    const key = current.slice(2).trim()
    if (!key) {
      continue
    }

    const nextValue = argv[index + 1]
    if (nextValue && !nextValue.startsWith("--")) {
      args[key] = nextValue
      index += 1
      continue
    }

    args[key] = "true"
  }

  return args
}

function nodeHeadersToWebHeaders(req: http.IncomingMessage): Headers {
  const out = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      out.set(key, value)
    } else if (Array.isArray(value)) {
      out.set(key, value.join(","))
    }
  }
  return out
}

function headerFirstValue(req: http.IncomingMessage, headerName: string): string | null {
  const value = req.headers[headerName]
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : null
  if (!raw) {
    return null
  }
  const first = raw.split(",")[0]?.trim()
  return first && first.length > 0 ? first : null
}

function parseForwardedHeader(value: string | null): Record<string, string> {
  if (!value) {
    return {}
  }

  const first = value.split(",")[0]?.trim()
  if (!first) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const part of first.split(";")) {
    const [rawKey, rawValue] = part.split("=")
    const key = rawKey?.trim().toLowerCase()
    if (!key) {
      continue
    }

    const nextValue = rawValue?.trim().replace(/^"|"$/gu, "")
    if (!nextValue) {
      continue
    }

    out[key] = nextValue
  }

  return out
}

function resolvePublicRequestOrigin(req: http.IncomingMessage): string {
  const host = headerFirstValue(req, "x-forwarded-host") || headerFirstValue(req, "host") || "localhost"

  const forwardedProto = headerFirstValue(req, "x-forwarded-proto")
  if (forwardedProto === "https" || forwardedProto === "http") {
    return `${forwardedProto}://${host}`
  }

  const forwarded = parseForwardedHeader(headerFirstValue(req, "forwarded"))
  const forwardedProtoFromHeader = forwarded.proto?.toLowerCase()
  if (forwardedProtoFromHeader === "https" || forwardedProtoFromHeader === "http") {
    return `${forwardedProtoFromHeader}://${host}`
  }

  const cfVisitor = headerFirstValue(req, "cf-visitor")
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor) as unknown
      const scheme = parsed && typeof parsed === "object" && "scheme" in parsed ? String((parsed as any).scheme) : ""
      if (scheme === "https" || scheme === "http") {
        return `${scheme}://${host}`
      }
    } catch {
      // ignore invalid cf-visitor
    }
  }

  return `http://${host}`
}

async function selectShipForRuntimeUi(args: {
  userId: string
  requestedShipDeploymentId: string | null
}): Promise<ShipSelectionRecord | null> {
  const ships = await prisma.agentDeployment.findMany({
    where: {
      userId: args.userId,
      deploymentType: "ship",
    },
    select: {
      id: true,
      status: true,
      deploymentProfile: true,
      config: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })

  if (ships.length === 0) {
    return null
  }

  if (args.requestedShipDeploymentId) {
    const explicit = ships.find((ship) => ship.id === args.requestedShipDeploymentId)
    if (explicit) {
      return explicit as ShipSelectionRecord
    }
  }

  return (ships.find((ship) => ship.status === "active") || ships[0]) as ShipSelectionRecord
}

function extractStationKeyFromWsPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  // /api/bridge/runtime-ui/openclaw-gateway/:stationKey
  // /api/bridge/runtime-ui/openclaw-gateway/:stationKey/ws
  // /api/bridge/runtime-ui/openclaw/:stationKey (legacy; kept for cached runtime UIs)
  // /api/bridge/runtime-ui/openclaw/:stationKey/ws (legacy; kept for cached runtime UIs)
  const isGatewayPath = parts[3] === "openclaw-gateway" || parts[3] === "openclaw"
  const matchesBase =
    parts.length === 5
    && parts[0] === "api"
    && parts[1] === "bridge"
    && parts[2] === "runtime-ui"
    && isGatewayPath
  const matchesWs =
    parts.length === 6
    && parts[0] === "api"
    && parts[1] === "bridge"
    && parts[2] === "runtime-ui"
    && isGatewayPath
    && parts[5] === "ws"

  if (!matchesBase && !matchesWs) {
    return null
  }

  return parts[4] || null
}

function socketHttpError(
  socket: import("node:stream").Duplex,
  status: number,
  message: string,
) {
  const lines = [
    `HTTP/1.1 ${status} ${message}`,
    "Connection: close",
    "Content-Type: text/plain; charset=utf-8",
    `Content-Length: ${Buffer.byteLength(message, "utf8")}`,
    "",
    message,
  ]

  try {
    socket.write(lines.join("\r\n"))
  } finally {
    socket.destroy()
  }
}

function wsUrlForHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:"
    parsed.search = ""
    return parsed.toString()
  } catch {
    return null
  }
}

function originForHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

function isValidWsCloseCode(code: unknown): code is number {
  return (
    typeof code === "number"
    && ((code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999))
  )
}

function safeWsCloseReason(reason: Buffer | string | undefined): string | undefined {
  const text =
    typeof reason === "string"
      ? reason
      : Buffer.isBuffer(reason)
        ? reason.toString("utf8")
        : undefined
  if (!text) {
    return undefined
  }

  // The close reason is limited to 123 bytes.
  if (Buffer.byteLength(text, "utf8") <= 120) {
    return text
  }
  return undefined
}

async function handleRuntimeUiWsProxyConnection(downstream: WebSocket, req: http.IncomingMessage) {
  const debug = parseBooleanEnv(process.env.ORCHWIZ_DEBUG_OPENCLAW_WS) === true
  const startedAt = Date.now()
  const log = (...args: unknown[]) => {
    if (debug) {
      console.log("[openclaw-ws]", `+${Date.now() - startedAt}ms`, ...args)
    }
  }

  let upstream: WebSocket | null = null
  const pendingDownstream: Array<{ data: RawData; isBinary: boolean }> = []

  const closeBoth = (code?: number, reason?: Buffer | string) => {
    const safeCode = isValidWsCloseCode(code) ? code : undefined
    const reasonText = safeCode ? safeWsCloseReason(reason) : undefined
    if (downstream.readyState === WebSocket.OPEN || downstream.readyState === WebSocket.CONNECTING) {
      if (safeCode) {
        downstream.close(safeCode, reasonText)
      } else {
        downstream.close()
      }
    }
    if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
      if (safeCode) {
        upstream.close(safeCode, reasonText)
      } else {
        upstream.close()
      }
    }
  }

  const flushPendingDownstream = () => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) {
      return
    }

    while (pendingDownstream.length > 0) {
      const next = pendingDownstream.shift()
      if (!next) {
        break
      }
      upstream.send(next.data, { binary: next.isBinary })
    }
  }

  // Attach the downstream handlers immediately so we don't miss early messages while doing async work
  // (auth/db lookups, upstream URL resolution, etc).
  downstream.on("message", (data, isBinary) => {
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary })
      return
    }

    pendingDownstream.push({ data, isBinary })
  })

  downstream.on("close", (code, reason) => {
    const reasonText = reason?.toString("utf8") || ""
    log("downstream close", { code, reason: reasonText })
    closeBoth(code, reason)
  })

  downstream.on("error", () => {
    log("downstream error")
    closeBoth(1011, "Downstream websocket error.")
  })

  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    const stationKeyRaw = extractStationKeyFromWsPath(requestUrl.pathname)
    if (!stationKeyRaw || !isBridgeStationKey(stationKeyRaw)) {
      downstream.close(1008, "Unknown station key.")
      return
    }

    const requestOrigin = resolvePublicRequestOrigin(req)
    const authForRequest = createAuth(requestOrigin)
    const session = await authForRequest.api.getSession({ headers: nodeHeadersToWebHeaders(req) })
    if (!session) {
      log("close unauthorized", { path: requestUrl.pathname })
      downstream.close(1008, "Unauthorized.")
      return
    }

    const requestedShipDeploymentId = asString(requestUrl.searchParams.get("shipDeploymentId"))
    log("connect", { stationKey: stationKeyRaw, requestedShipDeploymentId, userId: session.user.id })
    const selectedShip = await selectShipForRuntimeUi({
      userId: session.user.id,
      requestedShipDeploymentId,
    })
    if (!selectedShip) {
      log("close no ship", { userId: session.user.id, requestedShipDeploymentId })
      downstream.close(1008, "No ship deployment available.")
      return
    }

    const namespace = resolveShipNamespace(selectedShip.config, selectedShip.deploymentProfile)
    const resolvedRuntime = resolveOpenClawRuntimeUrlForStation({
      stationKey: stationKeyRaw,
      namespace,
    })
    if (!resolvedRuntime.href) {
      log("close missing runtime href", { stationKey: stationKeyRaw, namespace, source: resolvedRuntime.source })
      downstream.close(1008, "OpenClaw runtime UI target is not configured for this station.")
      return
    }

    const upstreamWsUrl = wsUrlForHttpUrl(resolvedRuntime.href)
    if (!upstreamWsUrl) {
      log("close invalid upstream ws url", { href: resolvedRuntime.href })
      downstream.close(1011, "Runtime UI upstream websocket URL is invalid.")
      return
    }

    const upstreamOrigin = originForHttpUrl(resolvedRuntime.href) || undefined
    log("upstream", { upstreamWsUrl, upstreamOrigin, source: resolvedRuntime.source })

    upstream = new WebSocket(upstreamWsUrl, {
      perMessageDeflate: false,
      ...(upstreamOrigin ? { origin: upstreamOrigin } : {}),
    })

    upstream.on("open", () => {
      log("upstream open", { bufferedDownstreamMessages: pendingDownstream.length })
      flushPendingDownstream()
    })

    upstream.on("message", (data, isBinary) => {
      if (downstream.readyState !== WebSocket.OPEN) {
        return
      }
      downstream.send(data, { binary: isBinary })
    })

    upstream.on("close", (code, reason) => {
      const reasonText = reason?.toString("utf8") || ""
      log("upstream close", { code, reason: reasonText })
      closeBoth(code, reason)
    })

    upstream.on("error", () => {
      log("upstream error")
      closeBoth(1011, "Upstream websocket error.")
    })

    // In case the upstream opens extremely quickly, flush any already-buffered messages.
    flushPendingDownstream()
  } catch (error) {
    console.error("Runtime UI websocket proxy failed:", error)
    downstream.close(1011, "Runtime UI websocket proxy failed.")
  }
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2))
  const port =
    parseNumber(cli.port)
    ?? parseNumber(process.env.PORT)
    ?? 3000
  const hostname = asString(cli.hostname) || asString(process.env.HOSTNAME) || "0.0.0.0"
  const forcedDev = parseBooleanEnv(process.env.ORCHWIZ_NEXT_DEV)
  const dev = forcedDev ?? process.env.NODE_ENV !== "production"
  if (forcedDev === true) {
    // Next.js "dev" mode expects NODE_ENV=development for some internals.
    const key = "NODE_ENV" as string
    process.env[key] = "development"
  }

  const app = next({
    dev,
    hostname,
    port,
  })
  const handle = app.getRequestHandler()
  let nextUpgradeHandler: undefined | ((req: http.IncomingMessage, socket: any, head: any) => void)

  const wss = new WebSocketServer({ noServer: true })

  wss.on("connection", (downstream, req) => {
    void handleRuntimeUiWsProxyConnection(downstream, req)
  })

  await app.prepare()
  nextUpgradeHandler = (app as any).getUpgradeHandler?.()

  const server = http.createServer((req, res) => {
    handle(req, res)
  })

  server.on("upgrade", (req, socket, head) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      const stationKeyRaw = extractStationKeyFromWsPath(requestUrl.pathname)
      if (!stationKeyRaw) {
        if (nextUpgradeHandler) {
          nextUpgradeHandler(req, socket, head)
          return
        }
        socket.destroy()
        return
      }

      if (!isBridgeStationKey(stationKeyRaw)) {
        socketHttpError(socket, 400, "Unknown bridge station.")
        return
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    } catch (error) {
      console.error("Runtime UI websocket proxy failed:", error)
      socketHttpError(socket, 500, "Runtime UI websocket proxy failed.")
    }
  })

  server.listen(port, hostname, () => {
    console.log(`OrchWiz server listening on http://${hostname}:${port} (dev=${dev})`)
  })
}

main().catch((error) => {
  console.error("Failed to start OrchWiz server:", error)
  process.exit(1)
})
