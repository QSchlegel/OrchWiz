import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

interface RuntimeUiRouteParams {
  runtimePath?: string[]
}

const COOKIE_PREFIX = "owz_langfuse_"

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function stripTrailingSlash(value: string): string {
  const trimmed = value.replace(/\/+$/u, "")
  return trimmed.length > 0 ? trimmed : "/"
}

function proxyBasePath(): string {
  return "/api/bridge/runtime-ui/langfuse"
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

function firstForwardedHeaderValue(value: string | null): string | null {
  if (!value) {
    return null
  }

  const first = value.split(",")[0]?.trim()
  return first && first.length > 0 ? first : null
}

function resolvePublicRequestProto(request: NextRequest): "http" | "https" {
  const forwardedProto = firstForwardedHeaderValue(request.headers.get("x-forwarded-proto"))
  if (forwardedProto === "https" || forwardedProto === "http") {
    return forwardedProto
  }

  const forwarded = parseForwardedHeader(request.headers.get("forwarded"))
  const forwardedProtoFromHeader = forwarded.proto?.toLowerCase()
  if (forwardedProtoFromHeader === "https" || forwardedProtoFromHeader === "http") {
    return forwardedProtoFromHeader
  }

  const cfVisitor = firstForwardedHeaderValue(request.headers.get("cf-visitor"))
  if (cfVisitor) {
    try {
      const parsed = JSON.parse(cfVisitor) as unknown
      const scheme =
        parsed && typeof parsed === "object" && "scheme" in parsed ? String((parsed as any).scheme) : ""
      if (scheme === "https" || scheme === "http") {
        return scheme
      }
    } catch {
      // ignore invalid cf-visitor
    }
  }

  return request.nextUrl.protocol === "https:" ? "https" : "http"
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

function rewriteUpstreamLocation(args: {
  location: string
  upstreamBaseUrl: string
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
    return query.size > 0 ? `${target}?${query.toString()}` : target
  } catch {
    return args.location
  }
}

function extractLangfuseCookies(rawCookieHeader: string | null): string | null {
  const header = asString(rawCookieHeader)
  if (!header) {
    return null
  }

  const out: string[] = []
  for (const part of header.split(";")) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex <= 0) continue
    const name = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!name.startsWith(COOKIE_PREFIX)) continue
    const upstreamName = name.slice(COOKIE_PREFIX.length)
    if (!upstreamName) continue
    out.push(`${upstreamName}=${value}`)
  }

  return out.length > 0 ? out.join("; ") : null
}

function rewriteSetCookie(args: {
  setCookie: string
  publicProto: "http" | "https"
}): string | null {
  const raw = asString(args.setCookie)
  if (!raw) {
    return null
  }

  const segments = raw.split(";").map((part) => part.trim()).filter(Boolean)
  const first = segments[0]
  if (!first || !first.includes("=")) {
    return null
  }

  const [rawName, ...rawValueParts] = first.split("=")
  const name = rawName?.trim()
  if (!name) {
    return null
  }

  const value = rawValueParts.join("=")
  const out: string[] = [`${COOKIE_PREFIX}${name}=${value}`]

  let sawSameSiteNone = false
  for (const segment of segments.slice(1)) {
    const [rawKey, ...rawValParts] = segment.split("=")
    const key = rawKey?.trim()
    if (!key) continue

    const lower = key.toLowerCase()
    if (lower === "domain") {
      // Drop upstream domain so the cookie is scoped to the OrchWiz host.
      continue
    }
    if (lower === "path") {
      // Force cookie scope to the proxy base path so we never leak it elsewhere.
      continue
    }

    if (lower === "secure" && args.publicProto === "http") {
      // Local dev commonly runs on http://; Secure cookies would never be sent.
      continue
    }

    if (lower === "samesite") {
      const sameSiteValue = rawValParts.join("=").trim()
      if (sameSiteValue.toLowerCase() === "none") {
        sawSameSiteNone = true
      }
      // We'll rewrite SameSite=None below if needed.
      continue
    }

    out.push(segment)
  }

  out.push(`Path=${proxyBasePath()}`)

  if (args.publicProto === "http") {
    // SameSite=None requires Secure in modern browsers; downgrade to Lax for http dev.
    if (sawSameSiteNone) {
      out.push("SameSite=Lax")
    }
  } else if (sawSameSiteNone) {
    out.push("SameSite=None")
  }

  return out.join("; ")
}

