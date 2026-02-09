import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_DEPLOYMENT_PROFILE,
  DEFAULT_PROVISIONING_MODE,
  defaultInfrastructureConfig,
  deriveNodeTypeFromProfile,
  normalizeDeploymentProfileInput,
} from "./profile"

test("normalizeDeploymentProfileInput falls back to Starship defaults", () => {
  const normalized = normalizeDeploymentProfileInput({})

  assert.equal(normalized.deploymentProfile, DEFAULT_DEPLOYMENT_PROFILE)
  assert.equal(normalized.provisioningMode, DEFAULT_PROVISIONING_MODE)
  assert.equal(normalized.nodeType, "local")
  assert.deepEqual(normalized.infrastructure, defaultInfrastructureConfig("local_starship_build"))
})

test("shipyard profile derives cloud node type by default", () => {
  const normalized = normalizeDeploymentProfileInput({
    deploymentProfile: "cloud_shipyard",
    nodeType: "hybrid",
    advancedNodeTypeOverride: false,
  })

  assert.equal(normalized.deploymentProfile, "cloud_shipyard")
  assert.equal(normalized.nodeType, "cloud")
})

test("shipyard allows hybrid only when advanced override is enabled", () => {
  const nodeType = deriveNodeTypeFromProfile("cloud_shipyard", "hybrid", true)
  assert.equal(nodeType, "hybrid")
})

test("infrastructure config merges defaults and provided values", () => {
  const normalized = normalizeDeploymentProfileInput({
    deploymentProfile: "cloud_shipyard",
    config: {
      infrastructure: {
        namespace: "custom-shipyard",
        kubeContext: "prod-cluster",
      },
    },
  })

  assert.equal(normalized.infrastructure.namespace, "custom-shipyard")
  assert.equal(normalized.infrastructure.kubeContext, "prod-cluster")
  assert.equal(normalized.infrastructure.ansiblePlaybook, "infra/ansible/playbooks/shipyard_cloud.yml")
})
