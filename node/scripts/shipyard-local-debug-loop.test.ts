import assert from "node:assert/strict"
import test from "node:test"
import { parseArgs } from "./shipyard-local-debug-loop"

test("parseArgs enables post-run teardown by default", () => {
  const args = parseArgs([])
  assert.equal(args.keepCluster, false)
})

test("parseArgs supports --keep-cluster flag", () => {
  const args = parseArgs(["--keep-cluster"])
  assert.equal(args.keepCluster, true)
})

test("parseArgs parses --keep-cluster with other flags", () => {
  const args = parseArgs([
    "--base-url=http://localhost:3000/",
    "--poll-ms=5000",
    "--timeout-ms=600000",
    "--node-id=node-a",
    "--name-prefix=debug-a",
    "--keep-cluster",
    "--verbose",
  ])
  assert.equal(args.keepCluster, true)
  assert.equal(args.verbose, true)
  assert.equal(args.baseUrl, "http://localhost:3000")
  assert.equal(args.pollMs, 5000)
  assert.equal(args.timeoutMs, 600000)
  assert.equal(args.nodeId, "node-a")
  assert.equal(args.namePrefix, "debug-a")
})
