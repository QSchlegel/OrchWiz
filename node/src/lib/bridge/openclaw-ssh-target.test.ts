import assert from "node:assert/strict"
import test from "node:test"
import type { RuntimeUiTerraformResolution } from "@/lib/bridge/runtime-ui-hydration"
import {
  resolveOpenClawSshTarget,
  type OpenClawSshTargetResolverDeps,
} from "@/lib/bridge/openclaw-ssh-target"

function createDeps(overrides: Partial<OpenClawSshTargetResolverDeps> = {}): OpenClawSshTargetResolverDeps {
  return {
    listShips: async () => [
      {
        id: "ship-1",
        status: "active",
        deploymentProfile: "cloud_shipyard",
        config: {
          infrastructure: {
            namespace: "orchwiz-shipyard",
            terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
          },
          cloudProvider: {
            provider: "hetzner",
            sshKeyId: "key-1",
          },
        },
        metadata: {},
      },
    ],
    listDeploymentTunnels: async () => [
      {
        id: "tunnel-1",
        status: "running",
        sshHost: "203.0.113.10",
        sshPort: 22,
        sshUser: "root",
        sshKeyId: "key-1",
      },
    ],
    findSshKey: async () => ({
      id: "key-1",
      name: "shipyard-key",
      privateKeyEnvelope: { encrypted: true },
    }),
    resolvePrivateKey: async () => "PRIVATE_KEY",
    resolveTerraformRuntimeUi: async () => null,
    commandExists: () => true,
    env: {
      ORCHWIZ_BRIDGE_SSH_TTY_ENABLED: "true",
      ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      ORCHWIZ_REPO_ROOT: "/repo",
    } as unknown as NodeJS.ProcessEnv,
    cwd: () => "/repo/node",
    ...overrides,
  }
}

test("resolveOpenClawSshTarget resolves deployment tunnel strategy", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "xo",
      requestedShipDeploymentId: "ship-1",
    },
    createDeps(),
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.target.strategy, "deployment_tunnel")
  assert.equal(result.target.sshHost, "203.0.113.10")
  assert.match(result.target.commandPreview, /openclaw-xo/)
})

test("resolveOpenClawSshTarget resolves local ships via direct kubectl exec", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "med",
      requestedShipDeploymentId: "ship-local",
    },
    createDeps({
      listShips: async () => [
        {
          id: "ship-local",
          status: "active",
          deploymentProfile: "local_starship_build",
          config: {
            infrastructure: {
              namespace: "orchwiz-local",
              terraformEnvDir: "infra/terraform/environments/starship-local",
            },
          },
          metadata: {},
        },
      ],
      listDeploymentTunnels: async () => [],
      // Local strategy should not require ssh binary; only kubectl.
      commandExists: (command) => command === "kubectl",
    }),
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.target.strategy, "local_kubernetes_exec")
  assert.equal(result.target.sshHost, null)
  assert.match(result.target.commandPreview, /kubectl -n orchwiz-local exec -it deployment\/openclaw-med -- \/bin\/sh -lc/)
})

test("resolveOpenClawSshTarget falls back to metadata tunnel strategy", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "ops",
      requestedShipDeploymentId: "ship-1",
    },
    createDeps({
      listDeploymentTunnels: async () => [],
      listShips: async () => [
        {
          id: "ship-1",
          status: "active",
          deploymentProfile: "cloud_shipyard",
          config: {
            infrastructure: {
              namespace: "orchwiz-shipyard",
              terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
            },
            cloudProvider: {
              provider: "hetzner",
              sshKeyId: "key-meta",
            },
          },
          metadata: {
            tunnel: {
              controlPlanePublicIp: "198.51.100.22",
              sshPort: 2202,
              sshUser: "admin",
              sshKeyId: "key-meta",
            },
          },
        },
      ],
      findSshKey: async ({ keyId }) => ({
        id: keyId,
        name: "meta-key",
        privateKeyEnvelope: { encrypted: true },
      }),
    }),
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.target.strategy, "metadata_tunnel")
  assert.equal(result.target.sshHost, "198.51.100.22")
  assert.equal(result.target.sshPort, 2202)
  assert.equal(result.target.sshUser, "admin")
})

