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

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const deploymentId = asString(request.nextUrl.searchParams.get("deploymentId"))
    if (!deploymentId) {
      return NextResponse.json({ error: "deploymentId is required" }, { status: 400 })
    }

    const deployment = await prisma.agentDeployment.findFirst({
      where: {
        id: deploymentId,
        userId: session.user.id,
      },
      select: {
        id: true,
      },
    })
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 })
    }

    const bridgeCrew = await prisma.bridgeCrew.findMany({
      where: {
        deploymentId,
      },
      orderBy: {
        role: "asc",
      },
    })

    return NextResponse.json(bridgeCrew)
  } catch (error) {
    console.error("Error fetching bridge crew:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
