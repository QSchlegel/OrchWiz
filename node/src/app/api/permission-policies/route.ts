import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  createCustomPermissionPolicy,
  listPermissionPolicies,
  PermissionPolicyError,
} from "@/lib/execution/permission-policies"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const policies = await listPermissionPolicies()
    return NextResponse.json(policies)
  } catch (error) {
    console.error("Error fetching permission policies:", error)
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
    const created = await createCustomPermissionPolicy({
      name: body?.name,
      description: body?.description,
      slug: body?.slug,
      rules: body?.rules,
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof PermissionPolicyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error creating permission policy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
