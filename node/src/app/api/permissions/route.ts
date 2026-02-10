import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { permissionChannelFromScope } from "@/lib/realtime/notification-routing"
import {
  AccessControlError,
  assertCanWriteOwnedResource,
  ownerScopedSharedReadWhere,
  requireAccessActor,
} from "@/lib/security/access-control"

export const dynamic = 'force-dynamic'

function asPermissionStatus(value: unknown): "allow" | "ask" | "deny" {
  if (value === "ask" || value === "deny") {
    return value
  }
  return "allow"
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAccessActor()

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status")
    const scope = searchParams.get("scope")
    const type = searchParams.get("type")
    const subagentId = searchParams.get("subagentId")

    const where: any = ownerScopedSharedReadWhere({
      actor,
      includeShared: true,
    })
    if (status) {
      where.status = status
    }
    if (scope) {
      where.scope = scope
    }
    if (type) {
      where.type = type
    }
    if (subagentId) {
      where.subagentId = subagentId
    }

    const permissions = await prisma.permission.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(permissions)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching permissions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()

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

    if (!commandPattern || !type || !status || !scope) {
      return NextResponse.json(
        {
          error:
            "commandPattern, type, status, and scope are required",
        },
        { status: 400 }
      )
    }
    if (scope === "subagent" && (!subagentId || typeof subagentId !== "string" || !subagentId.trim())) {
      return NextResponse.json(
        { error: "subagentId is required when scope is subagent" },
        { status: 400 },
      )
    }

    const normalizedSubagentId =
      typeof subagentId === "string" && subagentId.trim().length > 0 ? subagentId.trim() : null

    let subagentIsShared: boolean | null = null

    if (normalizedSubagentId) {
      const subagent = await prisma.subagent.findUnique({
        where: {
          id: normalizedSubagentId,
        },
        select: {
          id: true,
          ownerUserId: true,
          isShared: true,
        },
      })

      if (!subagent) {
        return NextResponse.json({ error: "subagentId not found" }, { status: 404 })
      }

      assertCanWriteOwnedResource({
        actor,
        ownerUserId: subagent.ownerUserId,
        notFoundMessage: "subagentId not found",
      })

      subagentIsShared = subagent.isShared
    }

    const permission = await prisma.permission.create({
      data: {
        commandPattern,
        type,
        status,
        scope,
        subagentId: scope === "subagent" ? normalizedSubagentId : null,
        sourceFile: sourceFile || null,
        isShared: isShared || false,
        ownerUserId: actor.userId,
      },
    })

    publishNotificationUpdated({
      userId: actor.userId,
      channel: permissionChannelFromScope({
        scope: permission.scope,
        status: asPermissionStatus(permission.status),
        subagentIsShared,
      }),
      entityId: permission.id,
    })

    return NextResponse.json(permission, { status: 201 })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error creating permission:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
