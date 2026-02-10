import crypto from "node:crypto"
import { NextRequest } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  shipyardSelfHealErrorJson,
  shipyardSelfHealJson,
} from "@/lib/shipyard/self-heal/http"

export const dynamic = "force-dynamic"

interface SelfHealRunRequest {
  maxDeployments: number
  includeVerbose: boolean
  force: boolean
  deploymentIds: string[]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const parsed = value
    .filter((entry) => typeof entry === "string")
    .map((entry) => String(entry).trim())
    .filter(Boolean)

  if (parsed.length !== value.length) {
    return null
  }

  return [...new Set(parsed)]
}

function defaultMaxDeployments(): number {
  const parsed = Number.parseInt(
    process.env.SHIPYARD_SELF_HEAL_MAX_DEPLOYMENTS_PER_RUN || "20",
    10,
  )
  if (!Number.isFinite(parsed)) {
    return 20
  }

  return Math.max(1, Math.min(100, parsed))
}

function normalizeRunRequest(
  body: Record<string, unknown>,
): { ok: true; value: SelfHealRunRequest } | { ok: false; error: string } {
  const includeVerboseRaw = body.includeVerbose
  if (includeVerboseRaw !== undefined && typeof includeVerboseRaw !== "boolean") {
    return {
      ok: false,
      error: "includeVerbose must be a boolean when provided",
    }
  }

  const forceRaw = body.force
  if (forceRaw !== undefined && typeof forceRaw !== "boolean") {
    return {
      ok: false,
      error: "force must be a boolean when provided",
    }
  }

  const maxDeploymentsRaw = body.maxDeployments
  if (maxDeploymentsRaw !== undefined) {
    if (!Number.isFinite(maxDeploymentsRaw)) {
      return {
        ok: false,
        error: "maxDeployments must be a number when provided",
      }
    }

    const maxDeployments = Math.round(Number(maxDeploymentsRaw))
    if (maxDeployments < 1 || maxDeployments > 100) {
      return {
        ok: false,
        error: "maxDeployments must be between 1 and 100",
      }
    }
  }

  const deploymentIdsRaw = body.deploymentIds
  if (deploymentIdsRaw !== undefined) {
    const parsed = asStringArray(deploymentIdsRaw)
    if (!parsed) {
      return {
        ok: false,
        error: "deploymentIds must be an array of non-empty strings when provided",
      }
    }
  }

  return {
    ok: true,
    value: {
      includeVerbose: includeVerboseRaw === true,
      force: forceRaw === true,
      maxDeployments:
        maxDeploymentsRaw !== undefined
          ? Math.round(Number(maxDeploymentsRaw))
          : defaultMaxDeployments(),
      deploymentIds: asStringArray(deploymentIdsRaw) || [],
    },
  }
}

export interface SelfHealRunRouteDeps {
  requireActor: typeof requireAccessActor
  now: () => Date
  createRunId: () => string
}

const defaultDeps: SelfHealRunRouteDeps = {
  requireActor: requireAccessActor,
  now: () => new Date(),
  createRunId: () => crypto.randomUUID(),
}

export async function handleGetRun(
  deps: SelfHealRunRouteDeps = defaultDeps,
) {
  try {
    await deps.requireActor()
    return shipyardSelfHealJson({
      run: null,
      status: "idle",
      note: "Ship Yard self-healing run history is in beta and currently report-only.",
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return shipyardSelfHealErrorJson(error.message, error.status, { code: error.code })
    }

    console.error("Error loading Ship Yard self-heal run status:", error)
    return shipyardSelfHealErrorJson("Internal server error", 500)
  }
}

export async function handlePostRun(
  request: NextRequest,
  deps: SelfHealRunRouteDeps = defaultDeps,
) {
  try {
    await deps.requireActor()

    const body = asRecord(await request.json().catch(() => ({})))
    const normalized = normalizeRunRequest(body)
    if (!normalized.ok) {
      return shipyardSelfHealErrorJson(normalized.error, 400)
    }

    return shipyardSelfHealJson(
      {
        accepted: true,
        run: {
          id: deps.createRunId(),
          status: "beta_preview",
          trigger: "manual",
          executedAt: deps.now().toISOString(),
          executed: false,
          reason:
            "Self-healing execution is still in beta rollout. This run captures intent and validation only.",
          request: normalized.value,
          summary: {
            checkedDeployments: 0,
            healedDeployments: 0,
            failedDeployments: 0,
          },
        },
      },
      202,
    )
  } catch (error) {
    if (error instanceof AccessControlError) {
      return shipyardSelfHealErrorJson(error.message, error.status, { code: error.code })
    }

    console.error("Error starting Ship Yard self-heal run:", error)
    return shipyardSelfHealErrorJson("Internal server error", 500)
  }
}

export async function GET() {
  return handleGetRun()
}

export async function POST(request: NextRequest) {
  return handlePostRun(request)
}
