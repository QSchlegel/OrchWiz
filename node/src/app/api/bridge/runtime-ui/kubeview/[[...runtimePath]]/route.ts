import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolveShipNamespace } from "@/lib/bridge/openclaw-runtime"
import type { DeploymentProfile } from "@/lib/deployment/profile"
import { ORCHWIZ_RUNTIME_JWT_COOKIE_NAME } from "@/lib/runtime-jwt"

export const dynamic = "force-dynamic"

interface RuntimeUiRouteParams {
  runtimePath?: string[]
}

interface ShipSelectionRecord {
  id: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  deploymentProfile: DeploymentProfile
  config: unknown
  metadata: unknown
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

function parseCookieHeaderValues(value: string | null): Array<{ name: string; value: string }> {
  if (!value) return []
  const out: Array<{ name: string; value: string }> = []
  for (const part of value.split(";")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex <= 0) continue
    const name = trimmed.slice(0, eqIndex).trim()
    const cookieValue = trimmed.slice(eqIndex + 1).trim()
    if (!name || !cookieValue) continue
    out.push({ name, value: cookieValue })
  }
  return out
}

function extractRuntimeJwtCookieHeader(rawCookieHeader: string | null): string | null {
  const runtimeJwtCookie = parseCookieHeaderValues(rawCookieHeader).find(
    (cookie) => cookie.name === ORCHWIZ_RUNTIME_JWT_COOKIE_NAME,
  )
  if (!runtimeJwtCookie) {
    return null
  }
  return `${runtimeJwtCookie.name}=${runtimeJwtCookie.value}`
}

