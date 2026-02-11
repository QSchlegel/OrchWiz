import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import { readJsonBody, asNonEmptyString } from "@/lib/shipyard/cloud/http"
import {
  renderHetznerFileBundle,
  SHIPYARD_CLOUD_FILE_ALLOWLIST,
} from "@/lib/shipyard/cloud/files"
import { normalizeCloudProviderConfig } from "@/lib/shipyard/cloud/types"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)
    const body = await readJsonBody(request)

    const cloudProvider = normalizeCloudProviderConfig(body.cloudProvider || body)
    const sshKeyId = asNonEmptyString(body.sshKeyId) || cloudProvider.sshKeyId
    if (!sshKeyId) {
      return NextResponse.json(
        {
          error: "sshKeyId is required to render Hetzner files.",
          code: "CLOUD_SSH_KEY_MISSING",
        },
        { status: 400 },
      )
    }

    const sshKey = await prisma.shipyardCloudSshKey.findFirst({
      where: {
        id: sshKeyId,
        userId: actor.userId,
        provider: "hetzner",
      },
      select: {
        id: true,
        name: true,
        publicKey: true,
        fingerprint: true,
      },
    })

    if (!sshKey) {
      return NextResponse.json(
        {
          error: "Selected Hetzner SSH key was not found.",
          code: "CLOUD_SSH_KEY_MISSING",
        },
        { status: 404 },
      )
    }

    const bundle = renderHetznerFileBundle({
      config: {
        ...cloudProvider,
        sshKeyId,
      },
      sshPublicKey: sshKey.publicKey,
    })

    return NextResponse.json({
      provider: "hetzner",
      sshKey,
      files: SHIPYARD_CLOUD_FILE_ALLOWLIST.map((path) => ({
        path,
        content: bundle[path],
      })),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error rendering Hetzner cloud file bundle:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
