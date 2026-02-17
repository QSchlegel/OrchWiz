import assert from "node:assert/strict"
import test from "node:test"
import { handleGetLatestSecurityAuditCron } from "./route"

test("handleGetLatestSecurityAuditCron returns 404 when no cron verification run exists", async () => {
  const response = await handleGetLatestSecurityAuditCron({
    requireActor: async () => ({ userId: "user-1" }),
    findLatestCronVerificationRun: async () => null,
  })

  assert.equal(response.status, 404)
  const payload = (await response.json()) as Record<string, unknown>
  assert.equal(payload.error, "No automated security audit run found")
})

test("handleGetLatestSecurityAuditCron returns normalized cron payload for latest run", async () => {
  const response = await handleGetLatestSecurityAuditCron({
    requireActor: async () => ({ userId: "user-1" }),
    findLatestCronVerificationRun: async () => ({
      id: "run-1",
      completedAt: new Date("2026-02-13T00:00:00.000Z"),
      result: {
        securityAudit: {
          trigger: "cron",
          dayKey: "2026-02-13",
          reportId: "audit-123",
          createdAt: "2026-02-13T00:00:00.000Z",
          mode: "safe_sim",
          riskScore: { score: 21, level: "medium" },
          severityCounts: { critical: 0, high: 1, medium: 2, low: 0, info: 0 },
          riskDelta: 3,
          previousRiskScore: 18,
          reportPathMd: "/vault/audit-123.md",
          reportPathJson: "/vault/audit-123.json",
          checks: [],
          unusualReadings: [
            { code: "RISK_INCREASED", level: "warn", message: "Risk increased vs previous report (+3)." },
          ],
          quartermasterReview: {
            status: "ok",
            generatedAt: "2026-02-13T00:00:01.000Z",
            text: "All clear.\nNext Operator Action: Monitor.",
            provider: "auto",
            fallbackUsed: false,
            warnings: ["note"],
            vaultReviewPath: "/vault/review.md",
            quartermasterSessionId: "session-1",
            quartermasterInteractionId: "interaction-1",
          },
        },
      },
    }),
  })

  assert.equal(response.status, 200)
  const payload = (await response.json()) as any
  assert.equal(payload.verificationRunId, "run-1")
  assert.equal(payload.dayKey, "2026-02-13")
  assert.equal(payload.reportId, "audit-123")
  assert.equal(payload.riskScore.score, 21)
  assert.equal(payload.unusualReadings.length, 1)
  assert.equal(payload.unusualReadings[0].code, "RISK_INCREASED")
  assert.equal(payload.quartermasterReview.status, "ok")
  assert.equal(payload.quartermasterReview.text, "All clear.\nNext Operator Action: Monitor.")
  assert.equal(payload.quartermasterReview.fallbackUsed, false)
  assert.equal(payload.quartermasterReview.vaultReviewPath, "/vault/review.md")
})

