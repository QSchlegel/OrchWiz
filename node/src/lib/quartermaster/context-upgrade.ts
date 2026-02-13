import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { buildQuartermasterSubagentContent } from "@/lib/quartermaster/context-template"
import {
  QUARTERMASTER_CONTEXT_PATH,
  QUARTERMASTER_CONTEXT_TEMPLATE_VERSION,
} from "@/lib/quartermaster/constants"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseTemplateVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function upgradeQuartermasterSubagentContext(args: {
  userId: string
  subagentId: string
}): Promise<boolean> {
  const subagent = await prisma.subagent.findFirst({
    where: {
      id: args.subagentId,
      OR: [{ ownerUserId: args.userId }, { teamId: args.userId }, { isShared: true }],
    },
    select: {
      id: true,
      settings: true,
    },
  })

  if (!subagent) {
    return false
  }

  const rootSettings = asRecord(subagent.settings)
  const quartermasterSettings = asRecord(rootSettings.quartermaster)
  const existingVersion = parseTemplateVersion(quartermasterSettings.contextTemplateVersion)

  if (existingVersion !== null && existingVersion >= QUARTERMASTER_CONTEXT_TEMPLATE_VERSION) {
    return false
  }

  const content = buildQuartermasterSubagentContent()
  const nextSettings = toJson({
    ...rootSettings,
    quartermaster: {
      ...quartermasterSettings,
      contextTemplateVersion: QUARTERMASTER_CONTEXT_TEMPLATE_VERSION,
    },
  })

  await prisma.subagent.update({
    where: {
      id: subagent.id,
    },
    data: {
      content,
      path: QUARTERMASTER_CONTEXT_PATH,
      settings: nextSettings,
    },
  })

  return true
}

