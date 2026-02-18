import { prisma } from "@/lib/prisma"
import {
  normalizeLangfuseCloudMonitoringSettings,
  type LangfuseCloudMonitoringSettings,
} from "@/lib/shipyard/monitoring"

export interface UserLangfuseCloudSettings extends LangfuseCloudMonitoringSettings {}

export function normalizeUserLangfuseCloudSettings(rawValue: unknown): UserLangfuseCloudSettings {
  return normalizeLangfuseCloudMonitoringSettings(rawValue)
}

function assertUserSettingModelAvailable(): void {
  const userSetting = (prisma as unknown as { userSetting?: unknown }).userSetting
  if (!userSetting) {
    throw new Error(
      "Prisma client is missing the UserSetting model. Run `npm run db:generate` and restart the server.",
    )
  }
}

export async function readUserLangfuseCloudSettings(userId: string): Promise<UserLangfuseCloudSettings> {
  assertUserSettingModelAvailable()
  const setting = await prisma.userSetting.findUnique({
    where: {
      userId,
    },
    select: {
      langfuseCloudUrl: true,
      langfuseCloudProject: true,
      langfuseCloudPublicKey: true,
      langfuseCloudSecretKey: true,
    },
  })

  return normalizeUserLangfuseCloudSettings(setting || {})
}

export async function writeUserLangfuseCloudSettings(
  args: {
    userId: string
    settings: unknown
  },
): Promise<UserLangfuseCloudSettings> {
  assertUserSettingModelAvailable()
  const normalized = normalizeUserLangfuseCloudSettings(args.settings)

  const saved = await prisma.userSetting.upsert({
    where: {
      userId: args.userId,
    },
    create: {
      userId: args.userId,
      langfuseCloudUrl: normalized.langfuseCloudUrl,
      langfuseCloudProject: normalized.langfuseCloudProject,
      langfuseCloudPublicKey: normalized.langfuseCloudPublicKey,
      langfuseCloudSecretKey: normalized.langfuseCloudSecretKey,
    },
    update: {
      langfuseCloudUrl: normalized.langfuseCloudUrl,
      langfuseCloudProject: normalized.langfuseCloudProject,
      langfuseCloudPublicKey: normalized.langfuseCloudPublicKey,
      langfuseCloudSecretKey: normalized.langfuseCloudSecretKey,
    },
  })

  return normalizeUserLangfuseCloudSettings(saved)
}
