import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishNotificationUpdatedMany } from "@/lib/realtime/notifications"

export const dynamic = 'force-dynamic'

async function notifyHooksChanged(entityId: string) {
  const users = await prisma.user.findMany({
    select: {
      id: true,
    },
  })

  publishNotificationUpdatedMany({
    userIds: users.map((user) => user.id),
    channel: "hooks",
    entityId,
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get("isActive")

    const where: any = {}
    if (isActive === "true") {
      where.isActive = true
    }

    const hooks = await prisma.hook.findMany({
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

    return NextResponse.json(hooks)
  } catch (error) {
    console.error("Error fetching hooks:", error)
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
    const { name, matcher, type, command, isActive } = body

    if (!name || !matcher || !type || !command) {
      return NextResponse.json(
        { error: "Name, matcher, type, and command are required" },
        { status: 400 }
      )
    }

    const hook = await prisma.hook.create({
      data: {
        name,
        matcher,
        type,
        command,
        isActive: isActive !== undefined ? isActive : true,
      },
    })

    await notifyHooksChanged(hook.id)

    return NextResponse.json(hook, { status: 201 })
  } catch (error) {
    console.error("Error creating hook:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
