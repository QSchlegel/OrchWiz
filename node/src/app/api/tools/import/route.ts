import { NextRequest, NextResponse } from "next/server"
import { handlePostToolImport } from "@/lib/tools/api"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

interface ToolsImportRouteDeps {
  handlePostToolImport: typeof handlePostToolImport
  publishNotificationUpdated: typeof publishNotificationUpdated
}

const defaultDeps: ToolsImportRouteDeps = {
  handlePostToolImport,
  publishNotificationUpdated,
}

export async function handlePostToolsImportRoute(
  request: NextRequest,
  deps: ToolsImportRouteDeps = defaultDeps,
) {
  const payload = await request.json().catch(() => ({}))
  const result = await deps.handlePostToolImport({
    body: payload,
  })

  const runOwnerUserId = (result.body as { run?: { ownerUserId?: unknown; id?: unknown } })?.run?.ownerUserId
  const runId = (result.body as { run?: { ownerUserId?: unknown; id?: unknown } })?.run?.id
  if (typeof runOwnerUserId === "string" && runOwnerUserId.trim()) {
    deps.publishNotificationUpdated({
      userId: runOwnerUserId,
      channel: "personal.personal.tools",
      entityId: typeof runId === "string" ? runId : undefined,
    })
  }

  return NextResponse.json(result.body, { status: result.status })
}

export async function POST(request: NextRequest) {
  return handlePostToolsImportRoute(request)
}
