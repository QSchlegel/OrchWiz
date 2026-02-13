import "./../../server-dotenv"
import http from "node:http"
import { Readable } from "node:stream"
import crypto from "node:crypto"
import { WebSocket, WebSocketServer, type RawData } from "ws"
import { verifyRuntimeJwt, ORCHWIZ_RUNTIME_JWT_COOKIE_NAME } from "../lib/runtime-jwt"

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) return parsed
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

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8")
  const bBuf = Buffer.from(b, "utf8")
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

function stripTrailingSlash(value: string): string {
  const trimmed = value.replace(/\/+$/u, "")
  return trimmed.length > 0 ? trimmed : "/"
}

function joinPaths(base: string, suffix: string): string {
  const nextBase = stripTrailingSlash(base)
  const nextSuffix = suffix.replace(/^\/+/u, "")
  if (!nextSuffix) {
    return nextBase
  }
  if (nextBase === "/") {
    return `/${nextSuffix}`
  }
  return `${nextBase}/${nextSuffix}`.replace(/\/{2,}/gu, "/")
}

function parseCookieHeader(value: string | null): Record<string, string> {
  if (!value) return {}
  const out: Record<string, string> = {}
  for (const part of value.split(";")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex <= 0) continue
    const name = trimmed.slice(0, eqIndex).trim()
    const cookieValue = trimmed.slice(eqIndex + 1).trim()
    if (!name) continue
    out[name] = cookieValue
  }
  return out
}

function extractBearerToken(value: string | null): string | null {
  const raw = asString(value)
  if (!raw) return null
  const [scheme, ...rest] = raw.split(/\s+/u)
  if (!scheme || scheme.toLowerCase() !== "bearer") return null
  const token = rest.join(" ").trim()
  return token.length > 0 ? token : null
}

function authenticateRequest(req: http.IncomingMessage): { ok: true; userId: string } | { ok: false; error: string } {
  const secret = asString(process.env.ORCHWIZ_RUNTIME_JWT_SECRET)
  if (!secret) {
    return { ok: false, error: "Runtime JWT is not configured." }
  }

  const issuer = asString(process.env.ORCHWIZ_RUNTIME_JWT_ISSUER) || "orchwiz"
  const audience = asString(process.env.ORCHWIZ_RUNTIME_JWT_AUDIENCE) || "orchwiz-runtime-edge"

  const bearer = extractBearerToken(typeof req.headers.authorization === "string" ? req.headers.authorization : null)
  const cookies = parseCookieHeader(typeof req.headers.cookie === "string" ? req.headers.cookie : null)
  const token = bearer || cookies[ORCHWIZ_RUNTIME_JWT_COOKIE_NAME] || null
  const verified = token
    ? verifyRuntimeJwt(token, {
        secret,
        issuer,
        audience,
      })
    : { ok: false as const, error: "Missing runtime auth token." }

  if (!verified.ok) {
    return { ok: false, error: verified.error }
  }

  return { ok: true, userId: verified.payload.sub }
}

function isBridgeStationKey(value: unknown): value is "xo" | "ops" | "eng" | "sec" | "med" | "cou" {
  return value === "xo" || value === "ops" || value === "eng" || value === "sec" || value === "med" || value === "cou"
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function parseGatewayTokenMap(raw: string | undefined): Partial<Record<string, string>> {
  const normalized = asString(raw)
  if (!normalized) return {}

  try {
    const decoded = JSON.parse(normalized) as unknown
    const record = asRecord(decoded)
    const out: Partial<Record<string, string>> = {}
    for (const [key, value] of Object.entries(record)) {
      const stationKey = key.trim().toLowerCase()
      if (!isBridgeStationKey(stationKey)) continue
      const token = asString(value)
      if (!token) continue
      out[stationKey] = token
    }
    return out
  } catch {
    // Fall through to CSV parsing.
  }

  const out: Partial<Record<string, string>> = {}
  for (const entry of normalized.split(",")) {
    const [rawKey, ...rawValueParts] = entry.split("=")
    const stationKey = rawKey?.trim().toLowerCase() || ""
    if (!isBridgeStationKey(stationKey)) continue
    const token = asString(rawValueParts.join("="))
    if (!token) continue
    out[stationKey] = token
  }
  return out
}

function resolveOpenClawGatewayToken(stationKey: string): string | null {
  if (!isBridgeStationKey(stationKey)) return null
  const envKey = `OPENCLAW_GATEWAY_TOKEN_${stationKey.toUpperCase()}`
  return (
    asString(process.env[envKey])
    || parseGatewayTokenMap(process.env.OPENCLAW_GATEWAY_TOKENS)[stationKey]
    || asString(process.env.OPENCLAW_GATEWAY_TOKEN)
  )
}

function wsUrlForHttpBase(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:"
    parsed.search = ""
    return parsed.toString()
  } catch {
    return null
  }
}

