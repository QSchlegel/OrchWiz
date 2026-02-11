import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"
import { personalDetailChannelForSubagent } from "@/lib/realtime/notification-routing"
import {
  listSubagentToolBindings,
  replaceSubagentToolBindings,
  SubagentToolBindingError,
} from "@/lib/tools/agent-bindings"
import {
  AccessControlError,
  assertCanReadOwnedResource,
  assertCanWriteOwnedResource,
  requireAccessActor,
  type AccessActor,
} from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

interface ToolBindingsSubagentRef {
  id: string
  ownerUserId: string | null
  isShared: boolean
}

interface ToolBindingsRouteDeps {
  requireActor: () => Promise<AccessActor>
  loadSubagent: (id: string) => Promise<ToolBindingsSubagentRef | null>
  listSubagentToolBindings: typeof listSubagentToolBindings
  replaceSubagentToolBindings: typeof replaceSubagentToolBindings
  publishNotificationUpdated: typeof publishNotificationUpdated
}

const defaultDeps: ToolBindingsRouteDeps = {
  requireActor: requireAccessActor,
  loadSubagent: async (id) =>
    prisma.subagent.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        isShared: true,
      },
    }),
  listSubagentToolBindings,
  replaceSubagentToolBindings,
  publishNotificationUpdated,
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

export async function handleGetSubagentToolBindingsRoute(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: ToolBindingsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()

    const { id } = await params
    const subagent = await deps.loadSubagent(id)
    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanReadOwnedResource({
      actor,
      ownerUserId: subagent.ownerUserId,
      isShared: subagent.isShared,
      allowSharedRead: true,
      notFoundMessage: "Subagent not found",
    })

    const bindings = await deps.listSubagentToolBindings(id)
    return NextResponse.json({
      bindings,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof SubagentToolBindingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching subagent tool bindings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function handlePutSubagentToolBindingsRoute(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: ToolBindingsRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()

    const { id } = await params
    const subagent = await deps.loadSubagent(id)
    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    assertCanWriteOwnedResource({
      actor,
      ownerUserId: subagent.ownerUserId,
      notFoundMessage: "Subagent not found",
    })

    if (subagent.isShared) {
      return NextResponse.json(
        { error: "Shared agents are read-only on this page." },
        { status: 403 },
      )
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const bindings = await deps.replaceSubagentToolBindings({
      subagentId: id,
      ownerUserId: actor.userId,
      bindings: body.bindings,
    })

    deps.publishNotificationUpdated({
      userId: subagent.ownerUserId || actor.userId,
      channel: personalDetailChannelForSubagent(subagent.isShared, "tools"),
      entityId: subagent.id,
    })

    return NextResponse.json({
      bindings,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof SubagentToolBindingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error replacing subagent tool bindings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleGetSubagentToolBindingsRoute(request, { params })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePutSubagentToolBindingsRoute(request, { params })
}
