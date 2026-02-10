import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  requireAccessActor,
} from "@/lib/security/access-control"

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireAccessActor()

    const { id } = await params
    const command = await prisma.command.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: {
            startedAt: "desc",
          },
          take: 10,
        },
      },
    })

    if (!command) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 })
    }

    assertCanReadOwnedResource({
      actor,
      ownerUserId: command.ownerUserId,
      isShared: command.isShared,
      allowSharedRead: true,
      notFoundMessage: "Command not found",
    })

    return NextResponse.json(command)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching command:", error)
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
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await prisma.command.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Command not found",
    })

    const body = await request.json()
    const { name, description, scriptContent, path, isShared, teamId } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (scriptContent !== undefined) updateData.scriptContent = scriptContent
    if (path !== undefined) updateData.path = path
    if (isShared !== undefined) updateData.isShared = isShared
    if (teamId !== undefined) updateData.teamId = teamId

    const command = await prisma.command.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(command)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error updating command:", error)
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
    const actor = await requireAccessActor()

    const { id } = await params
    const existing = await prisma.command.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: existing.ownerUserId,
      notFoundMessage: "Command not found",
    })

    await prisma.command.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
