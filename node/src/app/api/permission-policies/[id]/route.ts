import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  deleteCustomPermissionPolicy,
  getPermissionPolicyById,
  PermissionPolicyError,
  updateCustomPermissionPolicy,
} from "@/lib/execution/permission-policies"

export const dynamic = "force-dynamic"

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
    const policy = await getPermissionPolicyById(id)
    if (!policy) {
      return NextResponse.json({ error: "Permission policy not found" }, { status: 404 })
    }

    return NextResponse.json(policy)
  } catch (error) {
    console.error("Error fetching permission policy:", error)
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
    const body = await request.json()

    const updated = await updateCustomPermissionPolicy(id, {
      name: body?.name,
      description: body?.description,
      slug: body?.slug,
      rules: body?.rules,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error updating permission policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    await deleteCustomPermissionPolicy(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error deleting permission policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
