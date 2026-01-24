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

    const deployments = await prisma.agentDeployment.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        subagent: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(deployments)
  } catch (error) {
    console.error("Error fetching deployments:", error)
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
    const { name, description, subagentId, nodeId, nodeType, nodeUrl, config, metadata } = body

    const deployment = await prisma.agentDeployment.create({
      data: {
        name,
        description,
        subagentId: subagentId || null,
        nodeId,
        nodeType,
        nodeUrl: nodeUrl || null,
        config: config || {},
        metadata: metadata || {},
        userId: session.user.id,
        status: "pending",
      },
      include: {
        subagent: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    })

    // TODO: Trigger actual deployment process
    // For now, simulate deployment
    setTimeout(async () => {
      await prisma.agentDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "active",
          deployedAt: new Date(),
          lastHealthCheck: new Date(),
          healthStatus: "healthy",
        },
      })
    }, 2000)

    return NextResponse.json(deployment)
  } catch (error) {
    console.error("Error creating deployment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
