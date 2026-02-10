import type { SecurityAuditCheckResult } from "../types"
import { runEnclavePostureAuditCheck } from "./enclave-posture"
import { runForwardingPostureAuditCheck } from "./forwarding-posture"
import { runOwnershipAuditCheck } from "./ownership"
import { runPolicyCoverageAuditCheck } from "./policy-coverage"
import { runPromptRiskAuditCheck } from "./prompt-risk"
import { runRealtimeScopeAuditCheck } from "./realtime-scope"
import { runSecretHandlingAuditCheck } from "./secret-handling"

export async function runSecurityAuditChecks(args: {
  userId: string
}): Promise<SecurityAuditCheckResult[]> {
  const results: SecurityAuditCheckResult[] = []

  results.push(await runOwnershipAuditCheck())
  results.push(await runSecretHandlingAuditCheck())
  results.push(await runForwardingPostureAuditCheck())
  results.push(await runRealtimeScopeAuditCheck())
  results.push(await runEnclavePostureAuditCheck())
  results.push(await runPolicyCoverageAuditCheck(args.userId))
  results.push(await runPromptRiskAuditCheck(args.userId))

  return results
}
