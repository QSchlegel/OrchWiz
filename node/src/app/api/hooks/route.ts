import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { HookValidationError, parseHookCreateInput } from "@/lib/hooks/validation"

export const dynamic = 'force-dynamic'

function notifyHooksChanged(userId: string, entityId: string) {
  publishNotificationUpdated({
    userId,
    channel: "hooks",
    entityId,
  })
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAccessActor()

    const searchParams = request.nextUrl.searchParams
    const isActive = searchParams.get("isActive")

    const where: Record<string, unknown> = {
      ownerUserId: actor.userId,
    }
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
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching hooks:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const parsed = parseHookCreateInput(await request.json())

    const hook = await prisma.hook.create({
      data: {
        name: parsed.name,
        matcher: parsed.matcher,
        type: parsed.type,
        command: parsed.command,
        isActive: parsed.isActive,
        ownerUserId: actor.userId,
      } as any,
    })

    notifyHooksChanged(actor.userId, hook.id)

    return NextResponse.json(hook, { status: 201 })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof HookValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error creating hook:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
