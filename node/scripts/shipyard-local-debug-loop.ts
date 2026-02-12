import { pathToFileURL } from "node:url"

interface CliArgs {
  help: boolean
  verbose: boolean
  baseUrl: string
  pollMs: number
  timeoutMs: number
  nodeId: string
  namePrefix: string
}

interface LaunchResponse {
  error?: string
  code?: string
  deployment?: {
    id: string
    name: string
    status: string
  }
}

interface CleanupResponse {
  matchedCount?: number
  deletedCount?: number
  deletedShipIds?: string[]
  error?: string
  code?: string
}

interface ClusterResetResponse {
  clusterName?: string
  kubeContext?: string
  deletedCluster?: boolean
  createdCluster?: boolean
  commands?: string[]
  checks?: {
    contextSelected?: boolean
    nodesListed?: boolean
  }
  error?: string
  code?: string
}

interface StatusResponse {
  deployment?: {
    id: string
    name: string
    status: string
    healthStatus?: string | null
    metadata?: {
      deploymentError?: string
      deploymentErrorCode?: string
      deploymentErrorDetails?: {
        suggestedCommands?: string[]
      }
    }
  }
}

interface InspectionResponse {
  failure?: {
    code?: string | null
    message?: string | null
    suggestedCommands?: string[]
  }
  logs?: {
    tails?: Array<{
      key?: string
      value?: string
    }>
  }
  bridgeReadout?: {
    summary?: {
      total?: number
      enabled?: number
      autoRelay?: number
      lastDeliveryStatus?: string | null
      lastDeliveryAt?: string | null
    }
    deliveries?: Array<{
      id?: string
      status?: string
      lastError?: string | null
    }>
  }
  runtime?: {
    docker?: {
      currentContext?: string | null
    }
    kubernetes?: {
      currentContext?: string | null
    }
    kind?: {
      clusters?: Array<{
        name?: string
        runningNodeCount?: number
        totalNodeCount?: number
      }>
    }
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000

function parsePositiveInt(raw: string, label: string): number {
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

function parseArgs(argv: string[]): CliArgs {
  let baseUrl = process.env.SHIPYARD_BASE_URL?.trim() || "http://localhost:3000"
  let pollMs = 15_000
  let timeoutMs = 15 * 60 * 1000
  let nodeId = "local-node"
  let namePrefix = "LocalDebugShip"
  let verbose = false
  let help = false

  for (let idx = 0; idx < argv.length; idx += 1) {
    const arg = argv[idx]
    if (arg === "--help" || arg === "-h") {
      help = true
      continue
    }
    if (arg === "--verbose") {
      verbose = true
      continue
    }
    if (arg.startsWith("--base-url=")) {
      baseUrl = arg.slice("--base-url=".length).trim()
      continue
    }
    if (arg === "--base-url") {
      const next = argv[idx + 1]?.trim()
      if (!next) throw new Error("--base-url requires a value.")
      baseUrl = next
      idx += 1
      continue
    }
    if (arg.startsWith("--poll-ms=")) {
      pollMs = parsePositiveInt(arg.slice("--poll-ms=".length), "--poll-ms")
      continue
    }
    if (arg === "--poll-ms") {
      pollMs = parsePositiveInt(argv[idx + 1] || "", "--poll-ms")
      idx += 1
      continue
    }
    if (arg.startsWith("--timeout-ms=")) {
      timeoutMs = parsePositiveInt(arg.slice("--timeout-ms=".length), "--timeout-ms")
      continue
    }
    if (arg === "--timeout-ms") {
      timeoutMs = parsePositiveInt(argv[idx + 1] || "", "--timeout-ms")
      idx += 1
      continue
    }
    if (arg.startsWith("--node-id=")) {
      nodeId = arg.slice("--node-id=".length).trim()
      continue
    }
    if (arg === "--node-id") {
      const next = argv[idx + 1]?.trim()
      if (!next) throw new Error("--node-id requires a value.")
      nodeId = next
      idx += 1
      continue
    }
    if (arg.startsWith("--name-prefix=")) {
      namePrefix = arg.slice("--name-prefix=".length).trim()
      continue
    }
    if (arg === "--name-prefix") {
      const next = argv[idx + 1]?.trim()
      if (!next) throw new Error("--name-prefix requires a value.")
      namePrefix = next
      idx += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  const parsedUrl = new URL(baseUrl)
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Base URL must use http or https.")
  }

  return {
    help,
    verbose,
    baseUrl: parsedUrl.toString().replace(/\/+$/u, ""),
    pollMs,
    timeoutMs,
    nodeId: nodeId || "local-node",
    namePrefix: namePrefix || "LocalDebugShip",
  }
}

function printHelp(): void {
  console.log("Usage: npm run shipyard:local:debug -- [--base-url=<url>] [--poll-ms=<ms>] [--timeout-ms=<ms>] [--node-id=<id>] [--name-prefix=<prefix>] [--verbose]")
  console.log("")
  console.log("Required environment variables:")
  console.log("  SHIPYARD_BEARER_TOKEN   Ship Yard user API key")
  console.log("")
  console.log("Optional environment variables:")
  console.log("  SHIPYARD_BASE_URL       API base URL (default: http://localhost:3000)")
  console.log("  LOCAL_SHIPYARD_KIND_CLUSTER_NAME  kind cluster name reset target (default: orchwiz)")
  console.log("")
  console.log("Optional flags:")
  console.log("  --verbose               Print launch/status response payloads for debugging")
  console.log("")
  console.log("Exit codes:")
  console.log("  0  ship reached active")
  console.log("  1  ship reached failed")
  console.log("  2  preflight/runtime failure")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[^\dTZ]/g, "").slice(0, 15)
}

function compactReadoutText(value: string, maxChars = 260): string {
  const compact = value.replace(/\s+/gu, " ").trim()
  if (compact.length <= maxChars) {
    return compact
  }
  return `${compact.slice(0, maxChars - 3)}...`
}

async function requestJson<T>(args: {
  url: string
  method: "GET" | "POST" | "DELETE"
  token: string
  body?: unknown
  timeoutMs: number
}): Promise<{ status: number; json: T }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs)

  let response: Response
  try {
    response = await fetch(args.url, {
      method: args.method,
      headers: {
        Authorization: `Bearer ${args.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      ...(args.body ? { body: JSON.stringify(args.body) } : {}),
    })
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(`${args.method} ${args.url} timed out after ${args.timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  const json = (await response.json().catch(() => ({}))) as T
  return {
    status: response.status,
    json,
  }
}

async function printInspectionReadout(args: {
  baseUrl: string
  deploymentId: string
  token: string
  timeoutMs: number
  verbose: boolean
}): Promise<void> {
  try {
    const inspection = await requestJson<InspectionResponse>({
      url: `${args.baseUrl}/api/ship-yard/status/${args.deploymentId}/inspection?includeRuntime=true&deliveriesTake=6`,
      method: "GET",
      token: args.token,
      timeoutMs: args.timeoutMs,
    })

    if (args.verbose) {
      console.log(`[local-debug] inspection response=${JSON.stringify(inspection.json)}`)
    }

    if (inspection.status < 200 || inspection.status >= 300) {
      console.warn(
        `[local-debug] inspection unavailable status=${inspection.status}`,
      )
      return
    }

    const failureCode = inspection.json.failure?.code || "unknown"
    const failureMessage = inspection.json.failure?.message || "unknown"
    console.error(
      `[local-debug] inspection failure code=${failureCode} message=${failureMessage}`,
    )

    const inspectionSuggestions = Array.isArray(inspection.json.failure?.suggestedCommands)
      ? inspection.json.failure?.suggestedCommands
          .filter((command): command is string => typeof command === "string" && command.trim().length > 0)
          .slice(0, 6)
      : []
    if (inspectionSuggestions.length > 0) {
      console.error("[local-debug] inspection suggested commands:")
      for (const command of inspectionSuggestions) {
        console.error(`  - ${command}`)
      }
    }

    const summary = inspection.json.bridgeReadout?.summary
    if (summary) {
      console.error(
        `[local-debug] bridge summary enabled=${summary.enabled ?? 0}/${summary.total ?? 0} autoRelay=${summary.autoRelay ?? 0} last=${summary.lastDeliveryStatus || "n/a"} at=${summary.lastDeliveryAt || "n/a"}`,
      )
    }

    const failedDeliveryErrors = Array.isArray(inspection.json.bridgeReadout?.deliveries)
      ? inspection.json.bridgeReadout.deliveries
          .filter(
            (entry) =>
              entry.status === "failed"
              && typeof entry.lastError === "string"
              && entry.lastError.trim().length > 0,
          )
          .slice(0, 3)
      : []
    if (failedDeliveryErrors.length > 0) {
      console.error("[local-debug] top failed delivery errors:")
      for (const entry of failedDeliveryErrors) {
        console.error(
          `  - ${entry.id || "delivery"}: ${compactReadoutText(entry.lastError || "")}`,
        )
      }
    }

    const logTails = Array.isArray(inspection.json.logs?.tails)
      ? inspection.json.logs.tails
          .filter(
            (tail): tail is { key: string; value: string } =>
              typeof tail.key === "string"
              && tail.key.trim().length > 0
              && typeof tail.value === "string"
              && tail.value.trim().length > 0,
          )
          .slice(0, 3)
      : []
    if (logTails.length > 0) {
      console.error("[local-debug] inspection log tails:")
      for (const tail of logTails) {
        console.error(`  - ${tail.key}: ${compactReadoutText(tail.value)}`)
      }
    }

    if (inspection.json.runtime) {
      const dockerContext = inspection.json.runtime.docker?.currentContext || "n/a"
      const kubeContext = inspection.json.runtime.kubernetes?.currentContext || "n/a"
      const kindClusterCount = Array.isArray(inspection.json.runtime.kind?.clusters)
        ? inspection.json.runtime.kind?.clusters.length
        : 0
      console.error(
        `[local-debug] runtime snapshot docker=${dockerContext} kube=${kubeContext} kindClusters=${kindClusterCount}`,
      )
    }
  } catch (error) {
    console.warn(
      `[local-debug] inspection fetch failed: ${(error as Error).message}`,
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const token = process.env.SHIPYARD_BEARER_TOKEN?.trim()
  if (!token) {
    console.error("SHIPYARD_BEARER_TOKEN is required.")
    process.exitCode = 2
    return
  }

  const clusterName = process.env.LOCAL_SHIPYARD_KIND_CLUSTER_NAME?.trim() || "orchwiz"

  const cleanupUrl = new URL(`${args.baseUrl}/api/ship-yard/ships`)
  cleanupUrl.searchParams.set("confirm", "delete-all")
  cleanupUrl.searchParams.set("namePrefix", args.namePrefix)
  cleanupUrl.searchParams.set("deploymentProfile", "local_starship_build")

  console.log(`[local-debug] prelaunch cleanup: prefix=${args.namePrefix}`)
  const cleanup = await requestJson<CleanupResponse>({
    url: cleanupUrl.toString(),
    method: "DELETE",
    token,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  })
  if (args.verbose) {
    console.log(`[local-debug] cleanup response=${JSON.stringify(cleanup.json)}`)
  }

  if (cleanup.status >= 200 && cleanup.status < 300) {
    console.log(
      `[local-debug] cleanup matched=${cleanup.json.matchedCount ?? 0} deleted=${cleanup.json.deletedCount ?? 0}`,
    )
  } else {
    console.warn(
      `[local-debug] cleanup failed status=${cleanup.status} code=${cleanup.json.code || "unknown"} error=${cleanup.json.error || "unknown"}`,
    )
    console.warn("[local-debug] continuing to forced cluster reset")
  }

  console.log(`[local-debug] prelaunch cluster reset: ${clusterName}`)
  const reset = await requestJson<ClusterResetResponse>({
    url: `${args.baseUrl}/api/ship-yard/local/cluster/reset`,
    method: "POST",
    token,
    timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    body: {
      confirm: "reset-cluster",
      clusterName,
    },
  })
  if (args.verbose) {
    console.log(`[local-debug] cluster reset response=${JSON.stringify(reset.json)}`)
  }

  if (reset.status < 200 || reset.status >= 300) {
    console.error(
      `[local-debug] cluster reset failed status=${reset.status} code=${reset.json.code || "unknown"} error=${reset.json.error || "unknown"}`,
    )
    process.exitCode = 2
    return
  }

  console.log(
    `[local-debug] cluster reset complete cluster=${reset.json.clusterName || clusterName} context=${reset.json.kubeContext || `kind-${clusterName}`}`,
  )

  const shipName = `${args.namePrefix}-${nowStamp()}`
  console.log(`[local-debug] launch request: ${shipName}`)
  console.log(
    `[local-debug] launch can stay open while local provisioning runs (up to ${args.timeoutMs}ms)`,
  )

  const launch = await requestJson<LaunchResponse>({
    url: `${args.baseUrl}/api/ship-yard/launch`,
    method: "POST",
    token,
    timeoutMs: args.timeoutMs,
    body: {
      name: shipName,
      description: "Ship Yard local debug loop launch",
      nodeId: args.nodeId,
      deploymentProfile: "local_starship_build",
      provisioningMode: "terraform_ansible",
      saneBootstrap: true,
      crewRoles: ["xo", "ops", "eng", "sec", "med", "cou"],
    },
  })

  const deploymentId = launch.json.deployment?.id
  if (args.verbose) {
    console.log(`[local-debug] launch response=${JSON.stringify(launch.json)}`)
  }
  if (!deploymentId) {
    console.error(`[local-debug] launch failed without deployment id (status=${launch.status})`)
    console.error(JSON.stringify(launch.json, null, 2))
    process.exitCode = 2
    return
  }

  console.log(`[local-debug] deployment id: ${deploymentId}`)
  console.log(`[local-debug] initial launch status=${launch.json.deployment?.status || "unknown"} http=${launch.status}`)
  if (launch.json.code) {
    console.log(`[local-debug] launch code=${launch.json.code} error=${launch.json.error || ""}`)
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < args.timeoutMs) {
    const status = await requestJson<StatusResponse>({
      url: `${args.baseUrl}/api/ship-yard/status/${deploymentId}`,
      method: "GET",
      token,
      timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    })

    const deployment = status.json.deployment
    const state = deployment?.status || "unknown"
    const health = deployment?.healthStatus || "n/a"
    if (args.verbose) {
      console.log(`[local-debug] status response=${JSON.stringify(status.json)}`)
    }
    console.log(`[local-debug] poll status=${state} health=${health} http=${status.status}`)

    if (state === "active") {
      console.log("[local-debug] ship is active")
      process.exitCode = 0
      return
    }

    if (state === "failed") {
      console.error(`[local-debug] ship failed code=${deployment?.metadata?.deploymentErrorCode || "unknown"}`)
      console.error(`[local-debug] failure=${deployment?.metadata?.deploymentError || "unknown"}`)
      const suggested = deployment?.metadata?.deploymentErrorDetails?.suggestedCommands || []
      if (suggested.length > 0) {
        console.error("[local-debug] suggested commands:")
        for (const command of suggested) {
          console.error(`  - ${command}`)
        }
      }
      await printInspectionReadout({
        baseUrl: args.baseUrl,
        deploymentId,
        token,
        timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
        verbose: args.verbose,
      })
      process.exitCode = 1
      return
    }

    await sleep(args.pollMs)
  }

  console.error(`[local-debug] timeout waiting for terminal status after ${args.timeoutMs}ms`)
  process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(`[local-debug] fatal: ${(error as Error).message}`)
    process.exitCode = 2
  })
}
