import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import type { DeploymentProfile } from "@/lib/deployment/profile"
import { prisma } from "@/lib/prisma"
import { AccessControlError } from "@/lib/security/access-control"
import {
  buildShipyardSetupSnippets,
  ShipyardSecretVaultError,
  storeShipyardSecretTemplateEnvelope,
  summarizeShipyardSecretTemplate,
  summarizeStoredShipyardSecretTemplate,
  validateShipyardSecretTemplateValues,
  resolveShipyardSecretTemplateValues,
} from "@/lib/shipyard/secret-vault"
import { requireShipyardRequestActor } from "@/lib/shipyard/request-actor"

export const dynamic = "force-dynamic"

const DEPLOYMENT_PROFILES = new Set<DeploymentProfile>(["local_starship_build", "cloud_shipyard"])

function parseDeploymentProfile(value: unknown): DeploymentProfile | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!DEPLOYMENT_PROFILES.has(trimmed as DeploymentProfile)) {
    return null
  }
  return trimmed as DeploymentProfile
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function includeValuesFromQuery(value: string | null): boolean {
  return value === "true"
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)
    const deploymentProfile = parseDeploymentProfile(request.nextUrl.searchParams.get("deploymentProfile"))
    if (!deploymentProfile) {
      return NextResponse.json({ error: "deploymentProfile is required" }, { status: 400 })
    }

    const includeValues = includeValuesFromQuery(request.nextUrl.searchParams.get("includeValues"))
    const template = await prisma.shipyardSecretTemplate.findUnique({
      where: {
        userId_deploymentProfile: {
          userId: actor.userId,
          deploymentProfile,
        },
      },
    })

    if (!template) {
      const summary = summarizeShipyardSecretTemplate({
        deploymentProfile,
        storageMode: "none",
        values: {},
      })
      const snippets = buildShipyardSetupSnippets({
        deploymentProfile,
        values: {},
      })
      return NextResponse.json({
        deploymentProfile,
        exists: false,
        template: {
          id: null,
          updatedAt: null,
          summary,
          ...(includeValues ? { values: {} } : {}),
        },
        snippets,
      })
    }

    const resolvedValues = await resolveShipyardSecretTemplateValues({
      userId: actor.userId,
      deploymentProfile,
      stored: template.secrets,
    })
    const summary = summarizeStoredShipyardSecretTemplate({
      deploymentProfile,
      stored: template.secrets,
      resolvedValues,
    })
    const snippets = buildShipyardSetupSnippets({
      deploymentProfile,
      values: resolvedValues,
      redact: !includeValues,
    })

    return NextResponse.json({
      deploymentProfile,
      exists: true,
      template: {
        id: template.id,
        updatedAt: template.updatedAt.toISOString(),
        summary,
        ...(includeValues ? { values: resolvedValues } : {}),
      },
      snippets,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof ShipyardSecretVaultError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error loading Ship Yard secret template:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)
    const body = await request.json().catch(() => ({}))
    const deploymentProfile = parseDeploymentProfile(body?.deploymentProfile)
    if (!deploymentProfile) {
      return NextResponse.json({ error: "deploymentProfile is required" }, { status: 400 })
    }

    const normalizedValues = validateShipyardSecretTemplateValues({
      deploymentProfile,
      values: body?.values ?? {},
    })

    const storedEnvelope = await storeShipyardSecretTemplateEnvelope({
      userId: actor.userId,
      deploymentProfile,
      values: normalizedValues,
    })

    const template = await prisma.shipyardSecretTemplate.upsert({
      where: {
        userId_deploymentProfile: {
          userId: actor.userId,
          deploymentProfile,
        },
      },
      update: {
        secrets: toInputJsonValue(storedEnvelope),
      },
      create: {
        userId: actor.userId,
        deploymentProfile,
        secrets: toInputJsonValue(storedEnvelope),
      },
    })

    const summary = summarizeStoredShipyardSecretTemplate({
      deploymentProfile,
      stored: storedEnvelope,
      resolvedValues: normalizedValues,
    })
    const snippets = buildShipyardSetupSnippets({
      deploymentProfile,
      values: normalizedValues,
    })

    return NextResponse.json({
      deploymentProfile,
      exists: true,
      template: {
        id: template.id,
        updatedAt: template.updatedAt.toISOString(),
        summary,
        values: normalizedValues,
      },
      snippets,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof ShipyardSecretVaultError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error saving Ship Yard secret template:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireShipyardRequestActor(request)
    const deploymentProfile = parseDeploymentProfile(request.nextUrl.searchParams.get("deploymentProfile"))
    if (!deploymentProfile) {
      return NextResponse.json({ error: "deploymentProfile is required" }, { status: 400 })
    }

    const deleted = await prisma.shipyardSecretTemplate.deleteMany({
      where: {
        userId: actor.userId,
        deploymentProfile,
      },
    })

    return NextResponse.json({
      deploymentProfile,
      deleted: deleted.count > 0,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof ShipyardSecretVaultError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      )
    }

    console.error("Error deleting Ship Yard secret template:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
