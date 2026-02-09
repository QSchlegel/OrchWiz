import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { mergeSubagentSettings, normalizeSubagentSettings } from "@/lib/subagents/settings"

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const subagent = await prisma.subagent.findUnique({
      where: { id },
    })

    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    return NextResponse.json({
      ...subagent,
      settings: normalizeSubagentSettings(subagent.settings),
    })
  } catch (error) {
    console.error("Error fetching subagent:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, content, path, settings, isShared, teamId } = body

    const existing = await prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        settings: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (content !== undefined) updateData.content = content
    if (path !== undefined) updateData.path = path
    if (settings !== undefined) {
      updateData.settings = mergeSubagentSettings(existing.settings, settings)
    }
    if (isShared !== undefined) updateData.isShared = isShared
    if (teamId !== undefined) updateData.teamId = teamId

    const subagent = await prisma.subagent.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      ...subagent,
      settings: normalizeSubagentSettings(subagent.settings),
    })
  } catch (error) {
    console.error("Error updating subagent:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    await prisma.subagent.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting subagent:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
