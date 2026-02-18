import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  isBridgeStationKey,
  resolveOpenClawRuntimeUrlForStation,
  resolveShipNamespace,
} from "@/lib/bridge/openclaw-runtime"
import type { DeploymentProfile } from "@/lib/deployment/profile"
import { AccessControlError } from "@/lib/security/access-control"
import {
  mintSecureEnclaveControlToken,
  resolveSecureEnclaveControlTokenSecret,
  type SecureEnclaveControlTokenMint,
} from "@/lib/security/secure-enclave-control-token"
import {
  requireShipyardRequestActor,
  type ShipyardRequestActor,
} from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

type ControlAction = "mint_control_token" | "eject" | "request"
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

interface ShipSelectionRecord {
  id: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  deploymentProfile: DeploymentProfile
  config: unknown
}

export interface AgentSyncOpenClawControlRouteDeps {
  requireActor: (
    request: NextRequest,
    options?: { allowLegacyTokenAuth?: boolean },
  ) => Promise<ShipyardRequestActor>
  listShipsForUser: (userId: string) => Promise<ShipSelectionRecord[]>
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  now: () => Date
  getControlTokenSecret: () => string | null
  controlTimeoutMs: () => number
  ejectPath: () => string
  mintToken: (args: {
    subject: string
    secret: string
    ttlSeconds?: number
    issuer?: string
    audience?: string
    scope?: string[]
    source?: string
    stationKey?: string
    shipDeploymentId?: string
    action?: string
    now?: Date
  }) => SecureEnclaveControlTokenMint
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

function asBoolean(value: unknown): boolean | null {
  if (typeof value !== "boolean") {
    return null
  }
  return value
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    return normalized > 0 ? normalized : null
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function parseControlAction(value: unknown): ControlAction | null {
  if (value === "mint_control_token" || value === "eject" || value === "request") {
    return value
  }
  return null
}

function parseHttpMethod(value: unknown): HttpMethod | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toUpperCase()
  if (
    normalized === "GET"
    || normalized === "POST"
    || normalized === "PUT"
    || normalized === "PATCH"
    || normalized === "DELETE"
  ) {
    return normalized
  }
  return null
}

function parseGatewayTokenMap(raw: string | undefined): Partial<Record<string, string>> {
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
    // Fallback to CSV parsing.
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

function resolveOpenClawAuthToken(stationKey: string): string | null {
  const apiKey = asString(process.env.OPENCLAW_API_KEY)
  if (apiKey) {
    return apiKey
  }

  const stationTokenKey = `OPENCLAW_GATEWAY_TOKEN_${stationKey.toUpperCase()}`
  const stationToken = asString(process.env[stationTokenKey])
  if (stationToken) {
    return stationToken
  }

  const mapped = parseGatewayTokenMap(process.env.OPENCLAW_GATEWAY_TOKENS)[stationKey]
  if (mapped) {
    return mapped
  }

  return asString(process.env.OPENCLAW_GATEWAY_TOKEN)
}

function sanitizeControlPath(value: unknown): string | null {
  const raw = asString(value)
  if (!raw || !raw.startsWith("/")) {
    return null
  }

  if (raw.includes("://")) {
    return null
  }

  if (/[\r\n]/u.test(raw)) {
    return null
  }

  return raw
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "")
}

function buildUpstreamUrl(baseUrl: string, path: string): string {
  return `${stripTrailingSlash(baseUrl)}${path}`
}

function selectShipForControl(args: {
  ships: ShipSelectionRecord[]
  requestedShipDeploymentId: string | null
}): ShipSelectionRecord | null {
  if (args.ships.length === 0) {
    return null
  }

  if (args.requestedShipDeploymentId) {
    const explicit = args.ships.find((ship) => ship.id === args.requestedShipDeploymentId)
    if (explicit) {
      return explicit
    }
  }

  return args.ships.find((ship) => ship.status === "active") || args.ships[0]
}

function explicitFailure(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false
  }
  return (payload as { ok?: unknown }).ok === false
}

