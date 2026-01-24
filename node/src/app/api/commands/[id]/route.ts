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

    return NextResponse.json(command)
  } catch (error) {
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
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
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
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    await prisma.command.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
