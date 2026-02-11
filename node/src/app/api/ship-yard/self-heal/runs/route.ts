import { NextRequest } from "next/server"
import { AccessControlError } from "@/lib/security/access-control"
import {
  shipyardSelfHealErrorJson,
  shipyardSelfHealJson,
} from "@/lib/shipyard/self-heal/http"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireShipyardRequestActor(request)

    return shipyardSelfHealJson({
      runs: [],
      total: 0,
      note: "Ship Yard self-healing run listing is in beta and currently report-only.",
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return shipyardSelfHealErrorJson(error.message, error.status, { code: error.code })
    }

    console.error("Error loading Ship Yard self-heal runs:", error)
    return shipyardSelfHealErrorJson("Internal server error", 500)
  }
}