function rewriteHtmlForProxy(args: {
  html: string
  baseHref: string
  openclaw?: {
    gatewayUrl: string
    gatewayToken: string | null
  }
}): string {
  const injections: string[] = []

  if (args.baseHref !== "/" && !/<base\s/iu.test(args.html)) {
    injections.push(`<base href="${args.baseHref}">`)
  }

  if (args.openclaw) {
    injections.push(
      `<script>(function(){try{var key="openclaw.control.settings.v1";var deviceKey="openclaw.device.auth.v1";var raw=window.localStorage.getItem(key);var current=null;try{current=raw?JSON.parse(raw):null;}catch(e){current=null;}var next=(current&&typeof current==="object")?current:{};var prevGatewayUrl=typeof next.gatewayUrl==="string"?next.gatewayUrl:"";var prevToken=typeof next.token==="string"?next.token:"";next.gatewayUrl=${JSON.stringify(
        args.openclaw.gatewayUrl,
      )};${
        args.openclaw.gatewayToken
          ? `next.token=${JSON.stringify(args.openclaw.gatewayToken)};`
          : ""
      }window.localStorage.setItem(key,JSON.stringify(next));${
        args.openclaw.gatewayToken
          ? `try{if(prevGatewayUrl!==next.gatewayUrl||prevToken!==next.token){window.localStorage.removeItem(deviceKey);}}catch(e){}`
          : ""
      }}catch(e){}})();</script>`,
    )
  }

  const rewritten = args.baseHref === "/"
    ? args.html
    : args.html.replace(
      /(href|src|action)=(["'])\/(?!\/)/giu,
      `$1=$2${args.baseHref}`,
    )

  return injections.length === 0
    ? rewritten
    : rewritten.replace(/<head(\s[^>]*)?>/iu, (match) => `${match}${injections.join("")}`)
}

type RuntimeTarget =
  | {
      kind: "openclaw"
      stationKey: "xo" | "ops" | "eng" | "sec" | "med" | "cou"
      upstreamBaseUrl: string
      publicBaseUrl: string
      publicBasePath: string
      upstreamPathSuffix: string
      wsUpstreamUrl: string
      wsPublicUrl: string
    }
  | {
      kind: "kubeview"
      upstreamBaseUrl: string
      publicBaseUrl: string
      publicBasePath: string
      upstreamPathSuffix: string
    }

function resolveRequestOrigin(req: http.IncomingMessage): { proto: "http" | "https"; host: string } {
  const host = (typeof req.headers["x-forwarded-host"] === "string" ? req.headers["x-forwarded-host"] : null)
    || (typeof req.headers.host === "string" ? req.headers.host : null)
    || "localhost"

  const forwardedProto = typeof req.headers["x-forwarded-proto"] === "string" ? req.headers["x-forwarded-proto"] : null
  if (forwardedProto === "https" || forwardedProto === "http") {
    return { proto: forwardedProto, host }
  }
  return { proto: "http", host }
}

function resolveRuntimeTarget(req: http.IncomingMessage, url: URL): RuntimeTarget | null {
  const { proto, host } = resolveRequestOrigin(req)
  const origin = `${proto}://${host}`
  const hostName = host.split(":")[0]?.trim().toLowerCase() || ""

  // Cloud (host-based): openclaw-xo.<domain>, kubeview.<domain>
  if (hostName.startsWith("openclaw-")) {
    const stationKey = hostName.slice("openclaw-".length).split(".")[0]?.trim().toLowerCase() || ""
    if (isBridgeStationKey(stationKey)) {
      const publicBaseUrl = `${origin}`
      const publicBasePath = "/"
      const upstreamBaseUrl = `http://openclaw-${stationKey}:18789`
      const upstreamPathSuffix = url.pathname.replace(/^\/+/u, "")
      const wsUpstreamUrl = `ws://openclaw-${stationKey}:18789/${upstreamPathSuffix}`.replace(/\/{2,}/gu, "/")
      const wsPublicUrl = wsUrlForHttpBase(publicBaseUrl) || `${proto === "https" ? "wss" : "ws"}://${host}`
      return {
        kind: "openclaw",
        stationKey,
        upstreamBaseUrl,
        publicBaseUrl,
        publicBasePath,
        upstreamPathSuffix,
        wsUpstreamUrl,
        wsPublicUrl,
      }
    }
  }

  if (hostName.startsWith("kubeview.")) {
    const publicBaseUrl = `${origin}`
    const publicBasePath = "/"
    const appName = asString(process.env.ORCHWIZ_APP_NAME) || "orchwiz"
    const upstreamBaseUrl = `http://${appName}-kubeview:8000`
    const upstreamPathSuffix = url.pathname.replace(/^\/+/u, "")
    return {
      kind: "kubeview",
      upstreamBaseUrl,
      publicBaseUrl,
      publicBasePath,
      upstreamPathSuffix,
    }
  }

  // Local (path-based): /openclaw/:stationKey/*, /kubeview/*
  const parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] === "openclaw" && isBridgeStationKey(parts[1])) {
    const stationKey = parts[1]
    const publicBasePath = `/openclaw/${stationKey}`
    const publicBaseUrl = `${origin}${publicBasePath}`
    const upstreamBaseUrl = `http://openclaw-${stationKey}:18789`
    const upstreamPathSuffix = parts.slice(2).join("/")
    const wsUpstreamUrl = `ws://openclaw-${stationKey}:18789/${upstreamPathSuffix}`.replace(/\/{2,}/gu, "/")
    const wsPublicUrl = wsUrlForHttpBase(publicBaseUrl) || `${proto === "https" ? "wss" : "ws"}://${host}${publicBasePath}`
    return {
      kind: "openclaw",
      stationKey,
      upstreamBaseUrl,
      publicBaseUrl,
      publicBasePath,
      upstreamPathSuffix,
      wsUpstreamUrl,
      wsPublicUrl,
    }
  }

  if (parts[0] === "kubeview") {
    const publicBasePath = "/kubeview"
    const publicBaseUrl = `${origin}${publicBasePath}`
    const appName = asString(process.env.ORCHWIZ_APP_NAME) || "orchwiz"
    const upstreamBaseUrl = `http://${appName}-kubeview:8000`
    const upstreamPathSuffix = parts.slice(1).join("/")
    return {
      kind: "kubeview",
      upstreamBaseUrl,
      publicBaseUrl,
      publicBasePath,
      upstreamPathSuffix,
    }
  }

  return null
}

