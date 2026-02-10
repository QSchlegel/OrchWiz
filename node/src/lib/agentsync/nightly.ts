import { prisma } from "@/lib/prisma"
import { defaultAgentSyncNightlyHour } from "./constants"
import { runAgentSyncForUser } from "./run"

interface LocalTimeParts {
  dateKey: string
  hour: number
}

interface NightlyResolution {
  userId: string
  timezone: string
  nightlyHour: number
  due: boolean
}

export interface AgentSyncNightlySummary {
  checkedUsers: number
  dueUsers: number
  succeededUsers: number
  failedUsers: number
  executedAt: string
}

function localTimeParts(date: Date, timezone: string): LocalTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((entry) => entry.type === "year")?.value || "1970"
  const month = parts.find((entry) => entry.type === "month")?.value || "01"
  const day = parts.find((entry) => entry.type === "day")?.value || "01"
  const hour = Number.parseInt(parts.find((entry) => entry.type === "hour")?.value || "0", 10)

  return {
    dateKey: `${year}-${month}-${day}`,
    hour: Number.isFinite(hour) ? hour : 0,
  }
}

function safeTimezone(value: string | null | undefined): string {
  const timezone = value?.trim() || "UTC"
  try {
    localTimeParts(new Date(), timezone)
    return timezone
  } catch {
    return "UTC"
  }
}

export function isDueNightly(args: {
  now: Date
  timezone: string
  nightlyHour: number
  lastNightlyRunAt?: Date | null
}): boolean {
  const nowLocal = localTimeParts(args.now, args.timezone)
  if (nowLocal.hour !== args.nightlyHour) {
    return false
  }

  if (!args.lastNightlyRunAt) {
    return true
  }

  const lastRunLocal = localTimeParts(args.lastNightlyRunAt, args.timezone)
  return lastRunLocal.dateKey !== nowLocal.dateKey
}

export function resolveNightlyState(args: {
  userId: string
  timezone: string | null | undefined
  nightlyEnabled: boolean | null | undefined
  nightlyHour: number | null | undefined
  lastNightlyRunAt?: Date | null
  now: Date
}): NightlyResolution {
  const timezone = safeTimezone(args.timezone)
  const nightlyEnabled = args.nightlyEnabled !== false
  const nightlyHour = Number.isFinite(args.nightlyHour)
    ? Math.max(0, Math.min(23, Number(args.nightlyHour)))
    : defaultAgentSyncNightlyHour()

  return {
    userId: args.userId,
    timezone,
    nightlyHour,
    due: nightlyEnabled && isDueNightly({
      now: args.now,
      timezone,
      nightlyHour,
      lastNightlyRunAt: args.lastNightlyRunAt,
    }),
  }
}

export async function runDueNightlyAgentSync(now = new Date()): Promise<AgentSyncNightlySummary> {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      agentSyncPreference: {
        select: {
          timezone: true,
          nightlyEnabled: true,
          nightlyHour: true,
          lastNightlyRunAt: true,
        },
      },
    },
  })

  const resolutions = users.map((user) =>
    resolveNightlyState({
      userId: user.id,
      timezone: user.agentSyncPreference?.timezone,
      nightlyEnabled: user.agentSyncPreference?.nightlyEnabled,
      nightlyHour: user.agentSyncPreference?.nightlyHour,
      lastNightlyRunAt: user.agentSyncPreference?.lastNightlyRunAt,
      now,
    }),
  )

  const dueUsers = resolutions.filter((entry) => entry.due)

  let succeededUsers = 0
  let failedUsers = 0

  for (const due of dueUsers) {
    try {
      await runAgentSyncForUser({
        userId: due.userId,
        trigger: "nightly",
        scope: "bridge_crew",
        metadata: {
          timezone: due.timezone,
          nightlyHour: due.nightlyHour,
          triggeredAt: now.toISOString(),
        },
      })

      succeededUsers += 1
    } catch (error) {
      failedUsers += 1
      console.error("AgentSync nightly run failed:", {
        userId: due.userId,
        error: error instanceof Error ? error.message : "Unknown AgentSync nightly error",
      })
    }

    await prisma.agentSyncPreference.upsert({
      where: {
        userId: due.userId,
      },
      create: {
        userId: due.userId,
        timezone: due.timezone,
        nightlyEnabled: true,
        nightlyHour: due.nightlyHour,
        lastNightlyRunAt: now,
      },
      update: {
        timezone: due.timezone,
        nightlyHour: due.nightlyHour,
        lastNightlyRunAt: now,
      },
    })
  }

  return {
    checkedUsers: users.length,
    dueUsers: dueUsers.length,
    succeededUsers,
    failedUsers,
    executedAt: now.toISOString(),
  }
}
