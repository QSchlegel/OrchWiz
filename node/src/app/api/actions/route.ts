import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get("sessionId")
    const type = searchParams.get("type")
    const status = searchParams.get("status")

    const where: any = {}
    if (sessionId) {
      where.sessionId = sessionId
    }
    if (type) {
      where.type = type
    }
    if (status) {
      where.status = status
    }

    const actions = await prisma.agentAction.findMany({
      where,
      include: {
        session: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        timestamp: "desc",
      },
      take: 100,
    })

    return NextResponse.json(actions)
  } catch (error) {
    console.error("Error fetching actions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
