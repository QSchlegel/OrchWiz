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

    const applications = await prisma.applicationDeployment.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(applications)
  } catch (error) {
    console.error("Error fetching applications:", error)
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
      name, 
      description, 
      applicationType,
      image,
      repository,
      branch,
      buildCommand,
      startCommand,
      port,
      environment,
      nodeId, 
      nodeType, 
      nodeUrl, 
      config, 
      metadata,
      version
    } = body

    const application = await prisma.applicationDeployment.create({
      data: {
        name,
        description,
        applicationType,
        image: image || null,
        repository: repository || null,
        branch: branch || null,
        buildCommand: buildCommand || null,
        startCommand: startCommand || null,
        port: port || null,
        environment: environment || {},
        nodeId,
        nodeType,
        nodeUrl: nodeUrl || null,
        config: config || {},
        metadata: metadata || {},
        version: version || null,
        userId: session.user.id,
        status: "pending",
      },
    })

    // TODO: Trigger actual deployment process
    // For now, simulate deployment
    setTimeout(async () => {
      await prisma.applicationDeployment.update({
        where: { id: application.id },
        data: {
          status: "active",
          deployedAt: new Date(),
          lastHealthCheck: new Date(),
          healthStatus: "healthy",
        },
      })
    }, 3000)

    return NextResponse.json(application)
  } catch (error) {
    console.error("Error creating application:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
