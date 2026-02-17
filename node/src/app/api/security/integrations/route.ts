import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { securityIncidentsEnabled } from "@/lib/security/incident-response/feature-flag"
import {
  getSecurityIntegrationSecretsSummary,
  SecurityIntegrationSecretsError,
  upsertSecurityIntegrationSecrets,
} from "@/lib/security/integrations/secret-vault"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const { summary } = await getSecurityIntegrationSecretsSummary({ userId: actor.userId })
    return NextResponse.json(summary)
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof SecurityIntegrationSecretsError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details ?? null },
        { status: error.status },
      )
    }

    console.error("Error loading security integration secrets summary:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!securityIncidentsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const actor = await requireAccessActor()
    const body = await request.json().catch(() => ({}))

    const existing = await getSecurityIntegrationSecretsSummary({ userId: actor.userId })
    const nextValues = { ...existing.resolved }

    if (typeof body?.mispBaseUrl === "string") {
      const trimmed = body.mispBaseUrl.trim()
      nextValues.misp_base_url = trimmed.length > 0 ? trimmed : undefined
    }

    if (typeof body?.mispApiKey === "string") {
      const trimmed = body.mispApiKey.trim()
      if (trimmed.length > 0) {
        nextValues.misp_api_key = trimmed
      }
    } else if (body?.mispApiKey === null) {
      nextValues.misp_api_key = undefined
    }

    if (typeof body?.virustotalApiKey === "string") {
      const trimmed = body.virustotalApiKey.trim()
      if (trimmed.length > 0) {
        nextValues.virustotal_api_key = trimmed
      }
    } else if (body?.virustotalApiKey === null) {
      nextValues.virustotal_api_key = undefined
    }

    const summary = await upsertSecurityIntegrationSecrets({ userId: actor.userId, values: nextValues })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof SecurityIntegrationSecretsError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details ?? null },
        { status: error.status },
      )
    }

    console.error("Error updating security integration secrets:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
