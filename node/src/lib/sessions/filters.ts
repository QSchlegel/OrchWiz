import type { Prisma } from "@prisma/client"

interface BuildSessionWhereInput {
  userId: string
  status?: string | null
  mode?: string | null
  source?: string | null
  bridgeChannel?: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {}
  return value as Record<string, unknown>
}

export function buildSessionWhereFilter({
  userId,
  status,
  mode,
  source,
  bridgeChannel,
}: BuildSessionWhereInput): Prisma.SessionWhereInput {
  const where: Prisma.SessionWhereInput = {
    userId,
  }

  if (status) {
    where.status = status as Prisma.EnumSessionStatusFilter | undefined
  }
  if (mode) {
    where.mode = mode as Prisma.EnumSessionModeFilter | undefined
  }
  if (source) {
    where.source = source as Prisma.EnumSessionSourceFilter | undefined
  }
  if (bridgeChannel === "agent") {
    where.metadata = {
      path: ["bridge", "channel"],
      equals: "bridge-agent",
    }
  }

  return where
}

export function hasBridgeAgentChannel(metadata: unknown): boolean {
  const record = asRecord(metadata)
  const bridge = asRecord(record.bridge)
  return bridge.channel === "bridge-agent"
}

