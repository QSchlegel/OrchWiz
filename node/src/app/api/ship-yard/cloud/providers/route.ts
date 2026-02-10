import { NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { listCloudProviderHandlers } from "@/lib/shipyard/cloud/providers/registry"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAccessActor()

    const providers = listCloudProviderHandlers().map((provider) => {
      const readiness = provider.readiness()
      return {
        id: provider.id,
        displayName: provider.displayName,
        enabled: readiness.enabled,
        ready: readiness.ready,
        checks: readiness.checks,
      }
    })

    return NextResponse.json({
      providers,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading cloud provider readiness:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
