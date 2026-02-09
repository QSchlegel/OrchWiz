import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  listSubagentPermissionPolicyAssignments,
  PermissionPolicyError,
  replaceSubagentPermissionPolicyAssignments,
} from "@/lib/execution/permission-policies"

export const dynamic = "force-dynamic"

async function loadSubagent(id: string) {
  return prisma.subagent.findUnique({
    where: { id },
    select: {
      id: true,
      isShared: true,
    },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const subagent = await loadSubagent(id)
    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    const assignments = await listSubagentPermissionPolicyAssignments(id)
    return NextResponse.json(assignments)
  } catch (error) {
    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error fetching subagent permission policy assignments:", error)
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
    const subagent = await loadSubagent(id)
    if (!subagent) {
      return NextResponse.json({ error: "Subagent not found" }, { status: 404 })
    }

    if (subagent.isShared) {
      return NextResponse.json(
        { error: "Shared agents are read-only on this page." },
        { status: 403 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const assignments = await replaceSubagentPermissionPolicyAssignments({
      subagentId: id,
      assignments: body?.assignments,
    })

    return NextResponse.json(assignments)
  } catch (error) {
    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error replacing subagent permission policy assignments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
