import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { normalizeInfrastructureInConfig } from "@/lib/deployment/profile"
import { resolveRuntimeUiFromTerraform } from "@/lib/bridge/runtime-ui-hydration"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve as resolvePath } from "node:path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface EnsureRouteBody {
  shipDeploymentId?: unknown
}

type EnsureStatus = "ready" | "started" | "blocked" | "failed"

type EnsureResponse =
  | {
      ok: true
      status: "ready" | "started"
      port: number
      command: string
      detail: string
    }
  | {
      ok: false
      status: "blocked" | "failed"
      port: number
      command: string
      detail: string
      logs?: string[]
    }

type RuntimeEdgePortForwardState = {
  inFlight: Map<string, Promise<EnsureResponse>>
  processes: Map<string, { child: ChildProcess; logs: string[]; startedAt: number }>
}

function runtimeEdgePortForwardState(): RuntimeEdgePortForwardState {
  const globalRef = globalThis as unknown as { __owzRuntimeEdgePortForwardState?: RuntimeEdgePortForwardState }
  if (!globalRef.__owzRuntimeEdgePortForwardState) {
    globalRef.__owzRuntimeEdgePortForwardState = {
      inFlight: new Map(),
      processes: new Map(),
    }
  }
  return globalRef.__owzRuntimeEdgePortForwardState
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function resolveRepoRoot(): string {
  const override = asString(process.env.ORCHWIZ_REPO_ROOT)
  if (override) {
    return resolvePath(override)
  }

  const cwd = process.cwd()
  if (existsSync(resolvePath(cwd, "infra/terraform"))) {
    return cwd
  }

  const parent = resolvePath(cwd, "..")
  if (existsSync(resolvePath(parent, "infra/terraform"))) {
    return parent
  }

  return parent
}

function isRunningInKubernetes(): boolean {
  return asString(process.env.KUBERNETES_SERVICE_HOST) !== null
}

function localExecutionEnabled(): boolean {
  return process.env.ENABLE_LOCAL_COMMAND_EXECUTION === "true"
}

function normalizeKubeContext(value: string | null): string | null {
  const raw = asString(value)
  if (!raw) return null
  // Kubeconfig contexts are user-supplied strings; keep it permissive but reject whitespace.
  if (/\s/u.test(raw)) return null
  return raw
}

function normalizeNamespace(value: string | null): string | null {
  const raw = asString(value)
  if (!raw) return null
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/u.test(raw)) return null
  return raw
}

function normalizeServiceName(value: string | null): string | null {
  const raw = asString(value)
  if (!raw) return null
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/u.test(raw)) return null
  return raw
}

function normalizePort(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 65536) {
    return Math.floor(value)
  }
  const raw = asString(value)
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 65536) return null
  return parsed
}

function buildPortForwardCommand(args: {
  kubeContext: string | null
  namespace: string
  serviceName: string
  port: number
}): { command: string; argv: string[] } {
  const argv: string[] = []
  if (args.kubeContext) {
    argv.push("--context", args.kubeContext)
  }
  argv.push("-n", args.namespace, "port-forward", `svc/${args.serviceName}`, `${args.port}:${args.port}`, "--address", "127.0.0.1")

  const command = ["kubectl", ...argv].join(" ")
  return { command, argv }
}

async function probeRuntimeEdgeHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1200),
    })
    return response.ok
  } catch {
    return false
  }
}

function appendLogLines(buffer: string[], chunk: unknown) {
  const text = typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : ""
  if (!text) return
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return

  buffer.push(...lines)
  const MAX = 120
  if (buffer.length > MAX) {
    buffer.splice(0, buffer.length - MAX)
  }
}

