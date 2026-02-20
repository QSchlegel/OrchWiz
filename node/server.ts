// Next expects AsyncLocalStorage to be present on the global object at module init time.
// When running Next programmatically (tsx server.ts), we need to install the baseline first.
import "next/dist/server/node-environment-baseline"

import "./server-dotenv"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import next from "next"
import { spawn as ptySpawn, type IPty } from "node-pty"
import { WebSocket, WebSocketServer, type RawData } from "ws"
import { createAuth } from "./src/lib/auth"
import { prisma } from "./src/lib/prisma"
import { runDueNightlySecurityAudits } from "./src/lib/security/audit/nightly"
import {
  isMetricsRequestAuthorized,
  observeHttpRequest,
  recordNodeRuntimeSignals,
  renderPrometheusMetrics,
  resolveConfiguredMetricsToken,
  shouldRequireMetricsAuth,
} from "./src/lib/observability/prometheus"
import {
  isBridgeStationKey,
  resolveOpenClawRuntimeUrlForStation,
  resolveShipNamespace,
} from "./src/lib/bridge/openclaw-runtime"
import { resolveOpenClawSshTarget } from "./src/lib/bridge/openclaw-ssh-target"

interface ShipSelectionRecord {
  id: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  deploymentProfile: "local_starship_build" | "lightweight_shuttle" | "cloud_shipyard"
  config: unknown
  metadata: unknown
}

type DesktopAssetKey = "mac" | "windows" | "linux"

type ReleaseAsset = {
  name?: string
  size?: number
  browser_download_url?: string
}

