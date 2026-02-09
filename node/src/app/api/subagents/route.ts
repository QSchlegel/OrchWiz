import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { normalizeSubagentSettings } from "@/lib/subagents/settings"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const teamId = searchParams.get("teamId")
    const isShared = searchParams.get("isShared")

    const where: any = {
      OR: [
        { isShared: true },
        { teamId: teamId || null },
      ],
    }

    if (isShared === "true") {
      where.isShared = true
    }

    const subagents = await prisma.subagent.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(
      subagents.map((subagent) => ({
        ...subagent,
        settings: normalizeSubagentSettings(subagent.settings),
      })),
    )
  } catch (error) {
    console.error("Error fetching subagents:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, content, path, settings, isShared, teamId } = body

    if (!name || !content) {
      return NextResponse.json(
        { error: "Name and content are required" },
        { status: 400 }
      )
    }

    const subagent = await prisma.subagent.create({
      data: {
        name,
        description,
        content,
        path,
        settings: normalizeSubagentSettings(settings),
        isShared: isShared || false,
        teamId: teamId || null,
      },
    })

    return NextResponse.json(subagent, { status: 201 })
  } catch (error) {
    console.error("Error creating subagent:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
