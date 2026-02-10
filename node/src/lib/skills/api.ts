import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  getSkillCatalogForUser,
  importCuratedSkillForUser,
  importGithubUrlSkillForUser,
  listSkillImportRunsForUser,
} from "@/lib/skills/catalog"
import type { SkillCatalogRefreshMode } from "@/lib/skills/types"
import { publishNotificationUpdated } from "@/lib/realtime/notifications"

export interface SkillApiResponse {
  status: number
  body: Record<string, unknown>
}

export interface SkillApiDependencies {
  requireActor: () => Promise<AccessActor>
  getSkillCatalogForUser: typeof getSkillCatalogForUser
  importCuratedSkillForUser: typeof importCuratedSkillForUser
  importGithubUrlSkillForUser: typeof importGithubUrlSkillForUser
  listSkillImportRunsForUser: typeof listSkillImportRunsForUser
  publishNotificationUpdated: typeof publishNotificationUpdated
}

const defaultDependencies: SkillApiDependencies = {
  requireActor: requireAccessActor,
  getSkillCatalogForUser,
  importCuratedSkillForUser,
  importGithubUrlSkillForUser,
  listSkillImportRunsForUser,
  publishNotificationUpdated,
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseRefreshMode(value: string | null | undefined): SkillCatalogRefreshMode {
  if (value === "force") {
    return "force"
  }

  if (value === "none") {
    return "none"
  }

  return "auto"
}

export function parseImportRunsLimit(value: string | null | undefined): number {
  const parsed = Number.parseInt(value || "20", 10)
  if (!Number.isFinite(parsed)) {
    return 20
  }

  return Math.max(1, Math.min(100, Math.trunc(parsed)))
}

export function isValidSkillSlug(value: string): boolean {
  return /^[a-z0-9._-]+$/i.test(value.trim())
}

export function isValidGithubSkillUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.hostname !== "github.com") {
      return false
    }

    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 5) {
      return false
    }

    if (parts[2] !== "tree" && parts[2] !== "blob") {
      return false
    }

    return true
  } catch {
    return false
  }
}

function handleSkillApiError(error: unknown): SkillApiResponse {
  if (error instanceof AccessControlError) {
    return {
      status: error.status,
      body: {
        error: error.message,
      },
    }
  }

  return {
    status: 500,
    body: {
      error: "Internal server error",
    },
  }
}

export async function handleGetSkillsCatalog(
  input: {
    refresh: string | null | undefined
  },
  deps: SkillApiDependencies = defaultDependencies,
): Promise<SkillApiResponse> {
  try {
    const actor = await deps.requireActor()
    const refreshMode = parseRefreshMode(input.refresh)
    const catalog = await deps.getSkillCatalogForUser({
      ownerUserId: actor.userId,
      refreshMode,
    })

    if (catalog.refresh.refreshed) {
      deps.publishNotificationUpdated({
        userId: actor.userId,
        channel: "skills",
        action: "increment",
      })
    }

    return {
      status: 200,
      body: catalog as unknown as Record<string, unknown>,
    }
  } catch (error) {
    return handleSkillApiError(error)
  }
}

export async function handleGetSkillImportRuns(
  input: {
    limit: string | null | undefined
  },
  deps: SkillApiDependencies = defaultDependencies,
): Promise<SkillApiResponse> {
  try {
    const actor = await deps.requireActor()
    const limit = parseImportRunsLimit(input.limit)
    const runs = await deps.listSkillImportRunsForUser({
      ownerUserId: actor.userId,
      limit,
    })

    return {
      status: 200,
      body: {
        runs,
      },
    }
  } catch (error) {
    return handleSkillApiError(error)
  }
}

export async function handlePostSkillImport(
  input: {
    body: unknown
  },
  deps: SkillApiDependencies = defaultDependencies,
): Promise<SkillApiResponse> {
  try {
    const actor = await deps.requireActor()
    const payload = (input.body && typeof input.body === "object") ? (input.body as Record<string, unknown>) : {}
    const mode = asNonEmptyString(payload.mode)
    const githubTokenOverride = asNonEmptyString(payload.githubTokenOverride)

    if (!mode) {
      return {
        status: 400,
        body: {
          error: "mode is required",
        },
      }
    }

    if (mode === "curated") {
      const skillSlug = asNonEmptyString(payload.skillSlug)
      if (!skillSlug || !isValidSkillSlug(skillSlug)) {
        return {
          status: 400,
          body: {
            error: "skillSlug is required and must contain only letters, numbers, dot, underscore, or dash.",
          },
        }
      }

      const outcome = await deps.importCuratedSkillForUser({
        ownerUserId: actor.userId,
        skillSlug,
        ...(githubTokenOverride
          ? {
              githubTokenOverride,
            }
          : {}),
      })

      if (outcome.run.status === "failed") {
        return {
          status: 502,
          body: {
            error: outcome.run.errorMessage || "Skill import failed.",
            run: outcome.run,
            entry: outcome.entry,
          },
        }
      }

      deps.publishNotificationUpdated({
        userId: actor.userId,
        channel: "skills",
        action: "increment",
        entityId: outcome.entry?.id,
      })

      return {
        status: 200,
        body: {
          run: outcome.run,
          entry: outcome.entry,
        },
      }
    }

    if (mode === "github_url") {
      const githubUrl = asNonEmptyString(payload.githubUrl)
      if (!githubUrl || !isValidGithubSkillUrl(githubUrl)) {
        return {
          status: 400,
          body: {
            error: "githubUrl must be a valid https://github.com/<owner>/<repo>/tree/<ref>/<path> or blob URL.",
          },
        }
      }

      const outcome = await deps.importGithubUrlSkillForUser({
        ownerUserId: actor.userId,
        githubUrl,
        ...(githubTokenOverride
          ? {
              githubTokenOverride,
            }
          : {}),
      })

      if (outcome.run.status === "failed") {
        return {
          status: 502,
          body: {
            error: outcome.run.errorMessage || "Skill import failed.",
            run: outcome.run,
            entry: outcome.entry,
          },
        }
      }

      deps.publishNotificationUpdated({
        userId: actor.userId,
        channel: "skills",
        action: "increment",
        entityId: outcome.entry?.id,
      })

      return {
        status: 200,
        body: {
          run: outcome.run,
          entry: outcome.entry,
        },
      }
    }

    return {
      status: 400,
      body: {
        error: "mode must be one of: curated, github_url",
      },
    }
  } catch (error) {
    return handleSkillApiError(error)
  }
}
