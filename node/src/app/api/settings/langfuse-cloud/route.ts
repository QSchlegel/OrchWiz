import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import {
  readUserLangfuseCloudSettings,
  writeUserLangfuseCloudSettings,
} from "@/lib/settings/langfuse-cloud"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await readUserLangfuseCloudSettings(session.user.id)
    return NextResponse.json({ settings })
  } catch (error) {
    console.error("Error loading Langfuse Cloud settings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const settingsInput =
      Object.prototype.hasOwnProperty.call(body, "settings")
        ? asRecord(body.settings)
        : body

    const settings = await writeUserLangfuseCloudSettings({
      userId: session.user.id,
      settings: settingsInput,
    })

    return NextResponse.json({ settings })
  } catch (error) {
    console.error("Error saving Langfuse Cloud settings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