test("resolveOpenClawSshTarget falls back to terraform strategy", async () => {
  const terraformResolution: RuntimeUiTerraformResolution = {
    source: "terraform_output",
    runtimeUi: {
      openclaw: {
        urls: {
          xo: "http://localhost:3100/openclaw/xo",
        },
        source: "terraform_output",
      },
      kubeview: {
        url: "http://localhost:3100/kubeview",
        source: "terraform_output",
      },
      portForwardCommand: null,
    },
    observability: {
      monitoringNamespace: null,
      grafana: { enabled: null, url: null, source: "fallback" },
      prometheus: { enabled: null, url: null, source: "fallback" },
      loki: { enabled: null, source: "fallback" },
      clickhouse: { enabled: null, source: "fallback" },
      langfuse: { enabled: null, url: null, source: "fallback" },
    },
    runtimeEdge: {
      kubeContext: "kind-orchwiz",
      namespace: "orchwiz-shipyard",
      serviceName: "runtime-edge",
      port: 3100,
      portForwardCommand: null,
      controlPlanePublicIp: "192.0.2.33",
      controlPlanePrivateIp: "10.0.0.2",
    },
  }

  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "eng",
      requestedShipDeploymentId: "ship-1",
    },
    createDeps({
      env: {
        ORCHWIZ_BRIDGE_SSH_TTY_ENABLED: "false",
        ENABLE_LOCAL_COMMAND_EXECUTION: "true",
        ORCHWIZ_REPO_ROOT: "/repo",
      } as unknown as NodeJS.ProcessEnv,
      listDeploymentTunnels: async () => [],
      listShips: async () => [
        {
          id: "ship-1",
          status: "active",
          deploymentProfile: "cloud_shipyard",
          config: {
            infrastructure: {
              namespace: "orchwiz-shipyard",
              terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
            },
            cloudProvider: {
              provider: "hetzner",
              sshKeyId: "key-terraform",
            },
          },
          metadata: {},
        },
      ],
      findSshKey: async ({ keyId }) => ({
        id: keyId,
        name: "terraform-key",
        privateKeyEnvelope: { encrypted: true },
      }),
      resolveTerraformRuntimeUi: async () => terraformResolution,
    }),
  )

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.target.strategy, "terraform_fallback")
  assert.equal(result.target.sshHost, "192.0.2.33")
})

test("resolveOpenClawSshTarget returns disabled error when feature flags are off", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "xo",
    },
    createDeps({
      env: {
        ORCHWIZ_BRIDGE_SSH_TTY_ENABLED: "false",
        ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      } as unknown as NodeJS.ProcessEnv,
    }),
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "SSH_TTY_DISABLED")
})

test("resolveOpenClawSshTarget returns ship-not-found when no ships exist", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "xo",
    },
    createDeps({
      listShips: async () => [],
    }),
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "SHIP_NOT_FOUND")
})

test("resolveOpenClawSshTarget surfaces missing-key diagnostics", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "xo",
    },
    createDeps({
      listDeploymentTunnels: async () => [
        {
          id: "tunnel-1",
          status: "running",
          sshHost: "203.0.113.10",
          sshPort: 22,
          sshUser: "root",
          sshKeyId: null,
        },
      ],
      listShips: async () => [
        {
          id: "ship-1",
          status: "active",
          deploymentProfile: "cloud_shipyard",
          config: {
            infrastructure: {
              namespace: "orchwiz-shipyard",
              terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
            },
            cloudProvider: {
              provider: "hetzner",
              sshKeyId: null,
            },
          },
          metadata: {},
        },
      ],
      findSshKey: async () => null,
    }),
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "SSH_TARGET_UNRESOLVED")
  assert.match(result.detail, /SSH key/i)
})

test("resolveOpenClawSshTarget returns unresolved when no host can be found", async () => {
  const result = await resolveOpenClawSshTarget(
    {
      userId: "user-1",
      stationKey: "xo",
    },
    createDeps({
      listDeploymentTunnels: async () => [],
      listShips: async () => [
        {
          id: "ship-1",
          status: "active",
          deploymentProfile: "cloud_shipyard",
          config: {
            infrastructure: {
              namespace: "orchwiz-shipyard",
              terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
            },
            cloudProvider: {
              provider: "hetzner",
              sshKeyId: "key-1",
            },
          },
          metadata: {},
        },
      ],
      resolveTerraformRuntimeUi: async () => null,
      env: {
        ORCHWIZ_BRIDGE_SSH_TTY_ENABLED: "true",
        ENABLE_LOCAL_COMMAND_EXECUTION: "false",
      } as unknown as NodeJS.ProcessEnv,
    }),
  )

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.code, "SSH_TARGET_UNRESOLVED")
})