type GitHubRelease = {
  id?: number
  tag_name?: string
  name?: string
  html_url?: string
  published_at?: string
  assets?: ReleaseAsset[]
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
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

function parseBooleanFlag(value: string | null): boolean {
  if (!value) {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on"
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

function parseRequestUrl(req: http.IncomingMessage): URL | null {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  } catch {
    return null
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0]
  }
  return null
}

function startLocalSecurityAuditCron() {
  const enabled = parseBooleanEnv(process.env.ORCHWIZ_LOCAL_CRON_ENABLED) === true
  if (!enabled) {
    return
  }

  const configuredIntervalMinutes = parseNumber(process.env.ORCHWIZ_LOCAL_CRON_INTERVAL_MINUTES)
  const intervalMinutes =
    configuredIntervalMinutes && configuredIntervalMinutes > 0 ? configuredIntervalMinutes : 60
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000

  const configuredIncludeReview = parseBooleanEnv(process.env.ORCHWIZ_LOCAL_CRON_INCLUDE_QUARTERMASTER_REVIEW)
  const includeQuartermasterReview = configuredIncludeReview ?? true

  let running = false
  const tick = async () => {
    if (running) {
      return
    }
    running = true

    try {
      const summary = await runDueNightlySecurityAudits({ includeQuartermasterReview })
      console.log("[local-cron] Security audits tick complete", {
        executedAt: summary.executedAt,
        dayKey: summary.dayKey,
        checkedUsers: summary.checkedUsers,
        succeeded: summary.succeeded,
        skipped: summary.skipped,
        failed: summary.failed,
      })
    } catch (error) {
      console.error("[local-cron] Security audits tick failed:", error)
    } finally {
      running = false
    }
  }

  console.log("[local-cron] Security audits scheduler enabled", {
    intervalMinutes,
    includeQuartermasterReview,
  })

  void tick()
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  timer.unref?.()
}

const SERVER_ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DOWNLOADS_DIR = path.join(SERVER_ROOT_DIR, "public", "downloads")
const DEFAULT_GITHUB_OWNER = "QSchlegel"
const DEFAULT_GITHUB_REPO = "OrchWiz"

const DESKTOP_DOWNLOADS: Record<DesktopAssetKey, { alias: string; assetName: RegExp }> = {
  mac: {
    alias: "orchwiz-mac.dmg",
    assetName: /^OrchWiz-Desktop-.*-mac\.dmg$/u,
  },
  windows: {
    alias: "orchwiz-win.exe",
    assetName: /^OrchWiz-Desktop-.*-win\.exe$/u,
  },
  linux: {
    alias: "orchwiz-linux.tar.gz",
    assetName: /^OrchWiz-Desktop-.*-linux\.tar\.gz$/u,
  },
}

const DESKTOP_DOWNLOAD_KEY_BY_ALIAS: Record<string, DesktopAssetKey> = Object.fromEntries(
  (Object.keys(DESKTOP_DOWNLOADS) as DesktopAssetKey[]).map((key) => [DESKTOP_DOWNLOADS[key].alias, key]),
) as Record<string, DesktopAssetKey>

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function fetchLatestRelease(args: {
  owner: string
  repo: string
  token: string | null
}): Promise<GitHubRelease> {
  const url = `https://api.github.com/repos/${args.owner}/${args.repo}/releases/latest`
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "orchwiz-server-downloads-fallback",
  }
  if (args.token) {
    headers.Authorization = `Bearer ${args.token}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`GitHub releases/latest failed (${response.status}): ${body.slice(0, 500)}`)
  }

  return (await response.json()) as GitHubRelease
}

let cachedLatestRelease:
  | { fetchedAtMs: number; owner: string; repo: string; token: string | null; release: GitHubRelease }
  | null = null
const LATEST_RELEASE_TTL_MS = 5 * 60 * 1000

async function fetchLatestReleaseCached(args: {
  owner: string
  repo: string
  token: string | null
}): Promise<GitHubRelease> {
  const now = Date.now()
  if (
    cachedLatestRelease
    && cachedLatestRelease.owner === args.owner
    && cachedLatestRelease.repo === args.repo
    && cachedLatestRelease.token === args.token
    && now - cachedLatestRelease.fetchedAtMs < LATEST_RELEASE_TTL_MS
  ) {
    return cachedLatestRelease.release
  }

  const release = await fetchLatestRelease(args)
  cachedLatestRelease = {
    fetchedAtMs: now,
    owner: args.owner,
    repo: args.repo,
    token: args.token,
    release,
  }
  return release
}

function pickReleaseAsset(release: GitHubRelease, key: DesktopAssetKey): Required<ReleaseAsset> | null {
  const assets = Array.isArray(release.assets) ? release.assets : []
  const match = assets.find((asset) => {
    const name = asString(asset.name)
    return name ? DESKTOP_DOWNLOADS[key].assetName.test(name) : false
  })

  const name = asString(match?.name)
  const url = asString(match?.browser_download_url)
  const size = typeof match?.size === "number" ? match.size : null

  if (!name || !url || size === null) {
    return null
  }

  return {
    name,
    browser_download_url: url,
    size,
  }
}

async function maybeHandleMissingDesktopDownload(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const method = (req.method || "").toUpperCase()
  if (method !== "GET" && method !== "HEAD") {
    return false
  }

  let requestUrl: URL
  try {
    requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
  } catch {
    return false
  }

  if (!requestUrl.pathname.startsWith("/downloads/")) {
    return false
  }

  const filename = requestUrl.pathname.split("/").filter(Boolean)[1] || null
  if (!filename) {
    return false
  }

  // Only handle stable alias files + manifest. Anything else (including versioned artifacts)
  // should continue through Next's normal static file server.
  const isManifest = filename === "manifest.json"
  const key = isManifest ? null : DESKTOP_DOWNLOAD_KEY_BY_ALIAS[filename] || null
  if (!isManifest && !key) {
    return false
  }

  const localPath = path.join(PUBLIC_DOWNLOADS_DIR, filename)
  if (await fileExists(localPath)) {
    return false
  }

  const owner = asString(process.env.ORCHWIZ_GITHUB_OWNER) || DEFAULT_GITHUB_OWNER
  const repo = asString(process.env.ORCHWIZ_GITHUB_REPO) || DEFAULT_GITHUB_REPO
  const token = asString(process.env.GITHUB_TOKEN)
  const releasesUrl = `https://github.com/${owner}/${repo}/releases`

  let release: GitHubRelease | null = null
  try {
    release = await fetchLatestReleaseCached({ owner, repo, token })
  } catch (error) {
    console.warn("Downloads fallback: failed to fetch latest GitHub release:", error)
  }

  if (isManifest) {
    const tag = asString(release?.tag_name) || "unknown"
    const publishedAt = asString(release?.published_at) || null

    const files: Record<string, any> = {}
    for (const assetKey of ["mac", "windows", "linux"] as const) {
      const asset = release ? pickReleaseAsset(release, assetKey) : null
      files[assetKey] = {
        alias: DESKTOP_DOWNLOADS[assetKey].alias,
        sourceName: asset?.name ?? null,
        sourceUrl: asset?.browser_download_url ?? null,
        bytes: asset?.size ?? null,
        sha256: null,
      }
    }

    const manifest = {
      version: tag,
      publishedAt,
      release: {
        id: release?.id ?? null,
        tag,
        name: asString(release?.name) || null,
        htmlUrl: asString(release?.html_url) || releasesUrl,
        source: `https://github.com/${owner}/${repo}`,
      },
      files,
      generatedAt: new Date().toISOString(),
      note:
        "This manifest was generated on-demand because /public/downloads/manifest.json was missing. To populate real artifacts + checksums locally, run `cd desktop && npm run dist && cd ../node && npm run downloads:mirror-local`, or publish a GitHub Release and run `cd node && npm run downloads:sync`.",
    }

    const body = `${JSON.stringify(manifest, null, 2)}\n`
    res.statusCode = 200
    res.setHeader("Content-Type", "application/json; charset=utf-8")
    res.setHeader("Cache-Control", "no-store")
    res.end(method === "HEAD" ? undefined : body)
    return true
  }

  const asset = release ? pickReleaseAsset(release, key as DesktopAssetKey) : null
  if (asset?.browser_download_url) {
    res.statusCode = 302
    res.setHeader("Location", asset.browser_download_url)
    res.setHeader("Cache-Control", "no-store")
    res.end()
    return true
  }

  // Dev-friendly failure mode: surface actionable instructions instead of a blank 404.
  if (process.env.NODE_ENV !== "production") {
    const help = [
      `Missing desktop installer: /downloads/${filename}`,
      "",
      "This repo expects desktop installers to be present in:",
      `  ${PUBLIC_DOWNLOADS_DIR}`,
      "",
      "Fix options:",
      "1) Build installers locally and mirror them into /public/downloads:",
      "   cd desktop && npm run dist",
      "   cd ../node && npm run downloads:mirror-local",
      "",
      "2) Publish a GitHub Release with assets named like:",
      "   OrchWiz-Desktop-<version>-mac.dmg",
      "   OrchWiz-Desktop-<version>-win.exe",
      "   OrchWiz-Desktop-<version>-linux.tar.gz",
      "   Then mirror them locally:",
      "   cd node && npm run downloads:sync",
      "",
      `Releases page: ${releasesUrl}`,
      "",
    ].join("\n")

    res.statusCode = 404
    res.setHeader("Content-Type", "text/plain; charset=utf-8")
    res.setHeader("Cache-Control", "no-store")
    res.end(method === "HEAD" ? undefined : help)
    return true
  }

  // Production fallback: send the user to the releases index (works even when "latest" doesn't exist).
  res.statusCode = 302
  res.setHeader("Location", releasesUrl)
  res.setHeader("Cache-Control", "no-store")
  res.end()
  return true
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

function normalizeHttpUrl(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString().replace(/\/+$/u, "")
  } catch {
    return null
  }
}

function isLoopbackOrLocalhostUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.trim().toLowerCase()
    return (
      hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname.endsWith(".localhost")
    )
  } catch {
    return false
  }
}

