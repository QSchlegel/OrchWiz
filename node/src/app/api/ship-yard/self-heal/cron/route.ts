import { NextRequest } from "next/server"
import {
  shipyardSelfHealErrorJson,
  shipyardSelfHealJson,
} from "@/lib/shipyard/self-heal/http"

export const dynamic = "force-dynamic"

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export interface ShipyardSelfHealCronDeps {
  expectedToken: () => string | null
  now: () => Date
}

const defaultDeps: ShipyardSelfHealCronDeps = {
  expectedToken: () => {
    const token = process.env.SHIPYARD_SELF_HEAL_CRON_TOKEN?.trim()
    return token && token.length > 0 ? token : null
  },
  now: () => new Date(),
}

export async function handlePostCron(
  request: NextRequest,
  deps: ShipyardSelfHealCronDeps = defaultDeps,
) {
  try {
    const expectedToken = deps.expectedToken()
    if (!expectedToken) {
      return shipyardSelfHealErrorJson(
        "SHIPYARD_SELF_HEAL_CRON_TOKEN is not configured",
        503,
      )
    }

    const suppliedToken = parseBearerToken(request.headers.get("authorization"))
    if (!suppliedToken || suppliedToken !== expectedToken) {
      return shipyardSelfHealErrorJson("Unauthorized", 401)
    }

    return shipyardSelfHealJson(
      {
        executed: false,
        trigger: "cron",
        reason:
          "Self-healing cron execution is in beta rollout. This endpoint is currently report-only.",
        checkedUsers: 0,
        healedDeployments: 0,
        failedDeployments: 0,
        executedAt: deps.now().toISOString(),
      },
      202,
    )
  } catch (error) {
    console.error("Error running Ship Yard self-heal cron:", error)
    return shipyardSelfHealErrorJson("Internal server error", 500)
  }
}

export async function POST(request: NextRequest) {
  return handlePostCron(request)
}
