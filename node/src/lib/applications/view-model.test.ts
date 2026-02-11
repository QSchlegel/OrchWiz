import assert from "node:assert/strict"
import test from "node:test"
import {
  computeApplicationSummary,
  filterApplications,
  getApplicationActionCapability,
  resolveSelectedApplicationId,
  type ApplicationListItem,
  type ApplicationViewFilters,
} from "./view-model"

function baseFilters(): ApplicationViewFilters {
  return {
    query: "",
    status: "all",
    applicationType: "all",
    nodeType: "all",
  }
}

const applications: ApplicationListItem[] = [
  {
    id: "app-1",
    name: "Telemetry API",
    status: "active",
    applicationType: "nodejs",
    nodeType: "cloud",
    nodeId: "cloud-001",
    repository: "https://github.com/example/telemetry-api",
    ship: { name: "USS Nova" },
    metadata: {},
  },
  {
    id: "app-2",
    name: "Renderer",
    status: "failed",
    applicationType: "docker",
    nodeType: "local",
    nodeId: "local-009",
    repository: null,
    ship: { name: "USS Atlas" },
    metadata: {},
  },
  {
    id: "app-3",
    name: "Proxy",
    status: "inactive",
    applicationType: "python",
    nodeType: "hybrid",
    nodeId: "hybrid-120",
    repository: "https://github.com/example/proxy",
    ship: null,
    metadata: {
      isForwarded: true,
      sourceNodeId: "node-forward-01",
    },
  },
]

test("filterApplications supports query + status + type + nodeType filters", () => {
  const filters = baseFilters()
  filters.query = "nova"
  const byQuery = filterApplications(applications, filters)
  assert.deepEqual(byQuery.map((app) => app.id), ["app-1"])

  filters.query = ""
  filters.status = "failed"
  const byStatus = filterApplications(applications, filters)
  assert.deepEqual(byStatus.map((app) => app.id), ["app-2"])

  filters.status = "all"
  filters.applicationType = "python"
  const byType = filterApplications(applications, filters)
  assert.deepEqual(byType.map((app) => app.id), ["app-3"])

  filters.applicationType = "all"
  filters.nodeType = "local"
  const byNodeType = filterApplications(applications, filters)
  assert.deepEqual(byNodeType.map((app) => app.id), ["app-2"])
})

test("computeApplicationSummary returns total, active, failed, and showing counts", () => {
  const filters = baseFilters()
  filters.nodeType = "cloud"
  const filtered = filterApplications(applications, filters)
  const summary = computeApplicationSummary(applications, filtered)

  assert.deepEqual(summary, {
    total: 3,
    active: 1,
    failed: 1,
    showing: 1,
  })
})

test("resolveSelectedApplicationId keeps valid selection and falls back to first result", () => {
  const selected = resolveSelectedApplicationId(applications, "app-2")
  assert.equal(selected, "app-2")

  const fallback = resolveSelectedApplicationId(applications, "missing")
  assert.equal(fallback, "app-1")

  const empty = resolveSelectedApplicationId([], "app-1")
  assert.equal(empty, null)
})

test("getApplicationActionCapability disables mutating actions for forwarded apps", () => {
  const localCapability = getApplicationActionCapability(applications[0])
  assert.equal(localCapability.canMutate, true)
  assert.equal(localCapability.isForwarded, false)
  assert.equal(localCapability.reason, null)

  const forwardedCapability = getApplicationActionCapability(applications[2])
  assert.equal(forwardedCapability.canMutate, false)
  assert.equal(forwardedCapability.isForwarded, true)
  assert.equal(forwardedCapability.sourceNodeId, "node-forward-01")
  assert.ok(forwardedCapability.reason?.includes("Mutating actions are disabled"))
})
