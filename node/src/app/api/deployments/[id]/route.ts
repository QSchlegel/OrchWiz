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
    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        subagent: true,
      },
    })

    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
    }

    return NextResponse.json(deployment)
  } catch (error) {
    console.error("Error fetching deployment:", error)
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

    const deployment = await prisma.agentDeployment.update({
      where: {
        id,
        userId: session.user.id,
      },
      data: {
        ...body,
        updatedAt: new Date(),
      },
      include: {
        subagent: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    })

    return NextResponse.json(deployment)
  } catch (error) {
    console.error("Error updating deployment:", error)
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

    await prisma.agentDeployment.delete({
      where: {
        id,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
