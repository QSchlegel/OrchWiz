import assert from "node:assert/strict"
import test from "node:test"
import {
  runShipyardCloudBootstrap,
  type ShipyardCloudBootstrapRuntime,
} from "@/lib/deployment/shipyard-cloud-bootstrap"
import type { CloudProviderConfig } from "@/lib/shipyard/cloud/types"
import type { InfrastructureConfig } from "@/lib/deployment/profile"

const infrastructure: InfrastructureConfig = {
  kind: "existing_k8s",
  kubeContext: "existing-cluster",
  namespace: "orchwiz-shipyard",
  terraformWorkspace: "shipyard-cloud",
  terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
  ansibleInventory: "infra/ansible/inventory/cloud.ini",
  ansiblePlaybook: "infra/ansible/playbooks/shipyard_cloud.yml",
}

const cloudProvider: CloudProviderConfig = {
  provider: "hetzner",
  cluster: {
    clusterName: "orchwiz",
    location: "nbg1",
    networkCidr: "10.42.0.0/16",
    image: "ubuntu-24.04",
    controlPlane: {
      machineType: "cx22",
      count: 1,
    },
    workers: {
      machineType: "cx32",
      count: 2,
    },
  },
  stackMode: "full_support_systems",
  k3s: {
    channel: "stable",
    disableTraefik: true,
  },
  tunnelPolicy: {
    manage: false,
    target: "kubernetes_api",
    localPort: 16443,
  },
  sshKeyId: "key-1",
}

function createRuntime(overrides: Partial<ShipyardCloudBootstrapRuntime> = {}): ShipyardCloudBootstrapRuntime {
  return {
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      CLOUD_INFRA_COMMAND_TIMEOUT_MS: "120000",
    } as NodeJS.ProcessEnv,
    cwd: "/repo/node",
    commandExists: () => true,
    fileExists: () => true,
    isDirectory: () => true,
    runCommand: async () => ({
      ok: true,
      stdout: "",
      stderr: "",
      exitCode: 0,
    }),
    ...overrides,
  }
}

test("cloud bootstrap fails when command execution is disabled", async () => {
  const runtime = createRuntime({
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "false",
    } as NodeJS.ProcessEnv,
  })

  const result = await runShipyardCloudBootstrap(
    {
      deploymentId: "deployment-1",
      provisioningMode: "terraform_ansible",
      infrastructure,
      cloudProvider,
      sshPrivateKey: "PRIVATE",
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CLOUD_PROVISIONING_BLOCKED")
})

test("cloud bootstrap fails when required commands are missing", async () => {
  const runtime = createRuntime({
    commandExists: (command) => command !== "autossh",
  })

  const result = await runShipyardCloudBootstrap(
    {
      deploymentId: "deployment-1",
      provisioningMode: "terraform_ansible",
      infrastructure,
      cloudProvider,
      sshPrivateKey: "PRIVATE",
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CLOUD_BOOTSTRAP_TOOLS_MISSING")
  assert.deepEqual(result.details?.missingCommands, ["autossh"])
})

test("cloud bootstrap fails when required files are missing", async () => {
  const runtime = createRuntime({
    fileExists: (path) => !path.endsWith("terraform.tfvars"),
  })

  const result = await runShipyardCloudBootstrap(
    {
      deploymentId: "deployment-1",
      provisioningMode: "terraform_ansible",
      infrastructure,
      cloudProvider,
      sshPrivateKey: "PRIVATE",
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "CLOUD_BOOTSTRAP_CONFIG_MISSING")
  assert.ok(result.details?.missingFiles?.some((file) => file.endsWith("terraform.tfvars")))
})
