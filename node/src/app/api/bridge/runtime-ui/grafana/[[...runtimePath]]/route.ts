import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

interface RuntimeUiRouteParams {
  runtimePath?: string[]
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function stripTrailingSlash(value: string): string {
  const trimmed = value.replace(/\/+$/u, "")
  return trimmed.length > 0 ? trimmed : "/"
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
  return "/api/bridge/runtime-ui/grafana"
}

function rewriteUpstreamLocation(args: {
  location: string
  upstreamBaseUrl: string
}): string {
  try {
    const upstreamBase = new URL(args.upstreamBaseUrl)
    const resolved = new URL(args.location, upstreamBase)
    if (resolved.origin !== upstreamBase.origin) return args.location

    const basePath = stripTrailingSlash(upstreamBase.pathname)
    const fullPath = resolved.pathname
    const relativePath =
      basePath !== "/" && fullPath.startsWith(basePath)
        ? fullPath.slice(basePath.length).replace(/^\/+/u, "")
        : fullPath.replace(/^\/+/u, "")

    const target = `${proxyBasePath()}${relativePath ? `/${relativePath}` : ""}`
    const query = resolved.searchParams
    return query.size > 0 ? `${target}?${query.toString()}` : target
  } catch {
    return args.location
  }
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

  return withHeadInjections.replace(
    /(href|src|action)=(["'])\/(?!\/)/giu,
    `$1=$2${baseHref}`,
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0) {
    return error.message
  }
  return "Unknown runtime UI proxy error."
}

function resolveGrafanaUpstreamBaseUrl(): string {
  const override = asString(process.env.GRAFANA_UPSTREAM_URL)
  if (override) {
    try {
      const parsed = new URL(override)
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString().replace(/\/+$/u, "")
      }
    } catch {
      // ignore invalid override
    }
  }

  const monitoringNamespace = asString(process.env.ORCHWIZ_MONITORING_NAMESPACE) || "monitoring"
  const runningInKubernetes = asString(process.env.KUBERNETES_SERVICE_HOST) !== null
  if (runningInKubernetes) {
    return `http://grafana.${monitoringNamespace}.svc.cluster.local:3000`
  }

  // Outside Kubernetes, route through runtime-edge so users only need one port-forward.
  return "http://127.0.0.1:3100/grafana"
}

async function handleRuntimeUiProxy(
  request: NextRequest,
  params: RuntimeUiRouteParams,
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const upstreamBaseUrl = resolveGrafanaUpstreamBaseUrl()

  const upstreamUrl = buildUpstreamUrl({
    baseUrl: upstreamBaseUrl,
    runtimePath: params.runtimePath || [],
    searchParams: request.nextUrl.searchParams,
  })

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        Accept: request.headers.get("accept") || "*/*",
        "User-Agent": request.headers.get("user-agent") || "OrchWiz-Bridge-GrafanaProxy",
      },
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
      rewriteUpstreamLocation({ location, upstreamBaseUrl }),
    )
  }

  const contentType = responseHeaders.get("content-type") || ""
  if (request.method === "GET" && contentType.toLowerCase().includes("text/html")) {
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
    console.error("Bridge Grafana runtime UI proxy failed:", error)
    return NextResponse.json(
      { error: "Runtime UI proxy failed.", details: { reason: errorMessage(error) } },
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
    console.error("Bridge Grafana runtime UI proxy failed:", error)
    return NextResponse.json(
      { error: "Runtime UI proxy failed.", details: { reason: errorMessage(error) } },
      { status: 502 },
    )
  }
}
