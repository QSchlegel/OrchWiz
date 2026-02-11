import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import { asNonEmptyString, readJsonBody } from "@/lib/shipyard/cloud/http"
import {
  buildHetznerSshKeySubmissionSnippet,
  generateEd25519SshKeyPair,
} from "@/lib/shipyard/cloud/ssh-keys"
import {
  ShipyardCloudVaultError,
  storeCloudSshPrivateKeyEnvelope,
} from "@/lib/shipyard/cloud/vault"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function fallbackKeyName(): string {
  const now = new Date()
  const isoCompact = now.toISOString().replaceAll(":", "").replaceAll(".", "").replaceAll("-", "")
  return `orchwiz-hetzner-${isoCompact}`
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)

    const keys = await prisma.shipyardCloudSshKey.findMany({
      where: {
        userId: actor.userId,
        provider: "hetzner",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        provider: true,
        publicKey: true,
        fingerprint: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      provider: "hetzner",
      keys: keys.map((key) => ({
        ...key,
        createdAt: key.createdAt.toISOString(),
        updatedAt: key.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    console.error("Error loading Hetzner SSH keys:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)
    const body = await readJsonBody(request)
    const keyName = asNonEmptyString(body.name) || fallbackKeyName()

    const generated = await generateEd25519SshKeyPair({
      name: keyName,
      comment: `orchwiz-${actor.userId}`,
    })

    const envelope = await storeCloudSshPrivateKeyEnvelope({
      userId: actor.userId,
      provider: "hetzner",
      keyName: generated.name,
      privateKey: generated.privateKey,
    })

    const stored = await prisma.shipyardCloudSshKey.create({
      data: {
        userId: actor.userId,
        provider: "hetzner",
        name: generated.name,
        publicKey: generated.publicKey,
        fingerprint: generated.fingerprint,
        privateKeyEnvelope: toInputJsonValue(envelope),
      },
      select: {
        id: true,
        provider: true,
        name: true,
        publicKey: true,
        fingerprint: true,
        createdAt: true,
      },
    })

    const providerSubmission = buildHetznerSshKeySubmissionSnippet({
      keyName: stored.name,
      publicKey: stored.publicKey,
    })

    return NextResponse.json({
      provider: "hetzner",
      key: {
        ...stored,
        createdAt: stored.createdAt.toISOString(),
      },
      oneTimeDownload: {
        fileName: `${stored.name}.pem`,
        contentType: "application/x-pem-file",
        privateKey: generated.privateKey,
      },
      providerSubmission,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof ShipyardCloudVaultError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    const message = (error as Error).message || "Failed to generate SSH key"
    if (message.includes("ssh-keygen")) {
      return NextResponse.json(
        {
          error: "ssh-keygen command is unavailable or failed to execute.",
          code: "SSH_KEYGEN_FAILED",
        },
        { status: 422 },
      )
    }

    console.error("Error creating Hetzner SSH key:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
