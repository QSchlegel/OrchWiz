import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { RuntimeAdapterRegistryError, updateRuntimeAdapterActivation } from "@/lib/runtime/registry"

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

function parseDecision(value: unknown): "approve" | "deny" {
  return value === "deny" ? "deny" : "approve"
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireAccessActor()
    if (!actor.isAdmin) {
      return NextResponse.json({ error: "Only admins can activate runtime adapters." }, { status: 403 })
    }

    const { id } = await params
    const body = asRecord(await request.json().catch(() => ({})))
    const rationale = asString(body.rationale)

    if (!rationale) {
      return NextResponse.json({ error: "rationale is required" }, { status: 400 })
    }

    const adapter = await updateRuntimeAdapterActivation({
      idOrAdapterId: id,
      decision: parseDecision(body.decision),
      rationale,
      reviewedByUserId: actor.userId,
      actingBridgeCrewId: asString(body.actingBridgeCrewId),
    })

    return NextResponse.json({ adapter })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof RuntimeAdapterRegistryError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to activate runtime adapter:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
