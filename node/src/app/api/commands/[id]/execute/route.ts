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
    const { sessionId } = body

    const command = await prisma.command.findUnique({
      where: { id },
    })

    if (!command) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 })
    }

    // Create execution record
    const execution = await prisma.commandExecution.create({
      data: {
        commandId: id,
        sessionId: sessionId || null,
        userId: session.user.id,
        status: "running",
        startedAt: new Date(),
      },
    })

    // TODO: Actually execute the command script
    // For now, simulate execution
    setTimeout(async () => {
      await prisma.commandExecution.update({
        where: { id: execution.id },
        data: {
          status: "completed",
          output: "Command executed successfully (simulated)",
          completedAt: new Date(),
          duration: 1000,
        },
      })
    }, 1000)

    return NextResponse.json(execution)
  } catch (error) {
    console.error("Error executing command:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
