import { resolve } from "node:path"
import { resolveRepositoryRoot } from "@/lib/security/paths"
import type { SecurityAuditCheckResult, SecurityAuditFinding } from "../types"
import { fileContains } from "./_utils"

const USER_SCOPED_EVENT_SOURCES = [
  "node/src/app/api/commands/[id]/execute/route.ts",
  "node/src/app/api/verification/route.ts",
  "node/src/app/api/tasks/route.ts",
  "node/src/app/api/sessions/route.ts",
]

export async function runRealtimeScopeAuditCheck(): Promise<SecurityAuditCheckResult> {
  const findings: SecurityAuditFinding[] = []
  const repoRoot = resolveRepositoryRoot()

  const streamRoute = resolve(repoRoot, "node/src/app/api/events/stream/route.ts")
  const streamEnforcesOwner = await fileContains(streamRoute, "event.userId !== actor.userId")
  if (!streamEnforcesOwner) {
    findings.push({
      id: "RT-STREAM-OWNER-FILTER",
      title: "SSE stream route may be missing owner filter",
      summary: "Could not detect user ownership guard in realtime stream route.",
      severity: "critical",
      threatIds: ["TM-03"],
      controlIds: ["CTRL-EVENT-SCOPING"],
      recommendation: "Filter all realtime events by authenticated user ownership before streaming.",
      evidence: ["node/src/app/api/events/stream/route.ts"],
    })
  }

  const eventBusFile = resolve(repoRoot, "node/src/lib/realtime/events.ts")
  const eventBusResolvesUser = await fileContains(eventBusFile, "resolveEventUserId")
  if (!eventBusResolvesUser) {
    findings.push({
      id: "RT-EVENT-USER-RESOLUTION",
      title: "Realtime event bus does not appear to resolve user scope",
      summary: "Event bus should attach a user scope for each private event.",
      severity: "high",
      threatIds: ["TM-03"],
      controlIds: ["CTRL-EVENT-SCOPING"],
      recommendation: "Attach a userId on event publication or derive from payload.userId.",
      evidence: ["node/src/lib/realtime/events.ts"],
    })
  }

  const missingUserTags: string[] = []
  for (const source of USER_SCOPED_EVENT_SOURCES) {
    const absolute = resolve(repoRoot, source)
    const hasUserIdTag = await fileContains(absolute, "userId:")
    if (!hasUserIdTag) {
      missingUserTags.push(source)
    }
  }

  if (missingUserTags.length > 0) {
    findings.push({
      id: "RT-USER-TAGS-MISSING",
      title: "One or more realtime event publishers do not include user scoping",
      summary: "Sensitive event publishers should include userId for stream filtering.",
      severity: "medium",
      threatIds: ["TM-03"],
      controlIds: ["CTRL-EVENT-SCOPING"],
      recommendation: "Add userId to publishRealtimeEvent calls in sensitive route handlers.",
      evidence: missingUserTags,
    })
  }

  return {
    id: "realtime-scope",
    name: "Realtime Event Ownership Scope",
    status: findings.some((finding) => finding.severity === "critical" || finding.severity === "high")
      ? "fail"
      : findings.length > 0
        ? "warn"
        : "pass",
    findings,
    metadata: {
      checkedPublishers: USER_SCOPED_EVENT_SOURCES.length,
    },
  }
}
