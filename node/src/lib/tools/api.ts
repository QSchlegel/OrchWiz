import type { AccessActor } from "@/lib/security/access-control"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import { LOCAL_SCHEMA_SYNC_GUIDANCE, isPrismaSchemaUnavailableError } from "@/lib/prisma-errors"
import {
  getToolCatalogForUser,
  importCuratedToolForUser,
  importGithubUrlToolForUser,
  listToolImportRunsForUser,
} from "@/lib/tools/catalog"

export interface ToolApiResponse {
  status: number
  body: Record<string, unknown>
}

export interface ToolApiDependencies {
  requireActor: () => Promise<AccessActor>
  getToolCatalogForUser: typeof getToolCatalogForUser
  importCuratedToolForUser: typeof importCuratedToolForUser
  importGithubUrlToolForUser: typeof importGithubUrlToolForUser
  listToolImportRunsForUser: typeof listToolImportRunsForUser
}

const defaultDependencies: ToolApiDependencies = {
  requireActor: requireAccessActor,
  getToolCatalogForUser,
  importCuratedToolForUser,
  importGithubUrlToolForUser,
  listToolImportRunsForUser,
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseRefreshMode(value: string | null | undefined): "auto" | "force" | "none" {
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

export function isValidToolSlug(value: string): boolean {
  return /^[a-z0-9._-]+$/i.test(value.trim())
}

export function isValidGithubToolUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.hostname !== "github.com") {
      return false
    }

    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length < 2) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function handleToolApiError(error: unknown): ToolApiResponse {
  if (error instanceof AccessControlError) {
    return {
      status: error.status,
      body: {
        error: error.message,
      },
    }
  }

  if (isPrismaSchemaUnavailableError(error)) {
    return {
      status: 503,
      body: {
        error: LOCAL_SCHEMA_SYNC_GUIDANCE,
        code: "SCHEMA_UNAVAILABLE",
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

export async function handleGetToolsCatalog(
  input: {
    refresh: string | null | undefined
  },
  deps: ToolApiDependencies = defaultDependencies,
): Promise<ToolApiResponse> {
  try {
    const actor = await deps.requireActor()
    const refreshMode = parseRefreshMode(input.refresh)
    const catalog = await deps.getToolCatalogForUser({
      ownerUserId: actor.userId,
      refreshMode,
    })

    return {
      status: 200,
      body: catalog as unknown as Record<string, unknown>,
    }
  } catch (error) {
    return handleToolApiError(error)
  }
}

export async function handleGetToolImportRuns(
  input: {
    limit: string | null | undefined
  },
  deps: ToolApiDependencies = defaultDependencies,
): Promise<ToolApiResponse> {
  try {
    const actor = await deps.requireActor()
    const limit = parseImportRunsLimit(input.limit)
    const runs = await deps.listToolImportRunsForUser({
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
    return handleToolApiError(error)
  }
}

export async function handlePostToolImport(
  input: {
    body: unknown
  },
  deps: ToolApiDependencies = defaultDependencies,
): Promise<ToolApiResponse> {
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
      const toolSlug = asNonEmptyString(payload.toolSlug)
      if (!toolSlug || !isValidToolSlug(toolSlug)) {
        return {
          status: 400,
          body: {
            error: "toolSlug is required and must contain only letters, numbers, dot, underscore, or dash.",
          },
        }
      }

      let outcome
      try {
        outcome = await deps.importCuratedToolForUser({
          ownerUserId: actor.userId,
          toolSlug,
          ...(githubTokenOverride
            ? {
                githubTokenOverride,
              }
            : {}),
        })
      } catch (error) {
        return {
          status: 400,
          body: {
            error: error instanceof Error ? error.message : "Unable to import curated tool.",
          },
        }
      }

      if (outcome.run.status === "failed") {
        return {
          status: 502,
          body: {
            error: outcome.run.errorMessage || "Tool import failed.",
            run: outcome.run,
            entry: outcome.entry,
          },
        }
      }

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
      if (!githubUrl || !isValidGithubToolUrl(githubUrl)) {
        return {
          status: 400,
          body: {
            error: "githubUrl must be a valid https://github.com URL.",
          },
        }
      }

      let outcome
      try {
        outcome = await deps.importGithubUrlToolForUser({
          ownerUserId: actor.userId,
          githubUrl,
          ...(githubTokenOverride
            ? {
                githubTokenOverride,
              }
            : {}),
        })
      } catch (error) {
        return {
          status: 400,
          body: {
            error: error instanceof Error ? error.message : "Unable to import GitHub tool.",
          },
        }
      }

      if (outcome.run.status === "failed") {
        return {
          status: 502,
          body: {
            error: outcome.run.errorMessage || "Tool import failed.",
            run: outcome.run,
            entry: outcome.entry,
          },
        }
      }

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
    return handleToolApiError(error)
  }
}