function resolveRuntimeUiGatewayBaseFromMetadata(args: {
  metadata: unknown
  stationKey: string
}): string | null {
  const runtimeUi = asRecord(asRecord(args.metadata).runtimeUi)
  const openclaw = asRecord(runtimeUi.openclaw)
  const urls = asRecord(openclaw.urls)
  return normalizeHttpUrl(asString(urls[args.stationKey]))
}

function resolveWsDirectTerminalPassthrough(url: URL): boolean {
  if (parseBooleanFlag(url.searchParams.get("directWs"))) {
    return true
  }
  return parseBooleanEnv(process.env.ORCHWIZ_RUNTIME_EDGE_DIRECT_TERMINAL_PASSTHROUGH) === true
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
      metadata: true,
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

function extractRuntimeUiStationKeyFromWsPath(pathname: string): string | null {
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

function extractRuntimeSshStationKeyFromWsPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  // /api/bridge/runtime-ssh/openclaw/:stationKey/ws
  const matchesWs =
    parts.length === 6
    && parts[0] === "api"
    && parts[1] === "bridge"
    && parts[2] === "runtime-ssh"
    && parts[3] === "openclaw"
    && parts[5] === "ws"

  if (!matchesWs) {
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

function appendUrlQueryParam(value: string, key: string, paramValue: string): string {
  try {
    const parsed = new URL(value)
    parsed.searchParams.set(key, paramValue)
    return parsed.toString()
  } catch {
    return value
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

function rawDataToUtf8(data: RawData): string {
  if (typeof data === "string") {
    return data
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8")
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8")
  }
  return Buffer.from(data).toString("utf8")
}

function sendRuntimeSshEvent(
  downstream: WebSocket,
  payload: Record<string, unknown>,
) {
  if (downstream.readyState !== WebSocket.OPEN) {
    return
  }

  downstream.send(JSON.stringify(payload))
}

async function handleRuntimeSshWsProxyConnection(downstream: WebSocket, req: http.IncomingMessage) {
  const debug = parseBooleanEnv(process.env.ORCHWIZ_DEBUG_OPENCLAW_SSH_WS) === true
  const startedAt = Date.now()
  const log = (...args: unknown[]) => {
    if (debug) {
      console.log("[openclaw-ssh-ws]", `+${Date.now() - startedAt}ms`, ...args)
    }
  }

  let ttyProcess: IPty | null = null
  let ttyExited = false
  let sshKeyDir: string | null = null
  let ttlTimer: NodeJS.Timeout | null = null
  let cleaned = false

  const closeDownstream = (code?: number, reason?: string) => {
    const safeCode = isValidWsCloseCode(code) ? code : undefined
    const safeReason = safeCode ? safeWsCloseReason(reason) : undefined
    if (downstream.readyState === WebSocket.OPEN || downstream.readyState === WebSocket.CONNECTING) {
      if (safeCode) {
        downstream.close(safeCode, safeReason)
      } else {
        downstream.close()
      }
    }
  }

  const cleanup = async () => {
    if (cleaned) {
      return
    }
    cleaned = true

    if (ttlTimer) {
      clearTimeout(ttlTimer)
      ttlTimer = null
    }

    if (ttyProcess && !ttyExited) {
      try {
        ttyProcess.kill("SIGTERM")
      } catch {
        // ignore
      }
      const forceKill = setTimeout(() => {
        if (ttyProcess && !ttyExited) {
          try {
            ttyProcess.kill("SIGKILL")
          } catch {
            // ignore
          }
        }
      }, 2_000)
      forceKill.unref?.()
    }

    if (sshKeyDir) {
      await fs.rm(sshKeyDir, { recursive: true, force: true }).catch(() => undefined)
      sshKeyDir = null
    }
  }

  downstream.on("close", (code, reason) => {
    log("downstream close", { code, reason: reason?.toString("utf8") || "" })
    void cleanup()
  })

  downstream.on("error", () => {
    log("downstream error")
    void cleanup()
  })

  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
    const stationKeyRaw = extractRuntimeSshStationKeyFromWsPath(requestUrl.pathname)
    if (!stationKeyRaw || !isBridgeStationKey(stationKeyRaw)) {
      closeDownstream(1008, "Unknown station key.")
      return
    }

    const requestOrigin = resolvePublicRequestOrigin(req)
    const authForRequest = createAuth(requestOrigin)
    const session = await authForRequest.api.getSession({ headers: nodeHeadersToWebHeaders(req) })
    if (!session) {
      closeDownstream(1008, "Unauthorized.")
      return
    }

    const requestedShipDeploymentId = asString(requestUrl.searchParams.get("shipDeploymentId"))
    const resolved = await resolveOpenClawSshTarget({
      userId: session.user.id,
      stationKey: stationKeyRaw,
      requestedShipDeploymentId,
    })
    if (resolved.ok === false) {
      sendRuntimeSshEvent(downstream, {
        type: "error",
        detail: resolved.detail,
        code: resolved.code,
        suggestedActions: resolved.suggestedActions,
      })
      closeDownstream(1008, resolved.detail)
      return
    }

    sendRuntimeSshEvent(downstream, {
      type: "status",
      state: "connecting",
      detail: `Connecting via ${resolved.target.strategy}...`,
      strategy: resolved.target.strategy,
    })

    const useLocalKubectl = resolved.target.strategy === "local_kubernetes_exec"
    let command = "kubectl"
    let commandArgs: string[] = [
      "-n",
      resolved.target.namespace,
      "exec",
      "-it",
      `deployment/openclaw-${resolved.target.stationKey}`,
      "--",
      "/bin/sh",
      "-lc",
      [
        "mkdir -p /tmp/owz-bin",
        "cat > /tmp/owz-bin/openclaw <<'OWZEOF'",
        "#!/bin/sh",
        "exec node /app/openclaw.mjs \"$@\"",
        "OWZEOF",
        "chmod +x /tmp/owz-bin/openclaw",
        "export PATH=\"/tmp/owz-bin:/usr/local/bin:/usr/bin:/bin\"",
        `export OPENCLAW_GATEWAY_URL="\${OPENCLAW_GATEWAY_URL:-ws://openclaw-${resolved.target.stationKey}:18789}"`,
        "export OPENCLAW_GATEWAY_TOKEN=\"${OPENCLAW_GATEWAY_TOKEN:-}\"",
        `export NO_PROXY="127.0.0.1,localhost,openclaw-${resolved.target.stationKey},.svc,\${NO_PROXY:-}"`,
        "export no_proxy=\"$NO_PROXY\"",
        "openclaw config set gateway.mode remote >/dev/null 2>&1 || true",
        "openclaw config set gateway.remote.url \"$OPENCLAW_GATEWAY_URL\" >/dev/null 2>&1 || true",
        "if [ -n \"${OPENCLAW_GATEWAY_TOKEN:-}\" ]; then openclaw config set gateway.remote.token \"$OPENCLAW_GATEWAY_TOKEN\" >/dev/null 2>&1 || true; fi",
        "openclaw gateway probe >/dev/null 2>&1 || true",
        "exec /bin/sh -i",
      ].join("\n"),
    ]
    let connectedDetail = `Connected via local kubectl in namespace ${resolved.target.namespace} (openclaw shim enabled).`

    if (!useLocalKubectl) {
      if (
        !resolved.target.sshHost
        || !resolved.target.sshUser
        || !resolved.target.privateKeyPem
        || typeof resolved.target.sshPort !== "number"
      ) {
        sendRuntimeSshEvent(downstream, {
          type: "error",
          code: "SSH_TARGET_UNRESOLVED",
          detail: "Resolved SSH target is missing host, user, port, or key material.",
          suggestedActions: ["Re-run SSH preflight and verify ship SSH metadata and key configuration."],
        })
        closeDownstream(1008, "Resolved SSH target is incomplete.")
        return
      }

      sshKeyDir = await fs.mkdtemp(path.join(tmpdir(), "owz-runtime-ssh-"))
      const keyFilePath = path.join(sshKeyDir, "id_ed25519")
      const knownHostsPath = path.join(sshKeyDir, "known_hosts")
      await fs.writeFile(keyFilePath, `${resolved.target.privateKeyPem.trim()}\n`, "utf8")
      await fs.chmod(keyFilePath, 0o600)
      await fs.writeFile(knownHostsPath, "", "utf8")

      command = "ssh"
      commandArgs = [
        "-tt",
        "-i",
        keyFilePath,
        "-p",
        String(resolved.target.sshPort),
        "-o",
        "BatchMode=yes",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        `UserKnownHostsFile=${knownHostsPath}`,
        `${resolved.target.sshUser}@${resolved.target.sshHost}`,
        resolved.target.remoteCommand,
      ]
      connectedDetail = `Connected to ${resolved.target.sshUser}@${resolved.target.sshHost}.`
    }

    log("tty spawn", {
      stationKey: stationKeyRaw,
      shipDeploymentId: resolved.target.shipDeploymentId,
      strategy: resolved.target.strategy,
      commandPreview: resolved.target.commandPreview,
    })

    try {
      ttyProcess = ptySpawn(command, commandArgs, {
        cols: 120,
        rows: 32,
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: process.env.TERM || "xterm-256color",
        },
      })
    } catch (error) {
      sendRuntimeSshEvent(downstream, {
        type: "error",
        detail: error instanceof Error && error.message ? error.message : "TTY process failed to start.",
      })
      closeDownstream(1011, "TTY process failed.")
      void cleanup()
      return
    }

    sendRuntimeSshEvent(downstream, {
      type: "status",
      state: "connected",
      detail: connectedDetail,
    })

    ttyProcess.onData((chunk) => {
      if (downstream.readyState !== WebSocket.OPEN) {
        return
      }
      downstream.send(chunk)
    })

    ttyProcess.onExit((event) => {
      ttyExited = true
      sendRuntimeSshEvent(downstream, {
        type: "status",
        state: "closed",
        detail: event.signal
          ? `TTY session ended (signal ${event.signal}).`
          : `TTY session ended (code ${event.exitCode ?? 0}).`,
      })
      closeDownstream(1000, "TTY session ended.")
      void cleanup()
    })

    downstream.on("message", (data) => {
      const text = rawDataToUtf8(data)
      if (!ttyProcess || ttyExited) {
        return
      }

      const trimmed = text.trim()
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const payload = JSON.parse(trimmed) as Record<string, unknown>
          const type = asString(payload.type)
          if (type === "disconnect") {
            closeDownstream(1000, "Client requested disconnect.")
            void cleanup()
            return
          }
          if (type === "resize") {
            const parsedCols = parseNumber(payload.cols)
            const parsedRows = parseNumber(payload.rows)
            const cols = Math.max(20, Math.min(400, Math.floor(parsedCols ?? 80)))
            const rows = Math.max(10, Math.min(200, Math.floor(parsedRows ?? 24)))
            ttyProcess.resize(cols, rows)
            return
          }
          if (type === "input") {
            const input = typeof payload.data === "string" ? payload.data : ""
            if (input.length > 0) {
              ttyProcess.write(input)
            }
            return
          }
        } catch {
          // Fall through to raw input handling.
        }
      }

      if (text.length > 0) {
        ttyProcess.write(text)
      }
    })

    const ttlMs = Math.max(
      60_000,
      parseNumber(process.env.ORCHWIZ_BRIDGE_SSH_TTY_MAX_SESSION_MS) ?? 30 * 60 * 1000,
    )
    ttlTimer = setTimeout(() => {
      sendRuntimeSshEvent(downstream, {
        type: "error",
        detail: "TTY session reached max lifetime and was closed.",
      })
      closeDownstream(1000, "TTY session expired.")
      void cleanup()
    }, ttlMs)
    ttlTimer.unref?.()
  } catch (error) {
    console.error("Runtime SSH websocket proxy failed:", error)
    sendRuntimeSshEvent(downstream, {
      type: "error",
      detail: "Runtime SSH websocket proxy failed.",
    })
    closeDownstream(1011, "Runtime SSH websocket proxy failed.")
    void cleanup()
  }
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
    const stationKeyRaw = extractRuntimeUiStationKeyFromWsPath(requestUrl.pathname)
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

    const metadataRuntimeUiUrl = resolveRuntimeUiGatewayBaseFromMetadata({
      metadata: selectedShip.metadata,
      stationKey: stationKeyRaw,
    })
    const runningInKubernetes = asString(process.env.KUBERNETES_SERVICE_HOST) !== null
    const metadataRuntimeUiUrlIsLoopback = metadataRuntimeUiUrl ? isLoopbackOrLocalhostUrl(metadataRuntimeUiUrl) : false
    const upstreamBaseUrl =
      metadataRuntimeUiUrl && (!runningInKubernetes || !metadataRuntimeUiUrlIsLoopback)
        ? metadataRuntimeUiUrl
        : resolvedRuntime.href

    const directTerminalPassthrough = resolveWsDirectTerminalPassthrough(requestUrl)
    const useDownstreamOriginPassthrough = directTerminalPassthrough

    let upstreamWsUrl = wsUrlForHttpUrl(upstreamBaseUrl)
    if (!upstreamWsUrl) {
      log("close invalid upstream ws url", { href: upstreamBaseUrl })
      downstream.close(1011, "Runtime UI upstream websocket URL is invalid.")
      return
    }

    if (metadataRuntimeUiUrl && upstreamBaseUrl === metadataRuntimeUiUrl && useDownstreamOriginPassthrough) {
      upstreamWsUrl = appendUrlQueryParam(upstreamWsUrl, "directWs", "1")
    }

    const downstreamOrigin = asString(firstHeaderValue(req.headers.origin))
    const upstreamOrigin = (() => {
      if (useDownstreamOriginPassthrough) {
        if (!downstreamOrigin) {
          return undefined
        }
        try {
          return new URL(downstreamOrigin).origin
        } catch {
          return undefined
        }
      }
      return originForHttpUrl(metadataRuntimeUiUrl || upstreamBaseUrl) || undefined
    })()
    log("upstream", {
      upstreamWsUrl,
      upstreamOrigin,
      source: resolvedRuntime.source,
      upstreamBaseUrl,
      metadataRuntimeUiUrl,
      directTerminalPassthrough,
      useDownstreamOriginPassthrough,
      downstreamOrigin,
    })

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

const MIGRATE_ENV_FILE = ".env.migrate"

function escapeEnvValue(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"').replace(/\n/gu, "\\n")
}

async function runMigrationsIfEnabled(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV
  const explicitlyEnabled = process.env.RUN_MIGRATIONS_ON_STARTUP === "true"
  const explicitlyDisabled = process.env.RUN_MIGRATIONS_ON_STARTUP === "false"
  if (explicitlyDisabled || (!explicitlyEnabled && nodeEnv !== "production")) {
    return
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.warn("[migrate] DATABASE_URL not set; skipping automatic migrations.")
    return
  }
  const migrateFilePath = path.join(SERVER_ROOT_DIR, MIGRATE_ENV_FILE)
  try {
    await fs.writeFile(
      migrateFilePath,
      `DATABASE_URL="${escapeEnvValue(databaseUrl)}"\n`,
      "utf8",
    )
  } catch (writeErr) {
    console.error("[migrate] Failed to write", MIGRATE_ENV_FILE, writeErr)
    throw new Error("DATABASE_URL is required for migrations. Set DATABASE_URL in your deployment environment.")
  }
  try {
    console.log("[migrate] Running prisma migrate deploy...")
    const migrateEnv = { ...process.env, DATABASE_URL: databaseUrl }
    const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      stdio: "pipe",
      shell: false,
      encoding: "utf8",
      cwd: SERVER_ROOT_DIR,
      env: migrateEnv,
    })
    const stderr = (result.stderr ?? result.stdout ?? "").trim()
    if (result.status !== 0) {
      const isUnreachable =
        /P1001|Can't reach database|ECONNREFUSED|connection refused/i.test(stderr)
      const isMissingUrl = /datasource\.url.*required|url.*required.*prisma config/i.test(stderr)
      if (isUnreachable && process.env.CI === "true") {
        console.warn(
          "[migrate] Database unreachable (CI or no DB). Skipping migrations and starting anyway.",
        )
        if (stderr) console.warn("[migrate] stderr:", stderr)
        return
      }
      if (isMissingUrl) {
        console.error(
          "[migrate] Prisma did not receive DATABASE_URL. Ensure DATABASE_URL is set in this environment (e.g. Railway service variables).",
        )
        if (stderr) console.error("[migrate] stderr:", stderr)
        throw new Error(
          "DATABASE_URL is required for migrations. Set DATABASE_URL in your deployment environment.",
        )
      }
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
      throw new Error(
        `prisma migrate deploy exited with code ${result.status ?? "unknown"}. Fix migrations or DATABASE_URL before starting.`,
      )
    }
    console.log("[migrate] Finished prisma migrate deploy.")
  } finally {
    try {
      await fs.rm(migrateFilePath, { force: true })
    } catch {
      // ignore
    }
  }
}

