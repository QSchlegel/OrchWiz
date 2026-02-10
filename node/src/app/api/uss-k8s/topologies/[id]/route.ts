import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const topology = await prisma.shipTopology.findUnique({
      where: { id },
    })

    if (!topology) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (topology.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json(topology)
  } catch (error) {
    console.error("Error fetching topology:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.shipTopology.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const topology = await prisma.shipTopology.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        components: body.components ?? existing.components,
        edges: body.edges ?? existing.edges,
        positions: body.positions ?? existing.positions,
        hierarchy: body.hierarchy ?? existing.hierarchy,
        version: { increment: 1 },
      },
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "uss-k8s",
      entityId: topology.id,
    })

    return NextResponse.json(topology)
  } catch (error) {
    console.error("Error updating topology:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.shipTopology.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.shipTopology.delete({ where: { id } })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "uss-k8s",
      entityId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting topology:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
