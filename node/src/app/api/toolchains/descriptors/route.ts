import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { resolveToolchainDescriptors } from "@/lib/toolchains/registry"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAccessActor()

    const channel = request.nextUrl.searchParams.get("channel")
    const shipDeploymentId = request.nextUrl.searchParams.get("shipDeploymentId")
    const bridgeCrewId = request.nextUrl.searchParams.get("bridgeCrewId")
    const subagentId = request.nextUrl.searchParams.get("subagentId")

    const metadata: Record<string, unknown> = {
      ...(subagentId
        ? {
            subagentId,
          }
        : {}),
      ...(channel === "bridge"
        ? {
            bridge: {
              channel: "bridge-agent",
              ...(shipDeploymentId
                ? {
                    shipDeploymentId,
                  }
                : {}),
              ...(bridgeCrewId
                ? {
                    bridgeCrewId,
                  }
                : {}),
              ...(subagentId
                ? {
                    subagentId,
                  }
                : {}),
            },
          }
        : {}),
      ...(channel === "quartermaster"
        ? {
            quartermaster: {
              channel: "ship-quartermaster",
              ...(shipDeploymentId
                ? {
                    shipDeploymentId,
                  }
                : {}),
              ...(subagentId
                ? {
                    subagentId,
                  }
                : {}),
            },
          }
        : {}),
      ...(shipDeploymentId
        ? {
            shipContext: {
              shipDeploymentId,
            },
          }
        : {}),
    }

    const descriptors = await resolveToolchainDescriptors({
      ownerUserId: actor.userId,
      metadata,
    })

    return NextResponse.json({ descriptors })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Failed to resolve toolchain descriptors:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
