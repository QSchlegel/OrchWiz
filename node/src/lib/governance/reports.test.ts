import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, mkdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeGovernanceSecurityReport } from "@/lib/governance/reports"

test("writeGovernanceSecurityReport writes markdown and json artifacts", async () => {
  const originalCwd = process.cwd()
  const sandbox = await mkdtemp(join(tmpdir(), "owz-governance-report-"))
  await mkdir(join(sandbox, "OWZ-Vault", "00-Inbox", "Security-Audits"), { recursive: true })
  process.chdir(sandbox)

  try {
    const report = await writeGovernanceSecurityReport({
      ownerUserId: "user-1",
      eventType: "ship_tool_grant_approved",
      rationale: "Need access for incident triage",
      actor: {
        userId: "user-1",
        actingBridgeCrewId: "crew-xo",
        actingBridgeCrewRole: "xo",
        actingBridgeCrewCallsign: "XO-CB01",
      },
      resource: {
        shipDeploymentId: "ship-1",
        toolCatalogEntryId: "tool-1",
      },
    })

    assert.ok(report.reportPathMd)
    assert.ok(report.reportPathJson)
    assert.equal(report.reportPathMd.includes("Access-Grants"), true)
    assert.equal(report.reportPathJson.includes("Access-Grants"), true)

    const markdown = await readFile(report.reportPathMd, "utf8")
    const jsonRaw = await readFile(report.reportPathJson, "utf8")
    const json = JSON.parse(jsonRaw) as Record<string, unknown>

    assert.equal(markdown.includes("Need access for incident triage"), true)
    assert.equal(markdown.includes("Chain decision"), true)
    assert.equal(json.chainDecision, "acting_xo_authority")
    assert.equal(json.ownerUserId, "user-1")
  } finally {
    process.chdir(originalCwd)
  }
})
