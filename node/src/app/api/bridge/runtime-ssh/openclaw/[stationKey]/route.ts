import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import type { BridgeStationKey } from "@/lib/bridge/stations"
import { isBridgeStationKey } from "@/lib/bridge/openclaw-runtime"
import {
  resolveOpenClawSshTarget,
  type OpenClawSshTargetResult,
} from "@/lib/bridge/openclaw-ssh-target"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface RuntimeSshRouteParams {
  stationKey: string
}

interface RuntimeSshRouteDeps {
  getSessionUser: () => Promise<{ id: string } | null>
  resolveTarget: (args: {
    userId: string
    stationKey: BridgeStationKey
    requestedShipDeploymentId: string | null
  }) => Promise<OpenClawSshTargetResult>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const defaultDeps: RuntimeSshRouteDeps = {
  getSessionUser: async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user ? { id: session.user.id } : null
  },
  resolveTarget: async ({ userId, stationKey, requestedShipDeploymentId }) =>
    resolveOpenClawSshTarget({
      userId,
      stationKey,
      requestedShipDeploymentId,
    }),
}

export async function handleGetOpenClawRuntimeSsh(
  request: NextRequest,
  params: RuntimeSshRouteParams,
  deps: RuntimeSshRouteDeps = defaultDeps,
): Promise<NextResponse> {
  const sessionUser = await deps.getSessionUser()
  if (!sessionUser) {
    return NextResponse.json(
      {
        ok: false,
        code: "UNAUTHORIZED",
        detail: "Unauthorized.",
        suggestedActions: ["Sign in and retry the SSH preflight request."],
      },
      { status: 401 },
    )
  }

  if (!isBridgeStationKey(params.stationKey)) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_STATION",
        detail: "Unknown bridge station.",
        suggestedActions: ["Select a valid bridge station and retry."],
      },
      { status: 400 },
    )
  }

  const requestedShipDeploymentId = asString(request.nextUrl.searchParams.get("shipDeploymentId"))
  const resolution = await deps.resolveTarget({
    userId: sessionUser.id,
    stationKey: params.stationKey,
    requestedShipDeploymentId,
  })

  if (!resolution.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: resolution.code,
        detail: resolution.detail,
        suggestedActions: resolution.suggestedActions,
      },
      { status: resolution.status },
    )
  }

  const wsPath = (() => {
    const base = `/api/bridge/runtime-ssh/openclaw/${params.stationKey}/ws`
    const query = new URLSearchParams()
    query.set("shipDeploymentId", resolution.target.shipDeploymentId)
    return `${base}?${query.toString()}`
  })()

  return NextResponse.json({
    ok: true,
    stationKey: resolution.target.stationKey,
    shipDeploymentId: resolution.target.shipDeploymentId,
    wsPath,
    namespace: resolution.target.namespace,
    strategy: resolution.target.strategy,
    commandPreview: resolution.target.commandPreview,
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RuntimeSshRouteParams> },
) {
  try {
    return await handleGetOpenClawRuntimeSsh(request, await params)
  } catch (error) {
    console.error("Runtime SSH preflight failed:", error)
    return NextResponse.json(
      {
        ok: false,
        code: "SSH_TARGET_UNRESOLVED",
        detail: "Runtime SSH preflight failed.",
        suggestedActions: ["Check server logs for runtime SSH preflight failure details."],
      },
      { status: 500 },
    )
  }
}
