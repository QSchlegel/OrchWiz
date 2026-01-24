import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const teamId = searchParams.get("teamId")

    const document = await prisma.claudeDocument.findFirst({
      where: {
        teamId: teamId || null,
      },
      orderBy: {
        version: "desc",
      },
      include: {
        guidanceEntries: {
          where: {
            status: "active",
          },
        },
      },
    })

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    return NextResponse.json(document)
  } catch (error) {
    console.error("Error fetching CLAUDE.md:", error)
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
    const { title, content, teamId } = body

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      )
    }

    // Check if document exists
    const existing = await prisma.claudeDocument.findFirst({
      where: {
        teamId: teamId || null,
      },
      orderBy: {
        version: "desc",
      },
    })

    const version = existing ? existing.version + 1 : 1

    const document = await prisma.claudeDocument.create({
      data: {
        title,
        content,
        teamId: teamId || null,
        version,
        lastUpdated: new Date(),
      },
    })

    // TODO: Extract guidance entries from content
    // This would parse the markdown and extract rules/guidance

    return NextResponse.json(document, { status: 201 })
  } catch (error) {
    console.error("Error creating CLAUDE.md:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { id, title, content, teamId } = body

    if (!id || !title || !content) {
      return NextResponse.json(
        { error: "ID, title, and content are required" },
        { status: 400 }
      )
    }

    const existing = await prisma.claudeDocument.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    const version = existing.version + 1

    const document = await prisma.claudeDocument.create({
      data: {
        title,
        content,
        teamId: teamId || null,
        version,
        lastUpdated: new Date(),
      },
    })

    return NextResponse.json(document)
  } catch (error) {
    console.error("Error updating CLAUDE.md:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
