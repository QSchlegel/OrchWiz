import { NextRequest, NextResponse } from "next/server"
import { handleGetToolsCatalog } from "@/lib/tools/api"

export const dynamic = "force-dynamic"

interface ToolsCatalogRouteDeps {
  handleGetToolsCatalog: typeof handleGetToolsCatalog
}

const defaultDeps: ToolsCatalogRouteDeps = {
  handleGetToolsCatalog,
}

export async function handleGetToolsCatalogRoute(
  request: NextRequest,
  deps: ToolsCatalogRouteDeps = defaultDeps,
) {
  const result = await deps.handleGetToolsCatalog({
    refresh: request.nextUrl.searchParams.get("refresh"),
  })

  return NextResponse.json(result.body, { status: result.status })
}

export async function GET(request: NextRequest) {
  return handleGetToolsCatalogRoute(request)
}
