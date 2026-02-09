import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

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
    const permission = await prisma.permission.findUnique({
      where: { id },
    })

    if (!permission) {
      return NextResponse.json({ error: "Permission not found" }, { status: 404 })
    }

    return NextResponse.json(permission)
  } catch (error) {
    console.error("Error fetching permission:", error)
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
    const {
      commandPattern,
      type,
      status,
      scope,
      subagentId,
      sourceFile,
      isShared,
    } = body

    const normalizedSubagentId =
      typeof subagentId === "string" && subagentId.trim().length > 0 ? subagentId.trim() : null

    const updateData: any = {}
    if (commandPattern !== undefined) updateData.commandPattern = commandPattern
    if (type !== undefined) updateData.type = type
    if (status !== undefined) updateData.status = status
    if (scope !== undefined) updateData.scope = scope
    if (sourceFile !== undefined) updateData.sourceFile = sourceFile
    if (isShared !== undefined) updateData.isShared = isShared

    if (scope === "subagent" && !normalizedSubagentId) {
      return NextResponse.json(
        { error: "subagentId is required when scope is subagent" },
        { status: 400 },
      )
    }

    if (scope === "subagent") {
      updateData.subagentId = normalizedSubagentId
    } else if (scope !== undefined) {
      updateData.subagentId = null
    } else if (subagentId !== undefined) {
      updateData.subagentId = normalizedSubagentId
    }

    const permission = await prisma.permission.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(permission)
  } catch (error) {
    console.error("Error updating permission:", error)
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
    await prisma.permission.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting permission:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
