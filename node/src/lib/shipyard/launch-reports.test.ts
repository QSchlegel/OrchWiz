import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import test from "node:test"
import {
  createShipLaunchReportWriter,
  readShipLaunchLogs,
  resolveShipLaunchReportPaths,
} from "@/lib/shipyard/launch-reports"

function withTemporaryLaunchReportRoot(testFn: (root: string) => Promise<void>) {
  return async () => {
    const root = await mkdtemp(join(tmpdir(), "owz-ship-launch-report-"))
    const previous = process.env.SHIPYARD_LAUNCH_REPORT_ROOT
    process.env.SHIPYARD_LAUNCH_REPORT_ROOT = root

    try {
      await testFn(root)
    } finally {
      if (previous === undefined) {
        delete process.env.SHIPYARD_LAUNCH_REPORT_ROOT
      } else {
        process.env.SHIPYARD_LAUNCH_REPORT_ROOT = previous
      }
      await rm(root, { recursive: true, force: true })
    }
  }
}

test("launch report writer persists structured logs and final report", withTemporaryLaunchReportRoot(async () => {
  const ownerUserId = "user+alpha@example.com"
  const requestId = "request-123"
  const writer = createShipLaunchReportWriter({
    ownerUserId,
    requestId,
  })

  writer.append({
    timestamp: "2026-02-19T16:00:00.000Z",
    level: "info",
    source: "ship-yard",
    lines: ["Starting launch"],
  })
  writer.setDeploymentId("dep-42")
  writer.append({
    timestamp: "2026-02-19T16:00:01.000Z",
    level: "warn",
    source: "local-bootstrap",
    stream: "stderr",
    lines: ["slow network", "retrying npm ci"],
  })

  const report = await writer.finalize({
    status: "failed",
    errorCode: "LOCAL_BOOTSTRAP_FAILED",
    errorMessage: "npm ci failed",
  })

  assert.equal(report.requestId, requestId)
  assert.equal(report.deploymentId, "dep-42")
  assert.equal(report.status, "failed")
  assert.equal(report.lineCount, 3)
  assert.equal(report.levelCounts.info, 1)
  assert.equal(report.levelCounts.warn, 2)
  assert.equal(report.levelCounts.error, 0)
  assert.equal(report.error?.code, "LOCAL_BOOTSTRAP_FAILED")
  assert.equal(report.error?.message, "npm ci failed")

  const logs = await readShipLaunchLogs({
    ownerUserId,
    requestId,
    cursor: 0,
    limit: 10,
  })
  assert.ok(logs)
  assert.equal(logs?.entries.length, 3)
  assert.equal(logs?.entries[0]?.text, "Starting launch")
  assert.equal(logs?.entries[1]?.stream, "stderr")
  assert.equal(logs?.report?.status, "failed")

  const paths = resolveShipLaunchReportPaths({ ownerUserId, requestId })
  const plainLog = await readFile(paths.logPath, "utf8")
  const markdown = await readFile(paths.reportPathMd, "utf8")
  const json = await readFile(paths.reportPathJson, "utf8")

  assert.match(plainLog, /Starting launch/)
  assert.match(plainLog, /retrying npm ci/)
  assert.match(markdown, /Ship Launch Report/)
  assert.match(json, /"status": "failed"/)
}))

test("readShipLaunchLogs applies cursor and limit windowing", withTemporaryLaunchReportRoot(async () => {
  const ownerUserId = "user-beta"
  const requestId = "request-window"
  const writer = createShipLaunchReportWriter({
    ownerUserId,
    requestId,
  })

  writer.append({
    timestamp: "2026-02-19T16:10:00.000Z",
    level: "debug",
    source: "ship-yard",
    lines: ["l1", "l2", "l3", "l4", "l5"],
  })

  await writer.finalize({
    status: "succeeded",
  })

  const logs = await readShipLaunchLogs({
    ownerUserId,
    requestId,
    cursor: 2,
    limit: 2,
  })
  assert.ok(logs)
  assert.equal(logs?.entries.length, 2)
  assert.equal(logs?.entries[0]?.text, "l3")
  assert.equal(logs?.entries[1]?.text, "l4")
  assert.equal(logs?.nextCursor, 4)
  assert.equal(logs?.hasMore, true)
  assert.equal(logs?.totalLines, 5)
  assert.equal(logs?.report?.status, "succeeded")
}))
