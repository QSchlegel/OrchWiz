import { execFile as execFileCallback } from "node:child_process"
import { accessSync, constants, existsSync, statSync } from "node:fs"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFileCallback)
const DEFAULT_TIMEOUT_MS = 10_000

export interface RuntimeCommandResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  exitCode: number | null
}

export interface LocalRuntimeRunner {
  commandExists: (command: string) => boolean
  run: (
    command: string,
    args: string[],
    options?: { timeoutMs?: number },
  ) => Promise<RuntimeCommandResult>
}

export interface LocalRuntimeDockerContext {
  name: string
  description: string
  dockerEndpoint: string
  current: boolean
  error: string | null
}

export interface LocalRuntimeDockerState {
  available: boolean
  currentContext: string | null
  contexts: LocalRuntimeDockerContext[]
  error?: string
}

export interface LocalRuntimeKubernetesState {
  available: boolean
  currentContext: string | null
  contexts: string[]
  error?: string
}

export interface LocalRuntimeKindNodeContainer {
  name: string
  image: string
  state: string | null
  status: string
}

export interface LocalRuntimeKindCluster {
  name: string
  kubeContext: string
  kubeContextPresent: boolean
  controlPlaneContainer: string | null
  runningNodeCount: number
  totalNodeCount: number
  nodeContainers: LocalRuntimeKindNodeContainer[]
}

export interface LocalRuntimeKindState {
  available: boolean
  clusters: LocalRuntimeKindCluster[]
  error?: string
}

export interface LocalRuntimeSnapshot {
  checkedAt: string
  docker: LocalRuntimeDockerState
  kubernetes: LocalRuntimeKubernetesState
  kind: LocalRuntimeKindState
}

interface DockerContextRow {
  Current?: boolean
  Description?: string
  DockerEndpoint?: string
  Error?: string
  Name?: string
}

interface DockerContainerRow {
  Names?: string
  Image?: string
  State?: string
  Status?: string
}

function defaultRunner(): LocalRuntimeRunner {
  const commandExists = (command: string): boolean => {
    const pathValue = process.env.PATH || ""
    const candidates = pathValue
      .split(delimiter)
      .map((entry) => entry.trim())
      .filter(Boolean)

    for (const candidatePath of candidates) {
      const candidate = join(candidatePath, command)
      if (!existsSync(candidate)) continue
      try {
        const stats = statSync(candidate)
        if (!stats.isFile()) continue
        accessSync(candidate, constants.X_OK)
        return true
      } catch {
        continue
      }
    }

    return false
  }

  return {
    commandExists,
    run: async (command, args, options = {}) => {
      try {
        const { stdout, stderr } = await execFileAsync(command, args, {
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxBuffer: 4 * 1024 * 1024,
          env: process.env,
        })

        return {
          ok: true,
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: 0,
        }
      } catch (error) {
        const commandError = error as {
          stdout?: string
          stderr?: string
          message?: string
          code?: number
        }
        return {
          ok: false,
          stdout: commandError.stdout || "",
          stderr: commandError.stderr || "",
          error: commandError.message || "Command failed.",
          exitCode: typeof commandError.code === "number" ? commandError.code : null,
        }
      }
    },
  }
}

function parseJsonLines<T>(input: string): T[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T]
      } catch {
        return []
      }
    })
}

