import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  isBridgeStationKey,
  resolveOpenClawRuntimeUrlForStation,
  resolveShipNamespace,
} from "@/lib/bridge/openclaw-runtime"

export const dynamic = "force-dynamic"

interface RuntimeUiRouteParams {
  stationKey: string
  runtimePath?: string[]
}

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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function stripTrailingSlash(value: string): string {
  const trimmed = value.replace(/\/+$/u, "")
  return trimmed.length > 0 ? trimmed : "/"
}

function parseGatewayTokenMap(
  raw: string | undefined,
): Partial<Record<string, string>> {
  const normalized = asString(raw)
  if (!normalized) {
    return {}
  }

  try {
    const decoded = JSON.parse(normalized) as unknown
    const record = asRecord(decoded)
    const out: Partial<Record<string, string>> = {}
    for (const [key, value] of Object.entries(record)) {
      const stationKey = key.trim().toLowerCase()
      if (!isBridgeStationKey(stationKey)) {
        continue
      }
      const token = asString(value)
      if (!token) {
        continue
      }
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
    if (!isBridgeStationKey(stationKey)) {
      continue
    }
    const token = asString(rawValueParts.join("="))
    if (!token) {
      continue
    }
    out[stationKey] = token
  }
  return out
}

function buildUpstreamUrl(args: {
  baseUrl: string
  runtimePath: string[]
  searchParams: URLSearchParams
}): URL {
  const upstream = new URL(args.baseUrl)
  const joinedPath = args.runtimePath
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  if (joinedPath.length > 0) {
    const basePath = stripTrailingSlash(upstream.pathname)
    upstream.pathname = `${basePath}/${joinedPath}`.replace(/\/{2,}/gu, "/")
  }

  const nextSearch = new URLSearchParams(args.searchParams)
  nextSearch.delete("shipDeploymentId")
  // Deprecated: older Bridge links used this query param to toggle websocket proxying.
  nextSearch.delete("directWs")
  upstream.search = nextSearch.toString()

  return upstream
}

function proxyBasePath(stationKey: string): string {
  return `/api/bridge/runtime-ui/openclaw/${stationKey}`
}

function wsUrlForHttpBase(value: string): string | null {
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

function rewriteUpstreamLocation(args: {
  location: string
  upstreamBaseUrl: string
  stationKey: string
  shipDeploymentId: string | null
}): string {
  try {
    const upstreamBase = new URL(args.upstreamBaseUrl)
    const resolved = new URL(args.location, upstreamBase)
    if (resolved.origin !== upstreamBase.origin) {
      return args.location
    }

    const basePath = stripTrailingSlash(upstreamBase.pathname)
    const fullPath = resolved.pathname
    const relativePath =
      basePath !== "/" && fullPath.startsWith(basePath)
        ? fullPath.slice(basePath.length).replace(/^\/+/u, "")
        : fullPath.replace(/^\/+/u, "")

    const target = `${proxyBasePath(args.stationKey)}${relativePath ? `/${relativePath}` : ""}`
    const query = new URLSearchParams(resolved.searchParams)
    if (args.shipDeploymentId) {
      query.set("shipDeploymentId", args.shipDeploymentId)
    }
    return query.size > 0 ? `${target}?${query.toString()}` : target
  } catch {
    return args.location
  }
}

function rewriteHtmlForProxy(args: {
  html: string
  stationKey: string
  gatewayUrl: string
  gatewayToken: string | null
}): string {
  const baseHref = `${proxyBasePath(args.stationKey)}/`
  const injections: string[] = []

  if (!/<base\s/iu.test(args.html)) {
    injections.push(`<base href="${baseHref}">`)
  }

  injections.push(
    `<script>(function(){try{var key="openclaw.control.settings.v1";var deviceKey="openclaw.device.auth.v1";var raw=window.localStorage.getItem(key);var current=null;try{current=raw?JSON.parse(raw):null;}catch(e){current=null;}var next=(current&&typeof current==="object")?current:{};var prevGatewayUrl=typeof next.gatewayUrl==="string"?next.gatewayUrl:"";var prevToken=typeof next.token==="string"?next.token:"";next.gatewayUrl=${JSON.stringify(
      args.gatewayUrl,
    )};${
      args.gatewayToken
        ? `next.token=${JSON.stringify(args.gatewayToken)};`
        : ""
    }window.localStorage.setItem(key,JSON.stringify(next));${
      // Device auth tokens are cached per browser identity, but not namespaced by gateway URL.
      // When we proxy multiple OpenClaw instances through one origin, that cache can become stale.
      args.gatewayToken
        ? `try{if(prevGatewayUrl!==next.gatewayUrl||prevToken!==next.token){window.localStorage.removeItem(deviceKey);}}catch(e){}`
        : ""
    }}catch(e){}})();</script>`,
  )

  // Rewrite root-absolute URLs ("/...") so runtime UI assets/actions stay within the proxy base path.
  // Do this before injecting `<base>` so the injected tag doesn't get double-prefixed.
  const rewritten = args.html.replace(
    /(href|src|action)=(["'])\/(?!\/)/giu,
    `$1=$2${baseHref}`,
  )

  return injections.length === 0
    ? rewritten
    : rewritten.replace(/<head(\s[^>]*)?>/iu, (match) => `${match}${injections.join("")}`)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message
  }
  return "Unknown runtime UI proxy error."
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
      return explicit
    }
  }

  return ships.find((ship) => ship.status === "active") || ships[0]
}

async function handleRuntimeUiProxy(
  request: NextRequest,
  params: RuntimeUiRouteParams,
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isBridgeStationKey(params.stationKey)) {
    return NextResponse.json({ error: "Unknown bridge station." }, { status: 400 })
  }

  const shipDeploymentId = asString(request.nextUrl.searchParams.get("shipDeploymentId"))
  const selectedShip = await selectShipForRuntimeUi({
    userId: session.user.id,
    requestedShipDeploymentId: shipDeploymentId,
  })
  if (!selectedShip) {
    return NextResponse.json({ error: "No ship deployment available." }, { status: 404 })
  }

  const namespace = resolveShipNamespace(selectedShip.config, selectedShip.deploymentProfile)
  const resolvedRuntime = resolveOpenClawRuntimeUrlForStation({
    stationKey: params.stationKey,
    namespace,
  })
  if (!resolvedRuntime.href) {
    return NextResponse.json(
      {
        error: "OpenClaw runtime UI target is not configured for this station.",
        details: {
          stationKey: params.stationKey,
          namespace,
          source: resolvedRuntime.source,
        },
      },
      { status: 404 },
    )
  }

  const upstreamUrl = buildUpstreamUrl({
    baseUrl: resolvedRuntime.href,
    runtimePath: params.runtimePath || [],
    searchParams: request.nextUrl.searchParams,
  })

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        Accept: request.headers.get("accept") || "*/*",
        "User-Agent": request.headers.get("user-agent") || "OrchWiz-Bridge-RuntimeUiProxy",
      },
      redirect: "manual",
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Runtime UI upstream is unreachable.",
        details: {
          stationKey: params.stationKey,
          namespace,
          source: resolvedRuntime.source,
          runtimeBaseUrl: resolvedRuntime.href,
          upstreamUrl: upstreamUrl.toString(),
          reason: errorMessage(error),
        },
      },
      { status: 502 },
    )
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
        upstreamBaseUrl: resolvedRuntime.href,
        stationKey: params.stationKey,
        shipDeploymentId: selectedShip.id,
      }),
    )
  }

  const contentType = responseHeaders.get("content-type") || ""
  if (request.method === "GET" && contentType.toLowerCase().includes("text/html")) {
    const gatewayUrl = wsUrlForHttpBase(resolvedRuntime.href)
    if (!gatewayUrl) {
      return NextResponse.json(
        {
          error: "OpenClaw runtime websocket URL is invalid.",
          details: {
            stationKey: params.stationKey,
            namespace,
            source: resolvedRuntime.source,
            runtimeBaseUrl: resolvedRuntime.href,
          },
        },
        { status: 500 },
      )
    }
    const stationTokenKey = `OPENCLAW_GATEWAY_TOKEN_${params.stationKey.toUpperCase()}`
    const gatewayToken =
      asString(process.env[stationTokenKey])
      || parseGatewayTokenMap(process.env.OPENCLAW_GATEWAY_TOKENS)[params.stationKey]
      || asString(process.env.OPENCLAW_GATEWAY_TOKEN)

    const body = rewriteHtmlForProxy({
      html: await upstream.text(),
      stationKey: params.stationKey,
      gatewayUrl,
      gatewayToken,
    })
    return new NextResponse(body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  }

  return new NextResponse(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RuntimeUiRouteParams> },
) {
  try {
    return await handleRuntimeUiProxy(request, await params)
  } catch (error) {
    console.error("Bridge runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: {
          reason: errorMessage(error),
        },
      },
      { status: 502 },
    )
  }
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<RuntimeUiRouteParams> },
) {
  try {
    return await handleRuntimeUiProxy(request, await params)
  } catch (error) {
    console.error("Bridge runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: {
          reason: errorMessage(error),
        },
      },
      { status: 502 },
    )
  }
}
