import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_DEPLOYMENT_TYPE,
  DEFAULT_DEPLOYMENT_PROFILE,
  DEFAULT_PROVISIONING_MODE,
  defaultInfrastructureConfig,
  deriveNodeTypeFromProfile,
  normalizeDeploymentProfileInput,
  parseDeploymentType,
} from "./profile"

test("parseDeploymentType accepts valid values and defaults to agent", () => {
  assert.equal(parseDeploymentType("ship"), "ship")
  assert.equal(parseDeploymentType("agent"), "agent")
  assert.equal(parseDeploymentType("invalid"), DEFAULT_DEPLOYMENT_TYPE)
})

test("normalizeDeploymentProfileInput falls back to Starship defaults", () => {
  const normalized = normalizeDeploymentProfileInput({})

  assert.equal(normalized.deploymentProfile, DEFAULT_DEPLOYMENT_PROFILE)
  assert.equal(normalized.provisioningMode, DEFAULT_PROVISIONING_MODE)
  assert.equal(normalized.nodeType, "local")
  assert.equal(normalized.infrastructure.kind, "kind")
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

test("cloud profile defaults infrastructure kind to existing_k8s", () => {
  const normalized = normalizeDeploymentProfileInput({
    deploymentProfile: "cloud_shipyard",
  })

  assert.equal(normalized.infrastructure.kind, "existing_k8s")
  assert.equal(normalized.infrastructure.kubeContext, "existing-cluster")
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
  assert.equal(normalized.infrastructure.kind, "existing_k8s")
  assert.equal(normalized.infrastructure.ansiblePlaybook, "infra/ansible/playbooks/shipyard_cloud.yml")
})

test("infrastructure kind infers minikube when kind is missing and context matches", () => {
  const normalized = normalizeDeploymentProfileInput({
    deploymentProfile: "local_starship_build",
    config: {
      infrastructure: {
        kubeContext: "minikube",
      },
    },
  })

  assert.equal(normalized.infrastructure.kind, "minikube")
})

test("invalid infrastructure kind falls back to profile default", () => {
  const normalized = normalizeDeploymentProfileInput({
    deploymentProfile: "local_starship_build",
    config: {
      infrastructure: {
        kind: "bad-kind",
      },
    },
  })

  assert.equal(normalized.infrastructure.kind, "kind")
})
