import test from "node:test"
import assert from "node:assert/strict"
import { cleanupFailedLocalLaunch } from "./infra-teardown"

const localStarshipConfig = {
  infrastructure: {
    kind: "kind" as const,
    kubeContext: "kind-orchwiz",
    namespace: "orchwiz-starship",
    terraformWorkspace: "starship-local",
    terraformEnvDir: "infra/terraform/environments/starship-local",
    ansibleInventory: "infra/ansible/inventory/local.ini",
    ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
  },
}

test("cleanupFailedLocalLaunch returns without throwing when ENABLE_LOCAL_COMMAND_EXECUTION is not true", async () => {
  const orig = process.env.ENABLE_LOCAL_COMMAND_EXECUTION
  try {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = "false"
    await cleanupFailedLocalLaunch({
      deploymentId: "deploy-1",
      userId: "user-1",
      deploymentProfile: "local_starship_build",
      config: localStarshipConfig,
      metadata: { localAppImage: { kindClusterAutoCreated: true } },
    })
    // Should exit early and not run terraform/kind
  } finally {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = orig
  }
})

test("cleanupFailedLocalLaunch returns without throwing when deploymentProfile is not local_starship_build", async () => {
  const orig = process.env.ENABLE_LOCAL_COMMAND_EXECUTION
  try {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = "true"
    await cleanupFailedLocalLaunch({
      deploymentId: "deploy-1",
      userId: "user-1",
      deploymentProfile: "cloud_shipyard",
      config: {},
      metadata: { localAppImage: { kindClusterAutoCreated: true } },
    })
  } finally {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = orig
  }
})

test("cleanupFailedLocalLaunch accepts LOCAL_PROVISIONING_FAILED-style metadata with kindClusterAutoCreated", async () => {
  const orig = process.env.ENABLE_LOCAL_COMMAND_EXECUTION
  try {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = "false"
    await cleanupFailedLocalLaunch({
      deploymentId: "deploy-failed",
      userId: "user-1",
      deploymentProfile: "local_starship_build",
      config: localStarshipConfig,
      metadata: {
        localAppImage: {
          kindClusterAutoCreated: true,
          imageTag: "orchwiz:local-dev",
          clusterName: "orchwiz",
        },
      },
    })
    // Early exit due to ENABLE_LOCAL_COMMAND_EXECUTION=false; no throw
  } finally {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = orig
  }
})

test("cleanupFailedLocalLaunch accepts metadata without kindClusterAutoCreated", async () => {
  const orig = process.env.ENABLE_LOCAL_COMMAND_EXECUTION
  try {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = "false"
    await cleanupFailedLocalLaunch({
      deploymentId: "deploy-1",
      userId: "user-1",
      deploymentProfile: "local_starship_build",
      config: localStarshipConfig,
      metadata: {},
    })
  } finally {
    process.env.ENABLE_LOCAL_COMMAND_EXECUTION = orig
  }
})