function shouldStreamRequestBody(method: string): boolean {
  const upper = method.toUpperCase()
  return !(upper === "GET" || upper === "HEAD")
}

function copyRequestHeadersForUpstream(req: http.IncomingMessage): Headers {
  const headers = new Headers()

  const accept = typeof req.headers.accept === "string" ? req.headers.accept : "*/*"
  headers.set("accept", accept)

  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null
  headers.set("user-agent", ua || "OrchWiz-RuntimeEdge")

  const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : null
  if (contentType) headers.set("content-type", contentType)

  const contentLength = typeof req.headers["content-length"] === "string" ? req.headers["content-length"] : null
  if (contentLength) headers.set("content-length", contentLength)

  const encoding = typeof req.headers["content-encoding"] === "string" ? req.headers["content-encoding"] : null
  if (encoding) headers.set("content-encoding", encoding)

  // If the client supplies Authorization (for OpenClaw), allow it to pass through.
  const authz = typeof req.headers.authorization === "string" ? req.headers.authorization : null
  if (authz) headers.set("authorization", authz)

  return headers
}

function rewriteUpstreamLocation(args: {
  location: string
  upstreamBaseUrl: string
  publicBaseUrl: string
}): string {
  try {
    const upstreamBase = new URL(args.upstreamBaseUrl)
    const resolved = new URL(args.location, upstreamBase)
    if (resolved.origin !== upstreamBase.origin) {
      return args.location
    }

    const publicBase = new URL(args.publicBaseUrl)

    const upstreamBasePath = stripTrailingSlash(upstreamBase.pathname)
    const fullPath = resolved.pathname
    const relativePath =
      upstreamBasePath !== "/" && fullPath.startsWith(upstreamBasePath)
        ? fullPath.slice(upstreamBasePath.length).replace(/^\/+/u, "")
        : fullPath.replace(/^\/+/u, "")

    const nextPath = joinPaths(stripTrailingSlash(publicBase.pathname), relativePath)
    publicBase.pathname = nextPath
    publicBase.search = resolved.search
    publicBase.hash = resolved.hash
    return publicBase.toString()
  } catch {
    return args.location
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message
  }
  return "Unknown runtime-edge error."
}

