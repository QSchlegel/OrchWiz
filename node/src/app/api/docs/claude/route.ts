import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { extractGuidanceEntries } from "@/lib/docs/guidance-parser"
import { publishRealtimeEvent } from "@/lib/realtime/events"

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

    const parsedGuidance = extractGuidanceEntries(content)

    const document = await prisma.$transaction(async (tx) => {
      const createdDocument = await tx.claudeDocument.create({
        data: {
          title,
          content,
          teamId: teamId || null,
          version,
          lastUpdated: new Date(),
        },
      })

      if (parsedGuidance.length > 0) {
        await tx.guidanceEntry.createMany({
          data: parsedGuidance.map((entry) => ({
            documentId: createdDocument.id,
            content: entry.content,
            category: entry.category,
            status: "active",
          })),
        })
      }

      return tx.claudeDocument.findUniqueOrThrow({
        where: {
          id: createdDocument.id,
        },
        include: {
          guidanceEntries: {
            where: {
              status: "active",
            },
          },
        },
      })
    })

    publishRealtimeEvent({
      type: "docs.updated",
      userId: session.user.id,
      payload: {
        documentId: document.id,
        version: document.version,
      },
    })

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
    const previousGuidance = await prisma.guidanceEntry.findMany({
      where: {
        documentId: existing.id,
        status: "active",
      },
    })

    const previousGuidanceByContent = new Map(
      previousGuidance.map((entry) => [entry.content, entry])
    )
    const nextGuidance = extractGuidanceEntries(content)
    const nextGuidanceContents = new Set(nextGuidance.map((entry) => entry.content))

    const document = await prisma.$transaction(async (tx) => {
      const createdDocument = await tx.claudeDocument.create({
        data: {
          title,
          content,
          teamId: teamId || null,
          version,
          lastUpdated: new Date(),
        },
      })

      const createdEntries = []
      for (const entry of nextGuidance) {
        const created = await tx.guidanceEntry.create({
          data: {
            documentId: createdDocument.id,
            content: entry.content,
            category: entry.category,
            status: "active",
          },
        })
        createdEntries.push(created)
      }

      for (const entry of createdEntries) {
        if (!previousGuidanceByContent.has(entry.content)) {
          await tx.guidanceRevision.create({
            data: {
              guidanceEntryId: entry.id,
              oldContent: null,
              newContent: entry.content,
              diff: `+ ${entry.content}`,
              triggeredBy: session.user.id,
            },
          })
        }
      }

      for (const previous of previousGuidance) {
        if (!nextGuidanceContents.has(previous.content)) {
          await tx.guidanceRevision.create({
            data: {
              guidanceEntryId: previous.id,
              oldContent: previous.content,
              newContent: null,
              diff: `- ${previous.content}`,
              triggeredBy: session.user.id,
            },
          })
        }
      }

      return tx.claudeDocument.findUniqueOrThrow({
        where: {
          id: createdDocument.id,
        },
        include: {
          guidanceEntries: {
            where: {
              status: "active",
            },
          },
        },
      })
    })

    publishRealtimeEvent({
      type: "docs.updated",
      userId: session.user.id,
      payload: {
        documentId: document.id,
        version: document.version,
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