async function parseUpstreamPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || ""
  if (contentType.includes("application/json")) {
    return response.json().catch(() => ({}))
  }

  const text = await response.text().catch(() => "")
  if (!text.trim()) {
    return {}
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return {
      raw: text,
    }
  }
}

function defaultControlTimeoutMs(): number {
  const parsed = asPositiveInt(process.env.OPENCLAW_CONTROL_TIMEOUT_MS)
  if (!parsed) {
    return 15_000
  }
  return parsed
}

function defaultEjectPath(): string {
  const configured = asString(process.env.OPENCLAW_EJECT_PATH)
  if (!configured) {
    return "/v1/eject"
  }
  return configured.startsWith("/") ? configured : `/${configured}`
}

const defaultDeps: AgentSyncOpenClawControlRouteDeps = {
  requireActor: (request, options) => requireShipyardRequestActor(request, options),
  listShipsForUser: async (userId) =>
    prisma.agentDeployment.findMany({
      where: {
        userId,
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
    }),
  fetchImpl: (url, init) => fetch(url, init),
  now: () => new Date(),
  getControlTokenSecret: () => resolveSecureEnclaveControlTokenSecret(),
  controlTimeoutMs: () => defaultControlTimeoutMs(),
  ejectPath: () => defaultEjectPath(),
  mintToken: (args) => mintSecureEnclaveControlToken(args),
}

export async function handlePostAgentSyncOpenClawControl(
  request: NextRequest,
  deps: AgentSyncOpenClawControlRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor(request, {
      allowLegacyTokenAuth: true,
    })

    const body = asRecord(await request.json().catch(() => ({})))
    const action = parseControlAction(body.action) || "eject"
    const stationKeyRaw = asString(body.stationKey)?.toLowerCase() || ""
    if (!isBridgeStationKey(stationKeyRaw)) {
      return NextResponse.json(
        { error: "stationKey must be one of: xo, ops, eng, sec, med, cou." },
        { status: 400 },
      )
    }

    const ships = await deps.listShipsForUser(actor.userId)
    const requestUrl = new URL(request.url)
    const requestedShipDeploymentId =
      asString(body.shipDeploymentId)
      || asString(requestUrl.searchParams.get("shipDeploymentId"))

    const selectedShip = selectShipForControl({
      ships,
      requestedShipDeploymentId,
    })
    if (!selectedShip) {
      return NextResponse.json({ error: "No ship deployment available." }, { status: 404 })
    }

    const namespace = resolveShipNamespace(selectedShip.config, selectedShip.deploymentProfile)
    const resolvedRuntime = resolveOpenClawRuntimeUrlForStation({
      stationKey: stationKeyRaw,
      namespace,
    })
    if (!resolvedRuntime.href) {
      return NextResponse.json(
        {
          error: "OpenClaw runtime target is not configured for this station.",
          details: {
            stationKey: stationKeyRaw,
            namespace,
            source: resolvedRuntime.source,
          },
        },
        { status: 404 },
      )
    }

    const secret = deps.getControlTokenSecret()
    if (!secret) {
      return NextResponse.json(
        {
          error: "Secure enclave control token secret is not configured.",
          code: "SECURE_ENCLAVE_CONTROL_TOKEN_NOT_CONFIGURED",
        },
        { status: 503 },
      )
    }

    const source = asString(body.source) || "agentsync"
    const tokenTtlSeconds = asPositiveInt(body.controlTokenTtlSeconds) || undefined
    const scopes = [
      "secure-enclave.control",
      `openclaw.station.${stationKeyRaw}`,
      `openclaw.action.${action}`,
      `source.${source}`,
    ]

    const controlToken = deps.mintToken({
      subject: actor.userId,
      secret,
      ttlSeconds: tokenTtlSeconds,
      source,
      stationKey: stationKeyRaw,
      shipDeploymentId: selectedShip.id,
      action,
      scope: scopes,
      now: deps.now(),
    })

    if (action === "mint_control_token") {
      const response = NextResponse.json({
        ok: true,
        action,
        stationKey: stationKeyRaw,
        shipDeploymentId: selectedShip.id,
        runtime: {
          href: resolvedRuntime.href,
          source: resolvedRuntime.source,
          namespace,
        },
        controlToken,
      })
      response.headers.set("cache-control", "no-store")
      return response
    }

    let method: HttpMethod = "POST"
    let controlPath = deps.ejectPath()
    let upstreamBody: Record<string, unknown> = {}

    if (action === "request") {
      const requestedPath = sanitizeControlPath(body.path)
      if (!requestedPath) {
        return NextResponse.json(
          { error: "request action requires path starting with '/' and without protocol." },
          { status: 400 },
        )
      }

      const requestedMethod = parseHttpMethod(body.method)
      if (!requestedMethod) {
        return NextResponse.json(
          { error: "request action requires method in: GET, POST, PUT, PATCH, DELETE." },
          { status: 400 },
        )
      }

      controlPath = requestedPath
      method = requestedMethod
      upstreamBody = asRecord(body.payload)
    } else {
      const persistMemory = asBoolean(body.persistMemory) !== false
      const reason = asString(body.reason) || "agentsync_eject"
      const inputPayload = asRecord(body.payload)

      upstreamBody = {
        requestType: "openclaw.control.eject.v1",
        persistMemory,
        reason,
        source,
        secureEnclave: {
          controlToken: controlToken.token,
          expiresAt: controlToken.expiresAt,
          issuer: controlToken.issuer,
          audience: controlToken.audience,
          scope: controlToken.scope,
        },
        metadata: {
          actorUserId: actor.userId,
          actorEmail: actor.email,
          authType: actor.authType,
          shipDeploymentId: selectedShip.id,
          stationKey: stationKeyRaw,
        },
        ...(Object.keys(inputPayload).length > 0
          ? {
              input: inputPayload,
            }
          : {}),
      }
    }

    const headers: Record<string, string> = {
      "x-orchwiz-control-token": controlToken.token,
      "x-orchwiz-control-token-expires-at": controlToken.expiresAt,
      "user-agent": "OrchWiz-AgentSync-Control",
    }

    const openClawAuthToken = resolveOpenClawAuthToken(stationKeyRaw)
    if (openClawAuthToken) {
      headers.authorization = `Bearer ${openClawAuthToken}`
    }

    if (method !== "GET" && method !== "DELETE") {
      headers["content-type"] = "application/json"
    }

    const timeoutMs = deps.controlTimeoutMs()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let upstreamResponse: Response
    try {
      upstreamResponse = await deps.fetchImpl(
        buildUpstreamUrl(resolvedRuntime.href, controlPath),
        {
          method,
          headers,
          ...(method !== "GET" && method !== "DELETE"
            ? {
                body: JSON.stringify(upstreamBody),
              }
            : {}),
          signal: controller.signal,
        },
      )
    } catch (error) {
      clearTimeout(timeout)
      const message =
        (error as Error).name === "AbortError"
          ? `OpenClaw control request timed out after ${timeoutMs}ms.`
          : `OpenClaw control request failed: ${(error as Error).message}`
      return NextResponse.json(
        {
          error: message,
          code: "OPENCLAW_CONTROL_UNREACHABLE",
          details: {
            stationKey: stationKeyRaw,
            shipDeploymentId: selectedShip.id,
            runtimeHref: resolvedRuntime.href,
            controlPath,
          },
        },
        { status: 502 },
      )
    } finally {
      clearTimeout(timeout)
    }

    const upstreamPayload = await parseUpstreamPayload(upstreamResponse)
    const ok = upstreamResponse.ok && !explicitFailure(upstreamPayload)
    const status = ok ? 200 : upstreamResponse.status >= 400 ? upstreamResponse.status : 502

    const response = NextResponse.json(
      {
        ok,
        action,
        stationKey: stationKeyRaw,
        shipDeploymentId: selectedShip.id,
        runtime: {
          href: resolvedRuntime.href,
          source: resolvedRuntime.source,
          namespace,
          controlPath,
          method,
        },
        controlToken,
        upstream: {
          status: upstreamResponse.status,
          payload: upstreamPayload,
        },
      },
      { status },
    )
    response.headers.set("cache-control", "no-store")
    return response
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }

    console.error("AgentSync OpenClaw control request failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostAgentSyncOpenClawControl(request)
}
