import { NextRequest, NextResponse } from "next/server"
import { handlePostSkillImport } from "@/lib/skills/api"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}))
  const result = await handlePostSkillImport({
    body: payload,
  })

  return NextResponse.json(result.body, { status: result.status })
}
