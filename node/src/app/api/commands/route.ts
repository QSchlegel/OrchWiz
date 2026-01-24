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

    const commands = await prisma.command.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        _count: {
          select: {
            executions: true,
          },
        },
      },
    })

    return NextResponse.json(commands)
  } catch (error) {
    console.error("Error fetching commands:", error)
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
    const { name, description, scriptContent, path, isShared, teamId } = body

    if (!name || !scriptContent) {
      return NextResponse.json(
        { error: "Name and scriptContent are required" },
        { status: 400 }
      )
    }

    const command = await prisma.command.create({
      data: {
        name,
        description,
        scriptContent,
        path,
        isShared: isShared || false,
        teamId: teamId || null,
      },
    })

    return NextResponse.json(command, { status: 201 })
  } catch (error) {
    console.error("Error creating command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
