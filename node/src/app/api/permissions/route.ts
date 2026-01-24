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
    const status = searchParams.get("status")
    const scope = searchParams.get("scope")
    const type = searchParams.get("type")

    const where: any = {}
    if (status) {
      where.status = status
    }
    if (scope) {
      where.scope = scope
    }
    if (type) {
      where.type = type
    }

    const permissions = await prisma.permission.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(permissions)
  } catch (error) {
    console.error("Error fetching permissions:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      commandPattern,
      type,
      status,
      scope,
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

    const permission = await prisma.permission.create({
      data: {
        commandPattern,
        type,
        status,
        scope,
        sourceFile: sourceFile || null,
        isShared: isShared || false,
      },
    })

    return NextResponse.json(permission, { status: 201 })
  } catch (error) {
    console.error("Error creating permission:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
