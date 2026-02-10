import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { slug } = await params

    const project = await prisma.project.findUnique({
      where: { slug },
    })

    if (!project || !project.isPublic) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    // Increment star count
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        stars: { increment: 1 },
      },
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "projects",
      entityId: updated.id,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error starring project:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