async function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const requestUrl = new URL(req.url || "/", "http://localhost")

  if (requestUrl.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  const authn = authenticateRequest(req)
  if (!authn.ok) {
    res.writeHead(401, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    res.end(JSON.stringify({ error: "Unauthorized", detail: authn.error }))
    return
  }

  const target = resolveRuntimeTarget(req, requestUrl)
  if (!target) {
    res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    res.end(JSON.stringify({ error: "Unknown runtime UI path." }))
    return
  }

  const upstreamUrl = new URL(target.upstreamBaseUrl)
  upstreamUrl.pathname = joinPaths(stripTrailingSlash(upstreamUrl.pathname), target.upstreamPathSuffix)
  upstreamUrl.search = requestUrl.search

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method || "GET",
      headers: copyRequestHeadersForUpstream(req),
      ...(shouldStreamRequestBody(req.method || "GET") ? { body: req as any, duplex: "half" as any } : {}),
      redirect: "manual",
    } as any)
  } catch (error) {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
    res.end(
      JSON.stringify({
        error: "Runtime UI upstream is unreachable.",
        detail: errorMessage(error),
        upstreamUrl: upstreamUrl.toString(),
      }),
    )
    return
  }

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete("content-security-policy")
  responseHeaders.delete("x-frame-options")
  responseHeaders.delete("content-length")
  responseHeaders.set("cache-control", "no-store")

  const location = responseHeaders.get("location")
  if (location) {
    responseHeaders.set(
      "location",
      rewriteUpstreamLocation({
        location,
        upstreamBaseUrl: target.upstreamBaseUrl,
        publicBaseUrl: target.publicBaseUrl,
      }),
    )
  }

  const contentType = responseHeaders.get("content-type") || ""
  const wantsHtmlRewrite =
    (req.method || "GET").toUpperCase() === "GET"
    && contentType.toLowerCase().includes("text/html")

  const headerPairs: Record<string, string> = {}
  for (const [key, value] of responseHeaders.entries()) {
    headerPairs[key] = value
  }

  if (wantsHtmlRewrite) {
    const baseHref = target.publicBasePath === "/" ? "/" : `${stripTrailingSlash(target.publicBasePath)}/`
    const rawHtml = await upstream.text()
    const html = rewriteHtmlForProxy({
      html: rawHtml,
      baseHref,
      ...(target.kind === "openclaw"
        ? {
            openclaw: {
              gatewayUrl: target.wsPublicUrl,
              gatewayToken: resolveOpenClawGatewayToken(target.stationKey),
            },
          }
        : {}),
    })

    res.writeHead(upstream.status, headerPairs)
    res.end(html)
    return
  }

  res.writeHead(upstream.status, headerPairs)

  if ((req.method || "GET").toUpperCase() === "HEAD") {
    res.end()
    return
  }

  if (!upstream.body) {
    res.end()
    return
  }

  Readable.fromWeb(upstream.body as any).pipe(res)
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
  if (!text) return undefined
  if (Buffer.byteLength(text, "utf8") <= 120) return text
  return undefined
}