async function main() {
  await runMigrationsIfEnabled()

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
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      const runtimeSshStationKey = extractRuntimeSshStationKeyFromWsPath(requestUrl.pathname)
      if (runtimeSshStationKey) {
        void handleRuntimeSshWsProxyConnection(downstream, req)
        return
      }
    } catch {
      // Fall through to runtime-ui handler; it will fail with a websocket close if needed.
    }

    void handleRuntimeUiWsProxyConnection(downstream, req)
  })

  await app.prepare()
  nextUpgradeHandler = (app as any).getUpgradeHandler?.()
  const configuredMetricsToken = resolveConfiguredMetricsToken(
    process.env.PROMETHEUS_METRICS_BEARER_TOKEN || process.env.ORCHWIZ_METRICS_BEARER_TOKEN,
  )
  const requireMetricsAuth = shouldRequireMetricsAuth({
    nodeEnv: process.env.NODE_ENV,
    configuredToken: configuredMetricsToken,
  })

  const server = http.createServer((req, res) => {
    const requestUrl = parseRequestUrl(req)
    const finishMetricsRequest = observeHttpRequest({
      service: "app",
      method: req.method || "GET",
      pathname: requestUrl?.pathname || "/",
    })
    let metricsFinished = false
    const completeMetricsRequest = (statusCode: number) => {
      if (metricsFinished) {
        return
      }
      metricsFinished = true
      finishMetricsRequest(statusCode)
    }
    res.once("finish", () => {
      completeMetricsRequest(res.statusCode)
    })
    res.once("close", () => {
      completeMetricsRequest(res.writableEnded ? res.statusCode : 499)
    })

    void (async () => {
      try {
        if (requestUrl?.pathname === "/metrics") {
          const method = (req.method || "GET").toUpperCase()
          if (method !== "GET" && method !== "HEAD") {
            res.statusCode = 405
            res.setHeader("Allow", "GET, HEAD")
            res.setHeader("Content-Type", "text/plain; charset=utf-8")
            res.end("Method Not Allowed\n")
            return
          }

          const authorized = isMetricsRequestAuthorized({
            authorizationHeader: firstHeaderValue(req.headers.authorization),
            configuredToken: configuredMetricsToken,
            authRequired: requireMetricsAuth,
          })
          if (!authorized) {
            res.statusCode = 401
            res.setHeader("WWW-Authenticate", "Bearer")
            res.setHeader("Content-Type", "text/plain; charset=utf-8")
            res.end("Unauthorized\n")
            return
          }

          recordNodeRuntimeSignals({ service: "app" })
          const metrics = await renderPrometheusMetrics()
          res.statusCode = 200
          res.setHeader("Cache-Control", "no-store")
          res.setHeader("Content-Type", metrics.contentType)
          res.end(method === "HEAD" ? "" : metrics.body)
          return
        }

        if (await maybeHandleMissingDesktopDownload(req, res)) {
          return
        }
        handle(req, res)
      } catch (error) {
        console.error("Downloads fallback handler failed:", error)
        if (!res.headersSent) {
          handle(req, res)
          return
        }
        res.end()
      }
    })()
  })

  server.on("upgrade", (req, socket, head) => {
    try {
      const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)
      const runtimeUiStationKeyRaw = extractRuntimeUiStationKeyFromWsPath(requestUrl.pathname)
      const runtimeSshStationKeyRaw = extractRuntimeSshStationKeyFromWsPath(requestUrl.pathname)
      const stationKeyRaw = runtimeUiStationKeyRaw || runtimeSshStationKeyRaw
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
      console.error("Runtime websocket proxy failed:", error)
      socketHttpError(socket, 500, "Runtime websocket proxy failed.")
    }
  })

  server.listen(port, hostname, () => {
    console.log(`OrchWiz server listening on http://${hostname}:${port} (dev=${dev})`)
    startLocalSecurityAuditCron()
  })
}

main().catch((error) => {
  console.error("Failed to start OrchWiz server:", error)
  process.exit(1)
})
