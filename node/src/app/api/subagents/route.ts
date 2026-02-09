import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { normalizeSubagentSettings } from "@/lib/subagents/settings"
import { ensureDefaultPolicyAssignmentForSubagent } from "@/lib/execution/permission-policies"

export const dynamic = 'force-dynamic'

async function assignDefaultPolicyProfile(subagent: { id: string; isShared: boolean }) {
  try {
    await ensureDefaultPolicyAssignmentForSubagent({
      subagentId: subagent.id,
      isShared: subagent.isShared,
    })
  } catch (error) {
    console.error("Error assigning default policy profile:", error)
  }
}

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
  let parsedBody: any = null
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    parsedBody = body
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

    await assignDefaultPolicyProfile(subagent)

    return NextResponse.json(subagent, { status: 201 })
  } catch (error) {
    console.error("Error creating subagent:", error)

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Some local environments can be schema-drifted; retry without settings as a compatibility fallback.
      if (error.code === "P2022") {
        try {
          const { name, description, content, path, isShared, teamId } = parsedBody || {}
          if (!name || !content) {
            throw new Error("Name and content are required")
          }
          const subagent = await prisma.subagent.create({
            data: {
              name,
              description,
              content,
              path,
              isShared: isShared || false,
              teamId: teamId || null,
            },
          })
          await assignDefaultPolicyProfile(subagent)
          return NextResponse.json(subagent, { status: 201 })
        } catch (retryError) {
          console.error("Error creating subagent (fallback without settings):", retryError)
        }
      }

      return NextResponse.json(
        { error: `Database request failed (${error.code}). ${error.message}` },
        { status: 500 }
      )
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