async function handleWsProxyConnection(downstream: WebSocket, req: http.IncomingMessage) {
  const debug = parseBooleanEnv(process.env.ORCHWIZ_RUNTIME_EDGE_DEBUG_WS) === true
  const startedAt = Date.now()
  const log = (...args: unknown[]) => {
    if (debug) {
      console.log("[runtime-edge-ws]", `+${Date.now() - startedAt}ms`, ...args)
    }
  }

  let upstream: WebSocket | null = null
  const pendingDownstream: Array<{ data: RawData; isBinary: boolean }> = []

  const closeBoth = (code?: number, reason?: Buffer | string) => {
    const safeCode = isValidWsCloseCode(code) ? code : undefined
    const reasonText = safeCode ? safeWsCloseReason(reason) : undefined
    if (downstream.readyState === WebSocket.OPEN || downstream.readyState === WebSocket.CONNECTING) {
      if (safeCode) downstream.close(safeCode, reasonText)
      else downstream.close()
    }
    if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
      if (safeCode) upstream.close(safeCode, reasonText)
      else upstream.close()
    }
  }

  const flushPendingDownstream = () => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return
    while (pendingDownstream.length > 0) {
      const next = pendingDownstream.shift()
      if (!next) break
      upstream.send(next.data, { binary: next.isBinary })
    }
  }

  downstream.on("message", (data, isBinary) => {
    if (upstream?.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary })
      return
    }
    pendingDownstream.push({ data, isBinary })
  })

  downstream.on("close", (code, reason) => {
    log("downstream close", { code, reason: reason?.toString("utf8") || "" })
    closeBoth(code, reason)
  })

  downstream.on("error", () => {
    log("downstream error")
    closeBoth(1011, "Downstream websocket error.")
  })

  try {
    const authn = authenticateRequest(req)
    if (!authn.ok) {
      downstream.close(1008, "Unauthorized.")
      return
    }

    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    const target = resolveRuntimeTarget(req, requestUrl)
    if (!target || target.kind !== "openclaw") {
      downstream.close(1008, "Unknown runtime websocket target.")
      return
    }

    // OpenClaw websocket endpoint is served from the same base as its HTTP UI.
    upstream = new WebSocket(target.wsUpstreamUrl, {
      perMessageDeflate: false,
    })

    upstream.on("open", () => {
      log("upstream open", { bufferedDownstreamMessages: pendingDownstream.length })
      flushPendingDownstream()
    })

    upstream.on("message", (data, isBinary) => {
      if (downstream.readyState !== WebSocket.OPEN) return
      downstream.send(data, { binary: isBinary })
    })

    upstream.on("close", (code, reason) => {
      log("upstream close", { code, reason: reason?.toString("utf8") || "" })
      closeBoth(code, reason)
    })

    upstream.on("error", () => {
      log("upstream error")
      closeBoth(1011, "Upstream websocket error.")
    })

    flushPendingDownstream()
  } catch (error) {
    console.error("Runtime-edge websocket proxy failed:", error)
    downstream.close(1011, "Runtime websocket proxy failed.")
  }
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2))
  const port = parseNumber(cli.port) ?? parseNumber(process.env.PORT) ?? 3100
  const hostname = asString(cli.hostname) || asString(process.env.HOSTNAME) || "0.0.0.0"

  const wss = new WebSocketServer({ noServer: true })
  wss.on("connection", (downstream, req) => {
    void handleWsProxyConnection(downstream, req)
  })

  const server = http.createServer((req, res) => {
    void handleHttpRequest(req, res).catch((error) => {
      console.error("Runtime-edge request failed:", error)
      res.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
      res.end(JSON.stringify({ error: "Internal server error." }))
    })
  })

  server.on("upgrade", (req, socket, head) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      const target = resolveRuntimeTarget(req, requestUrl)
      if (!target || target.kind !== "openclaw") {
        socketHttpError(socket, 404, "Unknown runtime websocket target.")
        return
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    } catch (error) {
      console.error("Runtime-edge websocket proxy failed:", error)
      socketHttpError(socket, 500, "Runtime websocket proxy failed.")
    }
  })

  server.listen(port, hostname, () => {
    console.log(`OrchWiz runtime-edge listening on http://${hostname}:${port}`)
  })
}

main().catch((error) => {
  console.error("Failed to start runtime-edge:", error)
})