function stripTrailingSlash(value: string): string {
  const trimmed = value.replace(/\/+$/u, "")
  return trimmed.length > 0 ? trimmed : "/"
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

function resolveRuntimeUiKubeviewBaseFromMetadata(metadata: unknown): string | null {
  const runtimeUi = asRecord(asRecord(metadata).runtimeUi)
  const kubeview = asRecord(runtimeUi.kubeview)
  return normalizeHttpUrl(asString(kubeview.url))
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
  upstream.search = nextSearch.toString()

  return upstream
}

function proxyBasePath(): string {
  return "/api/bridge/runtime-ui/kubeview"
}

function rewriteUpstreamLocation(args: {
  location: string
  upstreamBaseUrl: string
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

    const target = `${proxyBasePath()}${relativePath ? `/${relativePath}` : ""}`
    const query = new URLSearchParams(resolved.searchParams)
    if (args.shipDeploymentId) {
      query.set("shipDeploymentId", args.shipDeploymentId)
    }
    return query.size > 0 ? `${target}?${query.toString()}` : target
  } catch {
    return args.location
  }
}

function rewriteRootAbsolutePathForProxy(args: {
  rawValue: string
  proxyBasePath: string
  upstreamBaseUrl: string
}): string {
  if (!args.rawValue.startsWith("/") || args.rawValue.startsWith("//")) {
    return args.rawValue
  }

  const separatorIndex = args.rawValue.search(/[?#]/u)
  const rawPath = separatorIndex === -1 ? args.rawValue : args.rawValue.slice(0, separatorIndex)
  const suffix = separatorIndex === -1 ? "" : args.rawValue.slice(separatorIndex)

  const proxyPath = stripTrailingSlash(args.proxyBasePath)
  if (rawPath === proxyPath || rawPath.startsWith(`${proxyPath}/`)) {
    return args.rawValue
  }

  let upstreamPath = "/"
  try {
    upstreamPath = stripTrailingSlash(new URL(args.upstreamBaseUrl).pathname)
  } catch {
    upstreamPath = "/"
  }

  if (upstreamPath !== "/" && (rawPath === upstreamPath || rawPath.startsWith(`${upstreamPath}/`))) {
    const relativePath = rawPath.slice(upstreamPath.length)
    const rebased = `${proxyPath}${relativePath}`.replace(/\/{2,}/gu, "/")
    return `${rebased}${suffix}`
  }

  const prefixed = `${proxyPath}${rawPath}`.replace(/\/{2,}/gu, "/")
  return `${prefixed}${suffix}`
}

function rewriteHtmlForProxy(args: {
  html: string
  upstreamBaseUrl: string
}): string {
  const proxyPath = proxyBasePath()
  const baseHref = `${proxyBasePath()}/`
  const injections: string[] = []

  let rewritten = args.html
  if (/<base\s/iu.test(rewritten)) {
    rewritten = rewritten.replace(/<base\s[^>]*>/iu, `<base href="${baseHref}">`)
  } else {
    injections.push(`<base href="${baseHref}">`)
  }

  // KubeView bundles may issue root-absolute XHR/fetch calls that bypass `<base href>`.
  // Rebase those calls into the proxy path so embedded mode stays fully functional.
  injections.push(
    `<script>(function(){try{var base=${JSON.stringify(proxyPath)};var rewrite=function(raw){if(typeof raw!=="string"){return raw;}if(!raw||raw[0]!=="/"||raw.slice(0,2)==="//"){return raw;}if(raw===base||raw.indexOf(base+"/")===0){return raw;}return(base+raw).replace(/\\/+/g,"/");};if(typeof window.fetch==="function"){var originalFetch=window.fetch.bind(window);window.fetch=function(input,init){if(typeof input==="string"){return originalFetch(rewrite(input),init);}if(input&&typeof input==="object"&&"url" in input&&typeof input.url==="string"){var nextUrl=rewrite(input.url);if(nextUrl!==input.url){input=new Request(nextUrl,input);} }return originalFetch(input,init);};}if(window.XMLHttpRequest&&window.XMLHttpRequest.prototype&&typeof window.XMLHttpRequest.prototype.open==="function"){var originalOpen=window.XMLHttpRequest.prototype.open;window.XMLHttpRequest.prototype.open=function(method,url){var nextUrl=typeof url==="string"?rewrite(url):url;return originalOpen.call(this,method,nextUrl,arguments[2],arguments[3],arguments[4]);};}}catch(e){}})();</script>`,
  )

  rewritten = rewritten.replace(
    /(href|src|action)=(["'])(\/[^"']*)\2/giu,
    (_match, attr, quote, rawValue) =>
      `${attr}=${quote}${rewriteRootAbsolutePathForProxy({
        rawValue,
        proxyBasePath: proxyPath,
        upstreamBaseUrl: args.upstreamBaseUrl,
      })}${quote}`,
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

export function resolveKubeviewUpstreamBaseUrl(args: {
  namespace: string | null
  metadataRuntimeUiUrl: string | null
}): string | null {
  const runningInKubernetes = asString(process.env.KUBERNETES_SERVICE_HOST) !== null

  const override = asString(process.env.KUBEVIEW_UPSTREAM_URL)
  if (override) {
    try {
      const parsed = new URL(override)
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        if (runningInKubernetes && isLoopbackOrLocalhostUrl(parsed.toString())) {
          throw new Error("Ignoring loopback KUBEVIEW_UPSTREAM_URL inside Kubernetes.")
        }
        return parsed.toString().replace(/\/+$/u, "")
      }
    } catch {
      // ignore invalid override
    }
  }

  if (args.metadataRuntimeUiUrl && (!runningInKubernetes || !isLoopbackOrLocalhostUrl(args.metadataRuntimeUiUrl))) {
    return args.metadataRuntimeUiUrl
  }

  if (runningInKubernetes && args.namespace) {
    // Default local-starship service name created by the helm release in infra/terraform.
    return `http://orchwiz-kubeview.${args.namespace}.svc.cluster.local:8000`
  }

  // Local dev fallback expects `kubectl port-forward svc/orchwiz-kubeview 18080:8000`.
  return "http://127.0.0.1:18080"
}

async function handleRuntimeUiProxy(
  request: NextRequest,
  params: RuntimeUiRouteParams,
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
  const metadataRuntimeUiUrl = resolveRuntimeUiKubeviewBaseFromMetadata(selectedShip.metadata)
  const upstreamBaseUrl = resolveKubeviewUpstreamBaseUrl({ namespace, metadataRuntimeUiUrl })
  if (!upstreamBaseUrl) {
    return NextResponse.json(
      {
        error: "KubeView upstream is not configured.",
        details: {
          namespace,
          metadataRuntimeUiUrl,
        },
      },
      { status: 404 },
    )
  }

  const upstreamUrl = buildUpstreamUrl({
    baseUrl: upstreamBaseUrl,
    runtimePath: params.runtimePath || [],
    searchParams: request.nextUrl.searchParams,
  })

  const headersToUpstream: Record<string, string> = {
    Accept: request.headers.get("accept") || "*/*",
    "Accept-Encoding": "identity",
    "User-Agent": request.headers.get("user-agent") || "OrchWiz-Bridge-KubeViewProxy",
  }

  const requestContentType = request.headers.get("content-type")
  if (requestContentType) {
    headersToUpstream["Content-Type"] = requestContentType
  }

  const runtimeJwtCookie = extractRuntimeJwtCookieHeader(request.headers.get("cookie"))
  if (runtimeJwtCookie) {
    headersToUpstream.Cookie = runtimeJwtCookie
  }

  let upstream: Response
  try {
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer()

    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: headersToUpstream,
      body,
      redirect: "manual",
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Runtime UI upstream is unreachable.",
        details: {
          upstreamUrl: upstreamUrl.toString(),
          namespace,
          metadataRuntimeUiUrl,
          reason: errorMessage(error),
        },
      },
      { status: 502 },
    )
  }

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete("content-security-policy")
  responseHeaders.delete("x-frame-options")
  responseHeaders.delete("content-encoding")
  responseHeaders.delete("content-length")
  responseHeaders.set("cache-control", "no-store")

  const location = responseHeaders.get("location")
  if (location) {
    responseHeaders.set(
      "location",
      rewriteUpstreamLocation({
        location,
        upstreamBaseUrl,
        shipDeploymentId: selectedShip.id,
      }),
    )
  }

  const contentType = responseHeaders.get("content-type") || ""
  if (request.method === "GET" && contentType.toLowerCase().includes("text/html")) {
    const body = rewriteHtmlForProxy({
      html: await upstream.text(),
      upstreamBaseUrl,
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
    console.error("Bridge kubeview runtime UI proxy failed:", error)
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
    console.error("Bridge kubeview runtime UI proxy failed:", error)
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RuntimeUiRouteParams> },
) {
  try {
    return await handleRuntimeUiProxy(request, await params)
  } catch (error) {
    console.error("Bridge kubeview runtime UI proxy failed:", error)
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<RuntimeUiRouteParams> },
) {
  try {
    return await handleRuntimeUiProxy(request, await params)
  } catch (error) {
    console.error("Bridge kubeview runtime UI proxy failed:", error)
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<RuntimeUiRouteParams> },
) {
  try {
    return await handleRuntimeUiProxy(request, await params)
  } catch (error) {
    console.error("Bridge kubeview runtime UI proxy failed:", error)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<RuntimeUiRouteParams> },
) {
  try {
    return await handleRuntimeUiProxy(request, await params)
  } catch (error) {
    console.error("Bridge kubeview runtime UI proxy failed:", error)
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
