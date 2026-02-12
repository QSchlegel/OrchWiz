import assert from "node:assert/strict"
import test from "node:test"
import {
  computeApplicationSummary,
  filterApplications,
  getApplicationActionCapability,
  resolveApplicationPatchUiUrl,
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
  {
    id: "app-4",
    name: "n8n Automations",
    status: "active",
    applicationType: "n8n",
    nodeType: "cloud",
    nodeId: "cloud-002",
    repository: null,
    ship: { name: "USS Workflows" },
    metadata: {},
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

  filters.applicationType = "n8n"
  const byN8NType = filterApplications(applications, filters)
  assert.deepEqual(byN8NType.map((app) => app.id), ["app-4"])

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
    total: 4,
    active: 2,
    failed: 1,
    showing: 2,
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

test("resolveApplicationPatchUiUrl prefers n8n editor/public environment urls", () => {
  const resolved = resolveApplicationPatchUiUrl({
    applicationType: "n8n",
    environment: {
      N8N_EDITOR_BASE_URL: "https://n8n.editor.example.com/",
      N8N_PUBLIC_BASE_URL: "https://n8n.public.example.com/",
    },
    nodeUrl: "https://node.example.com",
  })

  assert.equal(resolved, "https://n8n.editor.example.com/")
})

test("resolveApplicationPatchUiUrl falls back to nodeUrl for n8n when env url missing", () => {
  const resolved = resolveApplicationPatchUiUrl({
    applicationType: "n8n",
    environment: {},
    nodeUrl: "https://node.example.com",
  })

  assert.equal(resolved, "https://node.example.com/")
})

test("resolveApplicationPatchUiUrl ignores invalid n8n env url and falls back to nodeUrl", () => {
  const resolved = resolveApplicationPatchUiUrl({
    applicationType: "n8n",
    environment: {
      N8N_EDITOR_BASE_URL: "not-a-url",
      n8n_public_base_url: "still-not-a-url",
    },
    nodeUrl: "https://node.example.com/path",
  })

  assert.equal(resolved, "https://node.example.com/path")
})

test("resolveApplicationPatchUiUrl uses nodeUrl for non-n8n applications", () => {
  const resolved = resolveApplicationPatchUiUrl({
    applicationType: "docker",
    environment: {
      N8N_EDITOR_BASE_URL: "https://n8n.editor.example.com",
    },
    nodeUrl: "https://docker-node.example.com",
  })

  assert.equal(resolved, "https://docker-node.example.com/")
})

test("resolveApplicationPatchUiUrl returns null when no valid source exists", () => {
  const resolved = resolveApplicationPatchUiUrl({
    applicationType: "n8n",
    environment: {
      N8N_EDITOR_BASE_URL: "notaurl",
      n8n_public_base_url: "also-bad",
    },
    nodeUrl: "bad-url",
  })

  assert.equal(resolved, null)
})
