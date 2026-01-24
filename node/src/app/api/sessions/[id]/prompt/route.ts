import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { prompt, metadata } = body

    // Verify session belongs to user
    const dbSession = await prisma.session.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!dbSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Create user input interaction
    const interaction = await prisma.sessionInteraction.create({
      data: {
        sessionId: id,
        type: "user_input",
        content: prompt,
        metadata: metadata || {},
      },
    })

    // Update session status if needed
    if (dbSession.status === "planning") {
      await prisma.session.update({
        where: { id },
        data: { status: "executing" },
      })
    }

    // TODO: Integrate with Claude API to get AI response
    // For now, return the interaction
    return NextResponse.json({
      interaction,
      message: "Prompt submitted. AI integration pending.",
    })
  } catch (error) {
    console.error("Error submitting prompt:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
