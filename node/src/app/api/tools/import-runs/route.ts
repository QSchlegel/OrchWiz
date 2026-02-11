import { NextRequest, NextResponse } from "next/server"
import { handleGetToolImportRuns } from "@/lib/tools/api"

export const dynamic = "force-dynamic"

interface ToolsImportRunsRouteDeps {
  handleGetToolImportRuns: typeof handleGetToolImportRuns
}

const defaultDeps: ToolsImportRunsRouteDeps = {
  handleGetToolImportRuns,
}

export async function handleGetToolsImportRunsRoute(
  request: NextRequest,
  deps: ToolsImportRunsRouteDeps = defaultDeps,
) {
  const result = await deps.handleGetToolImportRuns({
    limit: request.nextUrl.searchParams.get("limit"),
  })

  return NextResponse.json(result.body, { status: result.status })
}

export async function GET(request: NextRequest) {
  return handleGetToolsImportRunsRoute(request)
}
