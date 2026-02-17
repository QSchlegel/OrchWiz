import { prisma } from "@/lib/prisma"
import { isToolchainProtocolRegistryEnabled } from "@/lib/runtime/registry"

export type ToolchainProtocol = "mcp_sse" | "mcp_stdio" | "openai_compat" | "webhook"

export interface ToolchainDescriptor {
  catalogEntryId: string
  slug: string
  name: string
  description: string | null
  protocol: ToolchainProtocol
  endpoint: string | null
  authRef: string | null
  capabilities: Record<string, unknown>
  scope: {
    channel: "quartermaster" | "bridge" | "generic"
    shipDeploymentId: string | null
    bridgeCrewId: string | null
    subagentId: string | null
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveScope(metadata: Record<string, unknown>): {
  channel: "quartermaster" | "bridge" | "generic"
  shipDeploymentId: string | null
  bridgeCrewId: string | null
  subagentId: string | null
} {
  const bridge = asRecord(metadata.bridge)
  const quartermaster = asRecord(metadata.quartermaster)
  const shipContext = asRecord(metadata.shipContext)

  const shipDeploymentId =
    asString(bridge.shipDeploymentId)
    || asString(quartermaster.shipDeploymentId)
    || asString(shipContext.shipDeploymentId)
    || asString(shipContext.deploymentId)

  const bridgeCrewId = asString(bridge.bridgeCrewId)
  const subagentId =
    asString(metadata.subagentId)
    || asString(quartermaster.subagentId)
    || asString(bridge.subagentId)

  if (asString(quartermaster.channel) === "ship-quartermaster") {
    return {
      channel: "quartermaster",
      shipDeploymentId,
      bridgeCrewId: null,
      subagentId,
    }
  }

  if (asString(bridge.channel) === "bridge-agent") {
    return {
      channel: "bridge",
      shipDeploymentId,
      bridgeCrewId,
      subagentId,
    }
  }

  return {
    channel: "generic",
    shipDeploymentId,
    bridgeCrewId,
    subagentId,
  }
}

function parseToolchainProtocol(value: unknown): ToolchainProtocol | null {
  if (value === "mcp_sse" || value === "mcp_stdio" || value === "openai_compat" || value === "webhook") {
    return value
  }

  return null
}

function extractToolchainMetadata(metadata: unknown): {
  protocol: ToolchainProtocol
  endpoint: string | null
  authRef: string | null
  capabilities: Record<string, unknown>
} | null {
  const root = asRecord(metadata)
  const toolchain = asRecord(root.toolchain)
  const protocol = parseToolchainProtocol(toolchain.protocol)
  if (!protocol) {
    return null
  }

  return {
    protocol,
    endpoint: asString(toolchain.endpoint),
    authRef: asString(toolchain.authRef),
    capabilities: asRecord(toolchain.capabilities),
  }
}

export async function resolveToolchainDescriptors(args: {
  ownerUserId: string
  metadata?: Record<string, unknown>
}): Promise<ToolchainDescriptor[]> {
  if (!isToolchainProtocolRegistryEnabled()) {
    return []
  }

  const metadata = asRecord(args.metadata)
  const scope = resolveScope(metadata)
  const descriptors = new Map<string, ToolchainDescriptor>()

  const include = {
    toolCatalogEntry: true,
  } as const

  try {
    if (scope.subagentId) {
      const subagentBindings = await prisma.subagentToolBinding.findMany({
        where: {
          subagentId: scope.subagentId,
          enabled: true,
          toolCatalogEntry: {
            ownerUserId: args.ownerUserId,
            activationStatus: "approved",
          },
        },
        include,
      })

      for (const binding of subagentBindings) {
        const entry = binding.toolCatalogEntry
        const toolchain = extractToolchainMetadata(entry.metadata)
        if (!toolchain) {
          continue
        }

        descriptors.set(entry.id, {
          catalogEntryId: entry.id,
          slug: entry.slug,
          name: entry.name,
          description: entry.description,
          protocol: toolchain.protocol,
          endpoint: toolchain.endpoint,
          authRef: toolchain.authRef,
          capabilities: toolchain.capabilities,
          scope,
        })
      }
    }

    if (scope.shipDeploymentId) {
      const shipGrants = await prisma.shipToolGrant.findMany({
        where: {
          ownerUserId: args.ownerUserId,
          shipDeploymentId: scope.shipDeploymentId,
          ...(scope.bridgeCrewId
            ? {
                OR: [
                  {
                    scope: "ship",
                  },
                  {
                    scope: "bridge_crew",
                    bridgeCrewId: scope.bridgeCrewId,
                  },
                ],
              }
            : {}),
          catalogEntry: {
            activationStatus: "approved",
          },
        },
        include: {
          catalogEntry: true,
        },
      })

      for (const grant of shipGrants) {
        const entry = grant.catalogEntry
        const toolchain = extractToolchainMetadata(entry.metadata)
        if (!toolchain) {
          continue
        }

        descriptors.set(entry.id, {
          catalogEntryId: entry.id,
          slug: entry.slug,
          name: entry.name,
          description: entry.description,
          protocol: toolchain.protocol,
          endpoint: toolchain.endpoint,
          authRef: toolchain.authRef,
          capabilities: toolchain.capabilities,
          scope,
        })
      }
    }

    if (descriptors.size === 0) {
      const approvedTools = await prisma.toolCatalogEntry.findMany({
        where: {
          ownerUserId: args.ownerUserId,
          activationStatus: "approved",
          isInstalled: true,
        },
        orderBy: {
          name: "asc",
        },
      })

      for (const entry of approvedTools) {
        const toolchain = extractToolchainMetadata(entry.metadata)
        if (!toolchain) {
          continue
        }

        descriptors.set(entry.id, {
          catalogEntryId: entry.id,
          slug: entry.slug,
          name: entry.name,
          description: entry.description,
          protocol: toolchain.protocol,
          endpoint: toolchain.endpoint,
          authRef: toolchain.authRef,
          capabilities: toolchain.capabilities,
          scope,
        })
      }
    }
  } catch (error) {
    console.warn("Failed to resolve toolchain descriptors (fail-open):", error)
    return []
  }

  return [...descriptors.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function buildToolchainDescriptorInstructionBlock(descriptors: ToolchainDescriptor[]): string {
  if (descriptors.length === 0) {
    return ""
  }

  const lines: string[] = [
    "Toolchain Descriptors:",
    "Use only approved toolchains listed below. Respect protocol and endpoint requirements.",
  ]

  for (const descriptor of descriptors) {
    lines.push(
      `- ${descriptor.slug} (${descriptor.protocol})${descriptor.endpoint ? ` @ ${descriptor.endpoint}` : ""}`,
    )
  }

  return lines.join("\n")
}
