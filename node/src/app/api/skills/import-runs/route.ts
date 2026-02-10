import { NextRequest, NextResponse } from "next/server"
import { handleGetSkillImportRuns } from "@/lib/skills/api"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const result = await handleGetSkillImportRuns({
    limit: request.nextUrl.searchParams.get("limit"),
  })

  return NextResponse.json(result.body, { status: result.status })
}