function rewriteHtmlForProxy(args: { html: string }): string {
  const baseHref = `${proxyBasePath()}/`
  const injections: string[] = []

  if (!/<base\s/iu.test(args.html)) {
    injections.push(`<base href="${baseHref}">`)
  }

  const withHeadInjections =
    injections.length === 0
      ? args.html
      : args.html.replace(/<head(\s[^>]*)?>/iu, (match) => `${match}${injections.join("")}`)

  const withRewrittenAttrs = withHeadInjections.replace(
    /(href|src|action)=(["'])\/(?!\/)/giu,
    `$1=$2${baseHref}`,
  )

  // Langfuse is a Next.js app; adjust __NEXT_DATA__ so client-side navigation + chunk loading use the proxy base path.
  return withRewrittenAttrs.replace(
    /<script([^>]*\sid=["']__NEXT_DATA__["'][^>]*)>([\s\S]*?)<\/script>/iu,
    (match, attrs, jsonText) => {
      try {
        const parsed = JSON.parse(jsonText) as any
        if (!parsed || typeof parsed !== "object") {
          return match
        }

        parsed.assetPrefix = proxyBasePath()
        parsed.basePath = proxyBasePath()
        return `<script${attrs}>${JSON.stringify(parsed)}</script>`
      } catch {
        return match
      }
    },
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message
  }
  return "Unknown runtime UI proxy error."
}

function resolveLangfuseUpstreamBaseUrl(): string | null {
  const override = asString(process.env.LANGFUSE_BASE_URL)
  if (!override) {
    return null
  }

  try {
    const parsed = new URL(override)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString().replace(/\/+$/u, "")
    }
  } catch {
    // ignore invalid override
  }

  return null
}

async function handleRuntimeUiProxy(
  request: NextRequest,
  params: RuntimeUiRouteParams,
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const upstreamBaseUrl = resolveLangfuseUpstreamBaseUrl()
  if (!upstreamBaseUrl) {
    return NextResponse.json(
      { error: "Langfuse upstream is not configured. Set LANGFUSE_BASE_URL." },
      { status: 404 },
    )
  }

  const upstreamUrl = buildUpstreamUrl({
    baseUrl: upstreamBaseUrl,
    runtimePath: params.runtimePath || [],
    searchParams: request.nextUrl.searchParams,
  })

  const publicProto = resolvePublicRequestProto(request)
  const cookie = extractLangfuseCookies(request.headers.get("cookie"))

  const headersToUpstream: Record<string, string> = {
    Accept: request.headers.get("accept") || "*/*",
    "User-Agent": request.headers.get("user-agent") || "OrchWiz-Bridge-LangfuseProxy",
  }

  const contentType = request.headers.get("content-type")
  if (contentType) {
    headersToUpstream["Content-Type"] = contentType
  }

  if (cookie) {
    headersToUpstream.Cookie = cookie
  }

  let upstream: Response
  try {
    const body =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()

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
        upstreamBaseUrl,
      }),
    )
  }

  const setCookies = upstream.headers.getSetCookie()
  if (setCookies.length > 0) {
    responseHeaders.delete("set-cookie")
    for (const entry of setCookies) {
      const rewritten = rewriteSetCookie({ setCookie: entry, publicProto })
      if (rewritten) {
        responseHeaders.append("set-cookie", rewritten)
      }
    }
  }

  const responseContentType = responseHeaders.get("content-type") || ""
  if (request.method === "GET" && responseContentType.toLowerCase().includes("text/html")) {
    const body = rewriteHtmlForProxy({ html: await upstream.text() })
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
    console.error("Bridge langfuse runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: { reason: errorMessage(error) },
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
    console.error("Bridge langfuse runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: { reason: errorMessage(error) },
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
    console.error("Bridge langfuse runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: { reason: errorMessage(error) },
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
    console.error("Bridge langfuse runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: { reason: errorMessage(error) },
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
    console.error("Bridge langfuse runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: { reason: errorMessage(error) },
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
    console.error("Bridge langfuse runtime UI proxy failed:", error)
    return NextResponse.json(
      {
        error: "Runtime UI proxy failed.",
        details: { reason: errorMessage(error) },
      },
      { status: 502 },
    )
  }
}

