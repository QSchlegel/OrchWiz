import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asStatus(value: unknown): "active" | "inactive" | null {
  if (value === "active" || value === "inactive") {
    return value
  }
  return null
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
    const hasDescription = Object.prototype.hasOwnProperty.call(body ?? {}, "description")

    const existing = await prisma.bridgeCrew.findFirst({
      where: {
        id,
        deployment: {
          userId: session.user.id,
        },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Bridge crew record not found" }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    const name = asString(body?.name)
    const description = hasDescription ? asString(body?.description) : undefined
    const content = asString(body?.content)
    const status = asStatus(body?.status)

    if (name !== null) updateData.name = name
    if (hasDescription) updateData.description = description
    if (content !== null) updateData.content = content
    if (status !== null) updateData.status = status
    if (body?.metadata !== undefined) updateData.metadata = body.metadata

    const bridgeCrew = await prisma.bridgeCrew.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(bridgeCrew)
  } catch (error) {
    console.error("Error updating bridge crew:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