function normalizeLines(input: string): string[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function isRunningStatus(state: string | undefined, status: string | undefined): boolean {
  if (state && state.toLowerCase() === "running") return true
  if (!status) return false
  return status.toLowerCase().startsWith("up ")
}

async function inspectDockerState(runner: LocalRuntimeRunner): Promise<LocalRuntimeDockerState> {
  if (!runner.commandExists("docker")) {
    return {
      available: false,
      currentContext: null,
      contexts: [],
      error: "docker CLI is not installed or not on PATH.",
    }
  }

  const [currentResult, listResult] = await Promise.all([
    runner.run("docker", ["context", "show"]),
    runner.run("docker", ["context", "ls", "--format", "{{json .}}"]),
  ])

  const contexts = listResult.ok
    ? parseJsonLines<DockerContextRow>(listResult.stdout).map((row) => ({
        name: typeof row.Name === "string" ? row.Name : "",
        description: typeof row.Description === "string" ? row.Description : "",
        dockerEndpoint: typeof row.DockerEndpoint === "string" ? row.DockerEndpoint : "",
        current: row.Current === true,
        error: typeof row.Error === "string" && row.Error.trim().length > 0 ? row.Error : null,
      }))
    : []

  const currentContextFromList = contexts.find((context) => context.current)?.name || null
  const currentContext =
    currentResult.ok && currentResult.stdout.trim().length > 0
      ? currentResult.stdout.trim()
      : currentContextFromList

  return {
    available: listResult.ok || currentResult.ok,
    currentContext,
    contexts,
    ...(listResult.ok
      ? {}
      : {
          error:
            listResult.error ||
            listResult.stderr.trim() ||
            "Unable to query docker contexts from docker CLI.",
        }),
  }
}

async function inspectKubernetesState(
  runner: LocalRuntimeRunner,
): Promise<LocalRuntimeKubernetesState> {
  if (!runner.commandExists("kubectl")) {
    return {
      available: false,
      currentContext: null,
      contexts: [],
      error: "kubectl is not installed or not on PATH.",
    }
  }

  const [listResult, currentResult] = await Promise.all([
    runner.run("kubectl", ["config", "get-contexts", "-o", "name"]),
    runner.run("kubectl", ["config", "current-context"]),
  ])

  const contexts = listResult.ok ? normalizeLines(listResult.stdout) : []
  const currentContext =
    currentResult.ok && currentResult.stdout.trim().length > 0
      ? currentResult.stdout.trim()
      : contexts[0] || null

  return {
    available: listResult.ok || currentResult.ok,
    contexts,
    currentContext,
    ...(listResult.ok
      ? {}
      : {
          error:
            listResult.error ||
            listResult.stderr.trim() ||
            "Unable to query Kubernetes contexts from kubectl.",
        }),
  }
}

function parseKindClusterNames(output: string): string[] {
  const lines = normalizeLines(output)
  if (lines.length === 0) return []
  if (lines.length === 1 && lines[0].toLowerCase() === "no kind clusters found.") {
    return []
  }
  return lines
}

async function inspectKindState(
  runner: LocalRuntimeRunner,
  kubernetesContexts: string[],
  dockerAvailable: boolean,
): Promise<LocalRuntimeKindState> {
  if (!runner.commandExists("kind")) {
    return {
      available: false,
      clusters: [],
      error: "kind CLI is not installed or not on PATH.",
    }
  }

  const kindResult = await runner.run("kind", ["get", "clusters"])
  if (!kindResult.ok) {
    return {
      available: false,
      clusters: [],
      error:
        kindResult.error ||
        kindResult.stderr.trim() ||
        "Unable to list kind clusters with `kind get clusters`.",
    }
  }

  const clusters = parseKindClusterNames(kindResult.stdout)

  const inspectedClusters = await Promise.all(
    clusters.map(async (clusterName): Promise<LocalRuntimeKindCluster> => {
      const kubeContext = `kind-${clusterName}`
      const kubeContextPresent = kubernetesContexts.includes(kubeContext)

      let nodeContainers: LocalRuntimeKindNodeContainer[] = []
      if (dockerAvailable) {
        const containersResult = await runner.run("docker", [
          "ps",
          "-a",
          "--filter",
          `label=io.x-k8s.kind.cluster=${clusterName}`,
          "--format",
          "{{json .}}",
        ])

        if (containersResult.ok) {
          nodeContainers = parseJsonLines<DockerContainerRow>(containersResult.stdout).map((row) => ({
            name: typeof row.Names === "string" ? row.Names : "unknown",
            image: typeof row.Image === "string" ? row.Image : "unknown",
            state: typeof row.State === "string" ? row.State : null,
            status: typeof row.Status === "string" ? row.Status : "unknown",
          }))
        }
      }

      const controlPlaneContainer =
        nodeContainers.find((container) => container.name.endsWith("-control-plane"))?.name || null
      const runningNodeCount = nodeContainers.filter((container) =>
        isRunningStatus(container.state || undefined, container.status),
      ).length

      return {
        name: clusterName,
        kubeContext,
        kubeContextPresent,
        controlPlaneContainer,
        runningNodeCount,
        totalNodeCount: nodeContainers.length,
        nodeContainers,
      }
    }),
  )

  return {
    available: true,
    clusters: inspectedClusters,
  }
}

export async function inspectLocalShipRuntime(
  runner: LocalRuntimeRunner = defaultRunner(),
): Promise<LocalRuntimeSnapshot> {
  const dockerState = await inspectDockerState(runner)
  const kubernetesState = await inspectKubernetesState(runner)
  const kindState = await inspectKindState(
    runner,
    kubernetesState.contexts,
    dockerState.available,
  )

  return {
    checkedAt: new Date().toISOString(),
    docker: dockerState,
    kubernetes: kubernetesState,
    kind: kindState,
  }
}
