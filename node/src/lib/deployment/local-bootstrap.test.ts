import test from "node:test"
import assert from "node:assert/strict"
import {
  runLocalBootstrap,
  requiredCommandsForInfrastructureKind,
  type LocalBootstrapCommandResult,
  type LocalBootstrapRuntime,
} from "./local-bootstrap"
import type { InfrastructureConfig } from "./profile"

interface RuntimeCall {
  command: string
  args: string[]
  env?: NodeJS.ProcessEnv
  cwd?: string
  timeoutMs?: number
}

interface RuntimeOptions {
  platform?: NodeJS.Platform
  env?: Record<string, string | undefined>
  installedCommands?: string[]
  existingFiles?: string[]
  existingDirectories?: string[]
  getUid?: () => number
  runCommand?: (
    command: string,
    args: string[],
    call: RuntimeCall,
  ) => Promise<LocalBootstrapCommandResult>
}

const baseInfrastructure: InfrastructureConfig = {
  kind: "kind",
  kubeContext: "kind-orchwiz",
  namespace: "orchwiz-starship",
  terraformWorkspace: "starship-local",
  terraformEnvDir: "infra/terraform/environments/starship-local",
  ansibleInventory: "infra/ansible/inventory/local.ini",
  ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
}

function createRuntime(options: RuntimeOptions = {}): {
  runtime: LocalBootstrapRuntime
  calls: RuntimeCall[]
} {
  const calls: RuntimeCall[] = []
  const installedCommands = new Set(
    options.installedCommands || ["terraform", "kubectl", "ansible-playbook", "kind", "docker"],
  )
  const existingFiles = new Set(
    options.existingFiles || [
      "/repo/infra/terraform/environments/starship-local/terraform.tfvars",
      "/repo/infra/ansible/inventory/local.ini",
      "/repo/infra/ansible/playbooks/starship_local.yml",
      "/repo/node/Dockerfile.shipyard",
    ],
  )
  const existingDirectories = new Set(
    options.existingDirectories || ["/repo/infra/terraform/environments/starship-local", "/repo/node"],
  )

  const runtime: LocalBootstrapRuntime = {
    platform: options.platform || "darwin",
    env: {
      NODE_ENV: "test",
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      LOCAL_INFRA_COMMAND_TIMEOUT_MS: "120000",
      ...(options.env || {}),
    } as NodeJS.ProcessEnv,
    cwd: "/repo/node",
    getUid: options.getUid,
    fileExists: (path) => existingFiles.has(path),
    isDirectory: (path) => existingDirectories.has(path),
    commandExists: (command) => installedCommands.has(command),
    runCommand: async (command, args, commandOptions = {}) => {
      const call: RuntimeCall = {
        command,
        args,
        env: commandOptions.env,
        cwd: commandOptions.cwd,
        timeoutMs: commandOptions.timeoutMs,
      }
      calls.push(call)

      if (options.runCommand) {
        return options.runCommand(command, args, call)
      }

      if (command === "kubectl" && args.join(" ") === "config get-contexts -o name") {
        return {
          ok: true,
          stdout: "kind-orchwiz\n",
          stderr: "",
          exitCode: 0,
        }
      }

      if (command === "ansible-playbook") {
        return {
          ok: true,
          stdout: "PLAY RECAP",
          stderr: "",
          exitCode: 0,
        }
      }

      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  }

  return { runtime, calls }
}

test("required commands include base CLIs and selected infrastructure tool", () => {
  assert.deepEqual(requiredCommandsForInfrastructureKind("kind"), [
    "terraform",
    "kubectl",
    "ansible-playbook",
    "kind",
  ])
  assert.deepEqual(requiredCommandsForInfrastructureKind("minikube"), [
    "terraform",
    "kubectl",
    "ansible-playbook",
    "minikube",
  ])
})

test("rejects unsafe infrastructure paths", async () => {
  const { runtime } = createRuntime()
  const result = await runLocalBootstrap(
    {
      infrastructure: {
        ...baseInfrastructure,
        terraformEnvDir: "../escape",
      },
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_CONFIG_MISSING")
})

test("returns config missing errors with suggested copy commands", async () => {
  const { runtime } = createRuntime({
    existingFiles: [
      "/repo/infra/terraform/environments/starship-local/terraform.tfvars.example",
      "/repo/infra/ansible/inventory/local.ini.example",
      "/repo/infra/ansible/playbooks/starship_local.yml",
    ],
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_CONFIG_MISSING")
  assert.deepEqual(result.details?.missingFiles, [
    "infra/terraform/environments/starship-local/terraform.tfvars",
    "infra/ansible/inventory/local.ini",
  ])
  assert.deepEqual(result.details?.suggestedCommands, [
    "cp infra/terraform/environments/starship-local/terraform.tfvars.example infra/terraform/environments/starship-local/terraform.tfvars",
    "cp infra/ansible/inventory/local.ini.example infra/ansible/inventory/local.ini",
  ])
})

test("sane bootstrap disabled does not attempt install", async () => {
  const { runtime, calls } = createRuntime({
    installedCommands: ["terraform", "kubectl", "ansible-playbook"],
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_TOOLS_MISSING")
  assert.equal(calls.length, 0)
})

test("sane bootstrap respects auto-install env gate", async () => {
  const { runtime } = createRuntime({
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      ENABLE_LOCAL_INFRA_AUTO_INSTALL: "false",
    },
    installedCommands: ["terraform", "kubectl", "ansible-playbook"],
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: true,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_INSTALL_DISABLED")
  assert.deepEqual(result.details?.missingCommands, ["kind"])
})

test("linux install path enforces non-interactive sudo", async () => {
  const { runtime } = createRuntime({
    platform: "linux",
    env: {
      ENABLE_LOCAL_INFRA_AUTO_INSTALL: "true",
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
    },
    installedCommands: ["terraform", "kubectl", "ansible-playbook", "sudo", "apt-get"],
    getUid: () => 1000,
    runCommand: async (command, args) => {
      if (command === "sudo" && args.join(" ") === "-n true") {
        return {
          ok: false,
          stdout: "",
          stderr: "sudo: a password is required",
          exitCode: 1,
        }
      }
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: true,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_INSTALL_FAILED")
})

test("fails when expected kube context is missing", async () => {
  const { runtime } = createRuntime({
    runCommand: async (command, args) => {
      if (command === "kubectl" && args.join(" ") === "config get-contexts -o name") {
        return {
          ok: true,
          stdout: "docker-desktop\n",
          stderr: "",
          exitCode: 0,
        }
      }
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_CONTEXT_MISSING")
  assert.equal(result.details?.missingContext, "kind-orchwiz")
  assert.ok(result.details?.suggestedCommands?.includes("kind create cluster --name orchwiz"))
})

test("provisioning failure includes OCI helm remediation for invalid chart reference", async () => {
  const { runtime } = createRuntime({
    runCommand: async (command, args) => {
      if (command === "kubectl" && args.join(" ") === "config get-contexts -o name") {
        return {
          ok: true,
          stdout: "kind-orchwiz\n",
          stderr: "",
          exitCode: 0,
        }
      }
      if (command === "ansible-playbook") {
        return {
          ok: false,
          stdout: "",
          stderr: "Error: could not download chart: invalid_reference: invalid tag",
          exitCode: 1,
        }
      }
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_PROVISIONING_FAILED")
  assert.ok(
    result.details?.suggestedCommands?.some((command) =>
      command.includes("oci://registry-1.docker.io/bitnamicharts"),
    ),
  )
})

test("passes expected environment to ansible provisioning command", async () => {
  const { runtime, calls } = createRuntime({
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      ORCHWIZ_APP_NAME: "orchwiz-custom",
      LOCAL_INFRA_COMMAND_TIMEOUT_MS: "900000",
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, true)

  const ansibleCall = calls.find((call) => call.command === "ansible-playbook")
  assert.ok(ansibleCall)
  assert.deepEqual(ansibleCall?.args, [
    "-i",
    "/repo/infra/ansible/inventory/local.ini",
    "/repo/infra/ansible/playbooks/starship_local.yml",
  ])
  assert.equal(ansibleCall?.env?.TF_DIR, "/repo/infra/terraform/environments/starship-local")
  assert.equal(ansibleCall?.env?.INFRASTRUCTURE_KIND, "kind")
  assert.equal(ansibleCall?.env?.KUBE_CONTEXT, "kind-orchwiz")
  assert.equal(ansibleCall?.env?.ORCHWIZ_NAMESPACE, "orchwiz-starship")
  assert.equal(ansibleCall?.env?.ORCHWIZ_APP_NAME, "orchwiz-custom")
  assert.equal(ansibleCall?.timeoutMs, 900000)
})

test("sane bootstrap builds/loads local app image and passes TF_VAR_app_image", async () => {
  const { runtime, calls } = createRuntime({
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      LOCAL_SHIPYARD_FORCE_REBUILD_APP_IMAGE: "true",
    },
    runCommand: async (command, args) => {
      if (command === "kubectl" && args.join(" ") === "config get-contexts -o name") {
        return {
          ok: true,
          stdout: "kind-orchwiz\n",
          stderr: "",
          exitCode: 0,
        }
      }
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: true,
    },
    runtime,
  )

  assert.equal(result.ok, true)

  const dockerBuildCall = calls.find(
    (call) => call.command === "docker" && call.args[0] === "build",
  )
  assert.ok(dockerBuildCall)

  const kindLoadCall = calls.find(
    (call) => call.command === "kind" && call.args.join(" ") === "load docker-image orchwiz:local-dev --name orchwiz",
  )
  assert.ok(kindLoadCall)

  const ansibleCall = calls.find((call) => call.command === "ansible-playbook")
  assert.ok(ansibleCall)
  assert.equal(ansibleCall?.env?.TF_VAR_app_image, "orchwiz:local-dev")
})

test("returns missing docker error when kind image bootstrap is enabled", async () => {
  const { runtime } = createRuntime({
    installedCommands: ["terraform", "kubectl", "ansible-playbook", "kind"],
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: true,
    },
    runtime,
  )

  assert.equal(result.ok, false)
  if (result.ok) return

  assert.equal(result.code, "LOCAL_BOOTSTRAP_TOOLS_MISSING")
  assert.deepEqual(result.details?.missingCommands, ["docker"])
})

test("injects OpenClaw bridge context bundle into target deployments", async () => {
  const { runtime, calls } = createRuntime({
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      OPENCLAW_TARGET_DEPLOYMENTS: "openclaw-gateway",
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
      openClawContextBundle: {
        schemaVersion: "orchwiz.openclaw.context.v1",
        source: "ship-yard-bootstrap",
        deploymentId: "ship-1",
        generatedAt: "2026-02-09T00:00:00.000Z",
        files: [
          {
            path: "bridge-crew/xo-cb01/SOUL.md",
            content: "- Mission first",
          },
        ],
      },
    },
    runtime,
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  const setEnvCall = calls.find(
    (call) =>
      call.command === "kubectl"
      && call.args.includes("set")
      && call.args.includes("env")
      && call.args.includes("deployment/openclaw-gateway"),
  )
  assert.ok(setEnvCall)
  assert.equal(
    setEnvCall?.args.some((arg) => arg.startsWith("ORCHWIZ_BRIDGE_CONTEXT_B64=")),
    true,
  )

  const injectionMetadata = (result.metadata.openClawContextInjection || {}) as {
    attempted?: boolean
    updatedDeployments?: string[]
  }
  assert.equal(injectionMetadata.attempted, true)
  assert.deepEqual(injectionMetadata.updatedDeployments, ["openclaw-gateway"])
})

test("skips OpenClaw context injection when disabled", async () => {
  const { runtime, calls } = createRuntime({
    env: {
      ENABLE_LOCAL_COMMAND_EXECUTION: "true",
      OPENCLAW_CONTEXT_INJECTION_ENABLED: "false",
      OPENCLAW_TARGET_DEPLOYMENTS: "openclaw-gateway",
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
      openClawContextBundle: {
        schemaVersion: "orchwiz.openclaw.context.v1",
        source: "ship-yard-bootstrap",
        deploymentId: "ship-2",
        generatedAt: "2026-02-09T00:00:00.000Z",
        files: [{ path: "bridge-crew/ops-arx/PROMPT.md", content: "ops" }],
      },
    },
    runtime,
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  const hasSetEnvCall = calls.some(
    (call) =>
      call.command === "kubectl"
      && call.args.includes("set")
      && call.args.includes("env"),
  )
  assert.equal(hasSetEnvCall, false)

  const injectionMetadata = (result.metadata.openClawContextInjection || {}) as {
    attempted?: boolean
    skippedReason?: string
  }
  assert.equal(injectionMetadata.attempted, false)
  assert.equal(injectionMetadata.skippedReason, "disabled")
})

test("captures kubeview metadata from terraform outputs", async () => {
  const { runtime } = createRuntime({
    runCommand: async (command, args) => {
      if (command === "kubectl" && args.join(" ") === "config get-contexts -o name") {
        return {
          ok: true,
          stdout: "kind-orchwiz\n",
          stderr: "",
          exitCode: 0,
        }
      }
      if (command === "ansible-playbook") {
        return {
          ok: true,
          stdout: "PLAY RECAP",
          stderr: "",
          exitCode: 0,
        }
      }
      if (command === "terraform" && args.join(" ") === "-chdir /repo/infra/terraform/environments/starship-local output -json") {
        return {
          ok: true,
          stdout: JSON.stringify({
            kubeview_enabled: { value: true },
            kubeview_ingress_enabled: { value: true },
            kubeview_url: { value: "http://kubeview.orchwiz-starship.localhost/kubeview" },
          }),
          stderr: "",
          exitCode: 0,
        }
      }
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  const kubeview = result.metadata.kubeview as {
    enabled?: boolean
    ingressEnabled?: boolean
    url?: string | null
    source?: string
  }
  assert.equal(kubeview.enabled, true)
  assert.equal(kubeview.ingressEnabled, true)
  assert.equal(kubeview.url, "http://kubeview.orchwiz-starship.localhost/kubeview")
  assert.equal(kubeview.source, "terraform_output")
})

test("falls back to local kubeview metadata when terraform outputs are unavailable", async () => {
  const { runtime } = createRuntime({
    runCommand: async (command, args) => {
      if (command === "kubectl" && args.join(" ") === "config get-contexts -o name") {
        return {
          ok: true,
          stdout: "kind-orchwiz\n",
          stderr: "",
          exitCode: 0,
        }
      }
      if (command === "ansible-playbook") {
        return {
          ok: true,
          stdout: "PLAY RECAP",
          stderr: "",
          exitCode: 0,
        }
      }
      if (command === "terraform" && args.join(" ") === "-chdir /repo/infra/terraform/environments/starship-local output -json") {
        return {
          ok: false,
          stdout: "",
          stderr: "no outputs yet",
          exitCode: 1,
        }
      }
      return {
        ok: true,
        stdout: "",
        stderr: "",
        exitCode: 0,
      }
    },
  })

  const result = await runLocalBootstrap(
    {
      infrastructure: baseInfrastructure,
      provisioningMode: "terraform_ansible",
      saneBootstrap: false,
    },
    runtime,
  )

  assert.equal(result.ok, true)
  if (!result.ok) return

  const kubeview = result.metadata.kubeview as {
    enabled?: boolean
    ingressEnabled?: boolean
    url?: string | null
    source?: string
  }
  assert.equal(kubeview.enabled, true)
  assert.equal(kubeview.ingressEnabled, false)
  assert.equal(kubeview.url, null)
  assert.equal(kubeview.source, "fallback")
})
