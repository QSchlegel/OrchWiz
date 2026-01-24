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
    const documentId = searchParams.get("documentId")
    const status = searchParams.get("status")

    const where: any = {}
    if (documentId) {
      where.documentId = documentId
    }
    if (status) {
      where.status = status
    }

    const entries = await prisma.guidanceEntry.findMany({
      where,
      include: {
        revisions: {
          orderBy: {
            timestamp: "desc",
          },
          take: 5,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error("Error fetching guidance entries:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
