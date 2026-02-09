import test from "node:test"
import assert from "node:assert/strict"
import {
  inspectLocalShipRuntime,
  type LocalRuntimeRunner,
  type RuntimeCommandResult,
} from "./local-runtime"

interface RuntimeCall {
  command: string
  args: string[]
}

type CommandOutputMap = Record<string, Partial<RuntimeCommandResult>>

function keyFor(command: string, args: string[]): string {
  return `${command} ${args.join(" ")}`
}

function createRunner(options: {
  availableCommands: string[]
  outputs: CommandOutputMap
}): { runner: LocalRuntimeRunner; calls: RuntimeCall[] } {
  const calls: RuntimeCall[] = []
  const commands = new Set(options.availableCommands)

  const runner: LocalRuntimeRunner = {
    commandExists: (command) => commands.has(command),
    run: async (command, args) => {
      calls.push({ command, args })
      const output = options.outputs[keyFor(command, args)]
      if (!output) {
        return {
          ok: false,
          stdout: "",
          stderr: "",
          error: `Unhandled command: ${keyFor(command, args)}`,
          exitCode: 1,
        }
      }
      return {
        ok: output.ok ?? true,
        stdout: output.stdout ?? "",
        stderr: output.stderr ?? "",
        error: output.error,
        exitCode: output.exitCode ?? (output.ok === false ? 1 : 0),
      }
    },
  }

  return { runner, calls }
}

test("reports installed kind cluster and matching kube context", async () => {
  const { runner } = createRunner({
    availableCommands: ["docker", "kubectl", "kind"],
    outputs: {
      [keyFor("docker", ["context", "show"])]: {
        stdout: "desktop-linux\n",
      },
      [keyFor("docker", ["context", "ls", "--format", "{{json .}}"])]: {
        stdout: [
          JSON.stringify({
            Current: false,
            Description: "default",
            DockerEndpoint: "unix:///var/run/docker.sock",
            Error: "",
            Name: "default",
          }),
          JSON.stringify({
            Current: true,
            Description: "Docker Desktop",
            DockerEndpoint: "unix:///Users/test/.docker/run/docker.sock",
            Error: "",
            Name: "desktop-linux",
          }),
        ].join("\n"),
      },
      [keyFor("kubectl", ["config", "get-contexts", "-o", "name"])]: {
        stdout: "kind-dev\nminikube\n",
      },
      [keyFor("kubectl", ["config", "current-context"])]: {
        stdout: "kind-dev\n",
      },
      [keyFor("kind", ["get", "clusters"])]: {
        stdout: "dev\n",
      },
      [
        keyFor("docker", [
          "ps",
          "-a",
          "--filter",
          "label=io.x-k8s.kind.cluster=dev",
          "--format",
          "{{json .}}",
        ])
      ]: {
        stdout: [
          JSON.stringify({
            Names: "dev-control-plane",
            Image: "kindest/node:v1.32.0",
            State: "running",
            Status: "Up 2 minutes",
          }),
        ].join("\n"),
      },
    },
  })

  const result = await inspectLocalShipRuntime(runner)

  assert.equal(result.docker.available, true)
  assert.equal(result.docker.currentContext, "desktop-linux")
  assert.equal(result.kubernetes.currentContext, "kind-dev")
  assert.equal(result.kind.available, true)
  assert.equal(result.kind.clusters.length, 1)
  assert.equal(result.kind.clusters[0].name, "dev")
  assert.equal(result.kind.clusters[0].kubeContext, "kind-dev")
  assert.equal(result.kind.clusters[0].kubeContextPresent, true)
  assert.equal(result.kind.clusters[0].runningNodeCount, 1)
  assert.equal(result.kind.clusters[0].controlPlaneContainer, "dev-control-plane")
})

test("gracefully reports missing CLIs", async () => {
  const { runner } = createRunner({
    availableCommands: [],
    outputs: {},
  })

  const result = await inspectLocalShipRuntime(runner)

  assert.equal(result.docker.available, false)
  assert.equal(result.kubernetes.available, false)
  assert.equal(result.kind.available, false)
  assert.equal(result.kind.clusters.length, 0)
  assert.match(result.docker.error || "", /docker CLI/i)
  assert.match(result.kubernetes.error || "", /kubectl/i)
  assert.match(result.kind.error || "", /kind CLI/i)
})

test("treats empty kind state as healthy command execution", async () => {
  const { runner, calls } = createRunner({
    availableCommands: ["docker", "kubectl", "kind"],
    outputs: {
      [keyFor("docker", ["context", "show"])]: { stdout: "desktop-linux\n" },
      [keyFor("docker", ["context", "ls", "--format", "{{json .}}"])]: {
        stdout: JSON.stringify({
          Current: true,
          Description: "Docker Desktop",
          DockerEndpoint: "unix:///Users/test/.docker/run/docker.sock",
          Error: "",
          Name: "desktop-linux",
        }),
      },
      [keyFor("kubectl", ["config", "get-contexts", "-o", "name"])]: {
        stdout: "kind-dev\n",
      },
      [keyFor("kubectl", ["config", "current-context"])]: {
        stdout: "kind-dev\n",
      },
      [keyFor("kind", ["get", "clusters"])]: {
        stdout: "No kind clusters found.\n",
      },
    },
  })

  const result = await inspectLocalShipRuntime(runner)

  assert.equal(result.kind.available, true)
  assert.deepEqual(result.kind.clusters, [])

  const dockerPsCalls = calls.filter(
    (call) => call.command === "docker" && call.args[0] === "ps",
  )
  assert.equal(dockerPsCalls.length, 0)
})
