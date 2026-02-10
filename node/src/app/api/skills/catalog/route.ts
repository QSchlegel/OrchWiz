import { NextRequest, NextResponse } from "next/server"
import { handleGetSkillsCatalog } from "@/lib/skills/api"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const result = await handleGetSkillsCatalog({
    refresh: request.nextUrl.searchParams.get("refresh"),
  })

  return NextResponse.json(result.body, { status: result.status })
}
