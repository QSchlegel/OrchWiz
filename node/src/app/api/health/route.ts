import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        db: "missing",
        message: "DATABASE_URL is not set.",
      },
      { status: 503 },
    )
  }

  try {
    // Prisma doesn't expose a tiny "ping" API; a trivial query is the simplest readiness check.
    await prisma.$queryRawUnsafe("SELECT 1")

    return NextResponse.json({
      ok: true,
      db: "ok",
      now: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        ok: false,
        db: "error",
        message,
      },
      { status: 503 },
    )
  }
}

