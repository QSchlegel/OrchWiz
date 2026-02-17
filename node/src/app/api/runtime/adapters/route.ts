import { NextRequest, NextResponse } from "next/server"
import {
  RuntimeAdapterRegistryError,
  createRuntimeAdapterCatalogEntry,
  listRuntimeAdapterCatalogEntries,
  upsertBuiltinRuntimeAdapters,
} from "@/lib/runtime/registry"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function GET() {
  try {
    await requireAccessActor()
    await upsertBuiltinRuntimeAdapters()
    const adapters = await listRuntimeAdapterCatalogEntries()
    return NextResponse.json({ adapters })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to list runtime adapters:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    const body = asRecord(await request.json().catch(() => ({})))

    const adapter = await createRuntimeAdapterCatalogEntry({
      adapterId: asString(body.adapterId) || "",
      name: asString(body.name) || "",
      description: asString(body.description),
      protocol: (asString(body.protocol) || "") as "internal" | "webhook" | "openai_compat" | "mcp_sse" | "mcp_stdio" | "cli_exec",
      endpoint: asString(body.endpoint),
      authRef: asString(body.authRef),
      capabilities:
        body.capabilities && typeof body.capabilities === "object" && !Array.isArray(body.capabilities)
          ? body.capabilities as Record<string, unknown>
          : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? body.metadata as Record<string, unknown>
          : null,
      createdByUserId: actor.userId,
    })

    return NextResponse.json({ adapter }, { status: 201 })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof RuntimeAdapterRegistryError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to create runtime adapter:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
