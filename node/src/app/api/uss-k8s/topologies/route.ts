import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const topologies = await prisma.shipTopology.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        isDefault: true,
        version: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(topologies)
  } catch (error) {
    console.error("Error listing topologies:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    if (!body.name || !body.components || !body.edges) {
      return NextResponse.json({ error: "Missing required fields: name, components, edges" }, { status: 400 })
    }

    const topology = await prisma.shipTopology.create({
      data: {
        name: body.name,
        description: body.description || null,
        components: body.components,
        edges: body.edges,
        positions: body.positions || null,
        hierarchy: body.hierarchy || null,
        userId: session.user.id,
        teamId: body.teamId || "uss-k8s",
      },
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "uss-k8s",
      entityId: topology.id,
    })

    return NextResponse.json(topology, { status: 201 })
  } catch (error) {
    console.error("Error creating topology:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
