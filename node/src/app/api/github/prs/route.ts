import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getPRsWithClaudeTag } from "@/lib/github"
import { headers } from "next/headers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const owner = searchParams.get("owner")
    const repo = searchParams.get("repo")
    const token = searchParams.get("token")

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Owner and repo are required" },
        { status: 400 }
      )
    }

    // TODO: Get GitHub token from user's connected account
    const prs = await getPRsWithClaudeTag(owner, repo, token || undefined)

    return NextResponse.json(prs)
  } catch (error) {
    console.error("Error fetching PRs:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
