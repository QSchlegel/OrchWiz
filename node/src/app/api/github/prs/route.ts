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

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Owner and repo are required" },
        { status: 400 }
      )
    }

    let githubAccessToken: string | undefined
    try {
      const tokenResponse = await auth.api.getAccessToken({
        headers: await headers(),
        body: { providerId: "github" },
      })
      githubAccessToken = tokenResponse?.accessToken
    } catch (error) {
      console.error("GitHub access token error:", error)
      return NextResponse.json(
        { error: "GitHub is not connected. Connect GitHub on the GitHub PRs page first." },
        { status: 400 }
      )
    }

    if (!githubAccessToken) {
      return NextResponse.json(
        { error: "GitHub is not connected. Connect GitHub on the GitHub PRs page first." },
        { status: 400 }
      )
    }

    const prs = await getPRsWithClaudeTag(owner, repo, githubAccessToken)

    return NextResponse.json(prs)
  } catch (error) {
    console.error("Error fetching PRs:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
