import { NextRequest, NextResponse } from "next/server"
import { handlePostToolImport } from "@/lib/tools/api"

export const dynamic = "force-dynamic"

interface ToolsImportRouteDeps {
  handlePostToolImport: typeof handlePostToolImport
}

const defaultDeps: ToolsImportRouteDeps = {
  handlePostToolImport,
}

export async function handlePostToolsImportRoute(
  request: NextRequest,
  deps: ToolsImportRouteDeps = defaultDeps,
) {
  const payload = await request.json().catch(() => ({}))
  const result = await deps.handlePostToolImport({
    body: payload,
  })

  return NextResponse.json(result.body, { status: result.status })
}

export async function POST(request: NextRequest) {
  return handlePostToolsImportRoute(request)
}
