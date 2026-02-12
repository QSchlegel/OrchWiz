import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor, type AccessActor } from "@/lib/security/access-control"
import { decideSkillCatalogActivationForOwner, SkillActivationError } from "@/lib/skills/activation"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export const dynamic = "force-dynamic"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseDecision(value: unknown): "approve" | "deny" | null {
  return value === "approve" || value === "deny" ? value : null
}

interface SkillActivationRouteDeps {
  requireActor: () => Promise<AccessActor>
  decideActivation: typeof decideSkillCatalogActivationForOwner
  publishNotificationUpdated: typeof publishNotificationUpdated
}

const defaultDeps: SkillActivationRouteDeps = {
  requireActor: requireAccessActor,
  decideActivation: decideSkillCatalogActivationForOwner,
  publishNotificationUpdated,
}

export async function handlePatchSkillCatalogActivation(
  request: NextRequest,
  entryId: string,
  deps: SkillActivationRouteDeps = defaultDeps,
) {
  try {
    const actor = await deps.requireActor()
    const body = asRecord(await request.json().catch(() => ({})))
    const decision = parseDecision(body.decision)
    if (!decision) {
      return NextResponse.json({ error: "decision must be approve or deny" }, { status: 400 })
    }

    const rationale = asNonEmptyString(body.rationale)
    if (!rationale) {
      return NextResponse.json({ error: "rationale is required" }, { status: 400 })
    }

    const entry = await deps.decideActivation({
      ownerUserId: actor.userId,
      catalogEntryId: entryId,
      decision,
      rationale,
      actingBridgeCrewId: asNonEmptyString(body.actingBridgeCrewId),
      reviewedByUserId: actor.userId,
    })

    deps.publishNotificationUpdated({
      userId: actor.userId,
      channel: "skills",
      entityId: entry.id,
    })

    return NextResponse.json({ entry })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof SkillActivationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Skill activation route failed:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params
  return handlePatchSkillCatalogActivation(request, entryId)
}
