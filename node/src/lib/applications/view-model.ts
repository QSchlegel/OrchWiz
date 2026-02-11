export type ApplicationStatus =
  | "pending"
  | "deploying"
  | "active"
  | "inactive"
  | "failed"
  | "updating"

export type ApplicationType = "docker" | "nodejs" | "python" | "static" | "custom"
export type ApplicationNodeType = "local" | "cloud" | "hybrid"

export interface ApplicationListItem {
  id: string
  name: string
  status: ApplicationStatus
  applicationType: ApplicationType
  nodeType: ApplicationNodeType
  nodeId: string
  repository: string | null
  ship: {
    name: string
  } | null
  metadata: unknown
}

export interface ApplicationViewFilters {
  query: string
  status: "all" | ApplicationStatus
  applicationType: "all" | ApplicationType
  nodeType: "all" | ApplicationNodeType
}

export interface ApplicationSummary {
  total: number
  active: number
  failed: number
  showing: number
}

export interface ApplicationActionCapability {
  isForwarded: boolean
  canMutate: boolean
  reason: string | null
  sourceNodeId: string | null
}

function normalizeSearchInput(input: string): string {
  return input.trim().toLowerCase()
}

function metadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null
  }

  return metadata as Record<string, unknown>
}

function isForwardedApplication(app: Pick<ApplicationListItem, "metadata">): boolean {
  const metadata = metadataRecord(app.metadata)
  return metadata?.isForwarded === true
}

export function filterApplications<T extends ApplicationListItem>(
  applications: T[],
  filters: ApplicationViewFilters,
): T[] {
  const query = normalizeSearchInput(filters.query)

  return applications.filter((application) => {
    if (filters.status !== "all" && application.status !== filters.status) {
      return false
    }

    if (filters.applicationType !== "all" && application.applicationType !== filters.applicationType) {
      return false
    }

    if (filters.nodeType !== "all" && application.nodeType !== filters.nodeType) {
      return false
    }

    if (!query) {
      return true
    }

    const searchable = [
      application.name,
      application.nodeId,
      application.ship?.name || "",
      application.repository || "",
    ]
      .join(" ")
      .toLowerCase()

    return searchable.includes(query)
  })
}

export function computeApplicationSummary<T extends Pick<ApplicationListItem, "status">>(
  applications: T[],
  filteredApplications: T[],
): ApplicationSummary {
  return {
    total: applications.length,
    active: applications.filter((application) => application.status === "active").length,
    failed: applications.filter((application) => application.status === "failed").length,
    showing: filteredApplications.length,
  }
}

export function resolveSelectedApplicationId<T extends Pick<ApplicationListItem, "id">>(
  applications: T[],
  currentSelectedId: string | null,
): string | null {
  if (applications.length === 0) {
    return null
  }

  if (currentSelectedId && applications.some((application) => application.id === currentSelectedId)) {
    return currentSelectedId
  }

  return applications[0].id
}

export function getApplicationActionCapability(
  application: Pick<ApplicationListItem, "metadata">,
): ApplicationActionCapability {
  const metadata = metadataRecord(application.metadata)
  const forwarded = isForwardedApplication(application)
  const sourceNodeId =
    metadata && typeof metadata.sourceNodeId === "string" ? metadata.sourceNodeId : null

  if (!forwarded) {
    return {
      isForwarded: false,
      canMutate: true,
      reason: null,
      sourceNodeId,
    }
  }

  return {
    isForwarded: true,
    canMutate: false,
    reason: sourceNodeId
      ? `Forwarded from node ${sourceNodeId}. Mutating actions are disabled.`
      : "Forwarded application. Mutating actions are disabled.",
    sourceNodeId,
  }
}
