import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import {
  connectCodexCliWithApiKey,
  inspectCodexCliConnector,
  logoutCodexCliAccount,
  startCodexCliDeviceAuth,
} from "@/lib/runtime/codex-cli-connector"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ConnectorAction = "connect_api_key" | "start_device_auth" | "logout"
type ConnectorActionResult =
  | Awaited<ReturnType<typeof connectCodexCliWithApiKey>>
  | Awaited<ReturnType<typeof startCodexCliDeviceAuth>>
  | Awaited<ReturnType<typeof logoutCodexCliAccount>>

export interface RuntimeCodexCliConnectorRouteDeps {
  getSessionUserId: () => Promise<string | null>
  inspectConnector: () => ReturnType<typeof inspectCodexCliConnector>
  connectWithApiKey: (apiKey: string) => ReturnType<typeof connectCodexCliWithApiKey>
  startDeviceAuth: () => ReturnType<typeof startCodexCliDeviceAuth>
  logoutAccount: () => ReturnType<typeof logoutCodexCliAccount>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isConnectorAction(value: string): value is ConnectorAction {
  return value === "connect_api_key" || value === "start_device_auth" || value === "logout"
}

const defaultDeps: RuntimeCodexCliConnectorRouteDeps = {
  getSessionUserId: async () => {
    const session = await auth.api.getSession({ headers: await headers() })
    return session?.user?.id || null
  },
  inspectConnector: () => inspectCodexCliConnector(),
  connectWithApiKey: (apiKey) => connectCodexCliWithApiKey(apiKey),
  startDeviceAuth: () => startCodexCliDeviceAuth(),
  logoutAccount: () => logoutCodexCliAccount(),
}

export async function handleGetCodexCliConnector(
  _request: NextRequest,
  deps: RuntimeCodexCliConnectorRouteDeps = defaultDeps,
) {
  try {
    const userId = await deps.getSessionUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const connector = await deps.inspectConnector()
    return NextResponse.json({ connector })
  } catch (error) {
    console.error("Failed to inspect Codex CLI connector:", error)
    return NextResponse.json({ error: "Failed to inspect Codex CLI connector." }, { status: 500 })
  }
}

export async function handlePostCodexCliConnector(
  request: NextRequest,
  deps: RuntimeCodexCliConnectorRouteDeps = defaultDeps,
) {
  try {
    const userId = await deps.getSessionUserId()
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = asRecord(await request.json().catch(() => ({})))
    const actionValue = asString(payload.action)

    if (!actionValue) {
      return NextResponse.json({ error: "Missing connector action." }, { status: 400 })
    }

    if (!isConnectorAction(actionValue)) {
      return NextResponse.json({ error: "Unsupported connector action." }, { status: 400 })
    }

    const action = actionValue
    let actionResult: ConnectorActionResult

    if (action === "connect_api_key") {
      const apiKey = asString(payload.apiKey)
      if (!apiKey) {
        return NextResponse.json({ error: "API key is required for connector setup." }, { status: 400 })
      }

      actionResult = await deps.connectWithApiKey(apiKey)
    } else if (action === "start_device_auth") {
      actionResult = await deps.startDeviceAuth()
    } else {
      actionResult = await deps.logoutAccount()
    }

    const connector = await deps.inspectConnector()
    return NextResponse.json({
      actionResult,
      connector,
    })
  } catch (error) {
    console.error("Failed to update Codex CLI connector:", error)
    return NextResponse.json({ error: "Failed to update Codex CLI connector." }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return handleGetCodexCliConnector(request)
}

export async function POST(request: NextRequest) {
  return handlePostCodexCliConnector(request)
}