async function ensurePortForward(args: {
  kubeContext: string | null
  namespace: string
  serviceName: string
  port: number
}): Promise<EnsureResponse> {
  const state = runtimeEdgePortForwardState()
  const key = `${args.kubeContext || ""}|${args.namespace}|${args.serviceName}|${args.port}`
  const { command, argv } = buildPortForwardCommand(args)

  if (await probeRuntimeEdgeHealth(args.port)) {
    return {
      ok: true,
      status: "ready",
      port: args.port,
      command,
      detail: "runtime-edge is reachable.",
    }
  }

  const inKubernetes = isRunningInKubernetes()
  if (inKubernetes || !localExecutionEnabled()) {
    return {
      ok: false,
      status: "blocked",
      port: args.port,
      command,
      detail: inKubernetes
        ? "This OrchWiz server is running inside Kubernetes, so it cannot start a workstation port-forward. Run the command locally."
        : "Local command execution is disabled. Set ENABLE_LOCAL_COMMAND_EXECUTION=true or run the command locally.",
    }
  }

  const existing = state.processes.get(key)
  if (existing && existing.child.exitCode === null && !existing.child.killed) {
    // Port-forward exists but may not have finished binding yet.
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (await probeRuntimeEdgeHealth(args.port)) {
        return {
          ok: true,
          status: "ready",
          port: args.port,
          command,
          detail: "runtime-edge is reachable.",
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
  }

  const inFlight = state.inFlight.get(key)
  if (inFlight) {
    return inFlight
  }

  const promise = (async (): Promise<EnsureResponse> => {
    const logs: string[] = []

    const child = spawn("kubectl", argv, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })

    child.stdout?.setEncoding("utf8")
    child.stderr?.setEncoding("utf8")
    child.stdout?.on("data", (chunk) => appendLogLines(logs, chunk))
    child.stderr?.on("data", (chunk) => appendLogLines(logs, chunk))

    state.processes.set(key, { child, logs, startedAt: Date.now() })

    child.on("exit", () => {
      const entry = state.processes.get(key)
      if (entry?.child === child) {
        state.processes.delete(key)
      }
    })

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await probeRuntimeEdgeHealth(args.port)) {
        return {
          ok: true,
          status: "started",
          port: args.port,
          command,
          detail: "Started runtime-edge port-forward.",
        }
      }

      if (child.exitCode !== null) {
        return {
          ok: false,
          status: "failed",
          port: args.port,
          command,
          detail: "kubectl port-forward exited before runtime-edge became reachable.",
          logs,
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 350))
    }

    return {
      ok: false,
      status: "failed",
      port: args.port,
      command,
      detail: "Timed out waiting for runtime-edge to become reachable.",
      logs,
    }
  })().finally(() => {
    runtimeEdgePortForwardState().inFlight.delete(key)
  })

  state.inFlight.set(key, promise)
  return promise
}

async function selectShip(args: {
  userId: string
  shipDeploymentId: string | null
}): Promise<{
  id: string
  status: string
  deploymentProfile: "local_starship_build" | "cloud_shipyard"
  config: unknown
  metadata: unknown
} | null> {
  if (args.shipDeploymentId) {
    const explicit = await prisma.agentDeployment.findFirst({
      where: {
        id: args.shipDeploymentId,
        userId: args.userId,
        deploymentType: "ship",
      },
      select: {
        id: true,
        status: true,
        deploymentProfile: true,
        config: true,
        metadata: true,
      },
    })
    if (explicit) return explicit as any
  }

  const active = await prisma.agentDeployment.findFirst({
    where: {
      userId: args.userId,
      deploymentType: "ship",
      status: "active",
    },
    select: {
      id: true,
      status: true,
      deploymentProfile: true,
      config: true,
      metadata: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })
  if (active) return active as any

  const fallback = await prisma.agentDeployment.findFirst({
    where: {
      userId: args.userId,
      deploymentType: "ship",
    },
    select: {
      id: true,
      status: true,
      deploymentProfile: true,
      config: true,
      metadata: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  })
  return fallback ? (fallback as any) : null
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: EnsureRouteBody = {}
  try {
    body = (await request.json()) as EnsureRouteBody
  } catch {
    body = {}
  }

  const requestedShipDeploymentId =
    asString(body.shipDeploymentId)
    || asString(request.nextUrl.searchParams.get("shipDeploymentId"))
    || null

  const ship = await selectShip({
    userId: session.user.id,
    shipDeploymentId: requestedShipDeploymentId,
  })
  if (!ship) {
    return NextResponse.json({ error: "No ship deployment available." }, { status: 404 })
  }

  if (ship.deploymentProfile !== "local_starship_build") {
    return NextResponse.json(
      {
        ok: false,
        status: "blocked",
        detail: "runtime-edge port-forward is only supported for local starship builds.",
      },
      { status: 400 },
    )
  }

  const { infrastructure } = normalizeInfrastructureInConfig(ship.deploymentProfile, ship.config || {})
  const repoRoot = resolveRepoRoot()

  const terraformResolution = await resolveRuntimeUiFromTerraform({
    repoRoot,
    terraformEnvDir: infrastructure.terraformEnvDir,
    allowCommandExecution: localExecutionEnabled(),
  })

  const appName = asString(process.env.ORCHWIZ_APP_NAME) || "orchwiz"
  const kubeContext = normalizeKubeContext(terraformResolution?.runtimeEdge.kubeContext || infrastructure.kubeContext)
  const namespace = normalizeNamespace(terraformResolution?.runtimeEdge.namespace || infrastructure.namespace) || "orchwiz-starship"
  const serviceName = normalizeServiceName(terraformResolution?.runtimeEdge.serviceName ?? null) || `${appName}-runtime-edge`
  const port = normalizePort(terraformResolution?.runtimeEdge.port) || 3100

  const result = await ensurePortForward({
    kubeContext,
    namespace,
    serviceName,
    port,
  })

  const response = NextResponse.json(result satisfies EnsureResponse)
  response.headers.set("cache-control", "no-store")
  return response
}
