import test from "node:test"
import assert from "node:assert/strict"
import { runShipyardLocalLaunch } from "./shipyard-local-launch"
import type { InfrastructureConfig } from "./profile"

const infrastructure: InfrastructureConfig = {
  kind: "kind",
  kubeContext: "kind-orchwiz",
  namespace: "orchwiz-starship",
  terraformWorkspace: "starship-local",
  terraformEnvDir: "infra/terraform/environments/starship-local",
  ansibleInventory: "infra/ansible/inventory/local.ini",
  ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
}

test("maps successful local bootstrap to active adapter result", async () => {
  const result = await runShipyardLocalLaunch(
    {
      provisioningMode: "terraform_ansible",
      infrastructure,
      saneBootstrap: true,
    },
    {
      localBootstrapRunner: async () => ({
        ok: true,
        metadata: {
          provisioner: "ansible",
        },
      }),
    },
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.adapterResult.status, "active")
  assert.equal(result.adapterResult.healthStatus, "healthy")
  assert.equal(result.adapterResult.metadata?.mode, "shipyard_local")
  assert.equal(result.adapterResult.metadata?.provisioner, "ansible")
})

test("returns 422 for expected bootstrap failures", async () => {
  const result = await runShipyardLocalLaunch(
    {
      provisioningMode: "terraform_ansible",
      infrastructure,
      saneBootstrap: true,
    },
    {
      localBootstrapRunner: async () => ({
        ok: false,
        expected: true,
        code: "LOCAL_BOOTSTRAP_TOOLS_MISSING",
        error: "Missing required CLIs",
        details: {
          missingCommands: ["kind"],
        },
      }),
    },
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.httpStatus, 422)
  assert.equal(result.code, "LOCAL_BOOTSTRAP_TOOLS_MISSING")
  assert.deepEqual(result.details?.missingCommands, ["kind"])
})

test("returns 500 for unexpected bootstrap failures", async () => {
  const result = await runShipyardLocalLaunch(
    {
      provisioningMode: "terraform_ansible",
      infrastructure,
      saneBootstrap: true,
    },
    {
      localBootstrapRunner: async () => ({
        ok: false,
        expected: false,
        code: "LOCAL_PROVISIONING_FAILED",
        error: "Unexpected process crash",
      }),
    },
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.httpStatus, 500)
  assert.equal(result.code, "LOCAL_PROVISIONING_FAILED")
})

test("forwards OpenClaw context bundle to local bootstrap runner", async () => {
  let receivedDeploymentId: string | null = null

  const result = await runShipyardLocalLaunch(
    {
      provisioningMode: "terraform_ansible",
      infrastructure,
      saneBootstrap: true,
      openClawContextBundle: {
        schemaVersion: "orchwiz.openclaw.context.v1",
        source: "ship-yard-bootstrap",
        deploymentId: "ship-ctx-1",
        generatedAt: "2026-02-09T00:00:00.000Z",
        files: [{ path: "bridge-crew/xo-cb01/SOUL.md", content: "- mission first" }],
      },
    },
    {
      localBootstrapRunner: async (input) => {
        receivedDeploymentId = input.openClawContextBundle?.deploymentId || null
        return {
          ok: true,
          metadata: {
            provisioner: "ansible",
          },
        }
      },
    },
  )

  assert.equal(result.ok, true)
  assert.equal(receivedDeploymentId, "ship-ctx-1")
})
