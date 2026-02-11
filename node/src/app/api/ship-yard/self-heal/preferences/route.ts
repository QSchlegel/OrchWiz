import { NextRequest } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  shipyardSelfHealErrorJson,
  shipyardSelfHealJson,
} from "@/lib/shipyard/self-heal/http"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

interface SelfHealPreferences {
  enabled: boolean
  cooldownMinutes: number
  persisted: boolean
  source: "default" | "request"
}

function parseDefaultCooldownMinutes(): number {
  const parsed = Number.parseInt(
    process.env.SHIPYARD_SELF_HEAL_DEFAULT_COOLDOWN_MINUTES || "30",
    10,
  )
  if (!Number.isFinite(parsed)) {
    return 30
  }

  return Math.max(5, Math.min(1440, parsed))
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizePreferenceInput(
  body: Record<string, unknown>,
  defaults: SelfHealPreferences,
): { ok: true; preferences: SelfHealPreferences } | { ok: false; error: string } {
  const enabledRaw = body.enabled
  if (enabledRaw !== undefined && typeof enabledRaw !== "boolean") {
    return {
      ok: false,
      error: "enabled must be a boolean when provided",
    }
  }

  const cooldownRaw = body.cooldownMinutes
  if (cooldownRaw !== undefined) {
    if (!Number.isFinite(cooldownRaw)) {
      return {
        ok: false,
        error: "cooldownMinutes must be a number when provided",
      }
    }
    const cooldownMinutes = Math.round(Number(cooldownRaw))
    if (cooldownMinutes < 5 || cooldownMinutes > 1440) {
      return {
        ok: false,
        error: "cooldownMinutes must be between 5 and 1440",
      }
    }
  }

  return {
    ok: true,
    preferences: {
      enabled: typeof enabledRaw === "boolean" ? enabledRaw : defaults.enabled,
      cooldownMinutes:
        cooldownRaw !== undefined ? Math.round(Number(cooldownRaw)) : defaults.cooldownMinutes,
      persisted: false,
      source: "request",
    },
  }
}

export interface SelfHealPreferencesRouteDeps {
  requireActor: typeof requireAccessActor
  defaultCooldownMinutes: () => number
}

const defaultDeps: SelfHealPreferencesRouteDeps = {
  requireActor: requireAccessActor,
  defaultCooldownMinutes: parseDefaultCooldownMinutes,
}

export async function handleGetPreferences(
  deps: SelfHealPreferencesRouteDeps = defaultDeps,
) {
  try {
    await deps.requireActor()
    const preferences: SelfHealPreferences = {
      enabled: false,
      cooldownMinutes: deps.defaultCooldownMinutes(),
      persisted: false,
      source: "default",
    }
    return shipyardSelfHealJson({ preferences })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return shipyardSelfHealErrorJson(error.message, error.status, { code: error.code })
    }

    console.error("Error loading Ship Yard self-heal preferences:", error)
    return shipyardSelfHealErrorJson("Internal server error", 500)
  }
}

export async function handlePutPreferences(
  request: NextRequest,
  deps: SelfHealPreferencesRouteDeps = defaultDeps,
) {
  try {
    await deps.requireActor()

    const defaults: SelfHealPreferences = {
      enabled: false,
      cooldownMinutes: deps.defaultCooldownMinutes(),
      persisted: false,
      source: "default",
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const normalized = normalizePreferenceInput(body, defaults)
    if (!normalized.ok) {
      return shipyardSelfHealErrorJson(normalized.error, 400)
    }

    return shipyardSelfHealJson({ preferences: normalized.preferences })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return shipyardSelfHealErrorJson(error.message, error.status, { code: error.code })
    }

    console.error("Error updating Ship Yard self-heal preferences:", error)
    return shipyardSelfHealErrorJson("Internal server error", 500)
  }
}

export async function GET(request: NextRequest) {
  return handleGetPreferences({
    ...defaultDeps,
    requireActor: async () => requireShipyardRequestActor(request),
  })
}

export async function PUT(request: NextRequest) {
  return handlePutPreferences(request, {
    ...defaultDeps,
    requireActor: async () => requireShipyardRequestActor(request),
  })
}
