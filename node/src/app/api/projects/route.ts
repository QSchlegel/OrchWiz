import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const publicOnly = searchParams.get("public") === "true"
    const category = searchParams.get("category")
    const search = searchParams.get("search")

    const session = await auth.api.getSession({ headers: await headers() })

    const where: any = {}
    
    if (publicOnly) {
      where.isPublic = true
    } else if (session) {
      // Authenticated users can see their own projects and public ones
      where.OR = [
        { userId: session.user.id },
        { isPublic: true }
      ]
    } else {
      // Unauthenticated users can only see public projects
      where.isPublic = true
    }

    if (category) {
      where.category = category
    }

    if (search) {
      where.OR = [
        ...(where.OR || []),
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { tags: { has: search } }
      ]
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(projects)
  } catch (error) {
    console.error("Error fetching projects:", error)
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
      slug,
      isPublic,
      tags,
      repository,
      website,
      readme,
      thumbnail,
      category
    } = body

    // Generate slug from name if not provided
    const projectSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

    // Check if slug already exists
    const existing = await prisma.project.findUnique({
      where: { slug: projectSlug },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Slug already exists" },
        { status: 400 }
      )
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        slug: projectSlug,
        isPublic: isPublic || false,
        tags: tags || [],
        repository: repository || null,
        website: website || null,
        readme: readme || null,
        thumbnail: thumbnail || null,
        category: category || null,
        userId: session.user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    })

    publishNotificationUpdated({
      userId: session.user.id,
      channel: "projects",
      entityId: project.id,
    })

    return NextResponse.json(project)
  } catch (error) {
    console.error("Error creating project:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
