import { NextRequest, NextResponse } from "next/server"
import { parseBearerToken, asRecord } from "@/lib/agentsync/route-helpers"
import { runDueNightlySecurityAudits } from "@/lib/security/audit/nightly"

export const dynamic = "force-dynamic"

export interface SecurityAuditNightlyRouteDeps {
  expectedToken: () => string | null
  now: () => Date
  runDueAudits: (args: {
    now: Date
    includeQuartermasterReview: boolean
    dryRun: boolean
    force: boolean
  }) => Promise<unknown>
}

const defaultDeps: SecurityAuditNightlyRouteDeps = {
  expectedToken: () => process.env.SECURITY_AUDIT_CRON_TOKEN?.trim() || null,
  now: () => new Date(),
  runDueAudits: (args) => runDueNightlySecurityAudits({
    now: args.now,
    includeQuartermasterReview: args.includeQuartermasterReview,
    dryRun: args.dryRun,
    force: args.force,
  }),
}

export async function handlePostNightly(
  request: NextRequest,
  deps: SecurityAuditNightlyRouteDeps = defaultDeps,
) {
  try {
    const expectedToken = deps.expectedToken()
    if (!expectedToken) {
      return NextResponse.json({ error: "SECURITY_AUDIT_CRON_TOKEN is not configured" }, { status: 503 })
    }

    const suppliedToken = parseBearerToken(request.headers.get("authorization"))
    if (!suppliedToken || suppliedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = asRecord(await request.json().catch(() => ({})))
    const includeQuartermasterReview = body.includeQuartermasterReview !== false
    const dryRun = body.dryRun === true
    const force = body.force === true

    const payload = await deps.runDueAudits({
      now: deps.now(),
      includeQuartermasterReview,
      dryRun,
      force,
    })

    return NextResponse.json(payload)
  } catch (error) {
    console.error("Error running nightly security audit:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostNightly(request)
}
