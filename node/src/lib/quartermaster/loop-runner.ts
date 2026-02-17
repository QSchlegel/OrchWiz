import type { Prisma, Task, TaskStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { executeShipQuartermasterPrompt } from "@/lib/quartermaster/api"
import { ensureShipQuartermaster, getShipQuartermasterState } from "@/lib/quartermaster/service"
import {
  QUARTERMASTER_LOOP_DEFAULTS,
  parseQuartermasterExecutionLevel,
  type QuartermasterExecutionLevel,
  type QuartermasterLoopDefaults,
} from "@/lib/quartermaster/constants"

const LOOP_ROUTE_PATH = "/api/ships/[id]/quartermaster/loop"
const LOOP_VERSION = 1
const LOOP_MAX_CONSECUTIVE_FAILURES = 3
const ACTIVE_TASK_STATUSES: TaskStatus[] = ["running", "thinking"]

const loopTimers = new Map<string, NodeJS.Timeout>()

type QuartermasterLoopStopReason =
  | "manual_stop"
  | "replaced_by_new_run"
  | "healthy_active"
  | "max_iterations"
  | "max_duration"
  | "ship_missing"
  | "task_invalid"
  | "fatal_error"

interface QuartermasterLoopTaskMetadata {
  version: number
  shipDeploymentId: string
  sessionId: string
  prompt: string
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
  iterationCount: number
  failureCount: number
  startedAt: string
  updatedAt: string
  lastIterationAt: string | null
  lastError: string | null
  lastInteractionId: string | null
  lastResponseInteractionId: string | null
  stopRequested: boolean
  status: "running" | "completed" | "failed"
  stopReason: QuartermasterLoopStopReason | null
}

export interface QuartermasterLoopRunSummary {
  taskId: string
  shipDeploymentId: string
  status: TaskStatus
  startedAt: string
  completedAt: string | null
  prompt: string
  executionLevel: QuartermasterExecutionLevel
  loopDefaults: QuartermasterLoopDefaults
  iterationCount: number
  failureCount: number
  stopRequested: boolean
  stopReason: QuartermasterLoopStopReason | null
  lastIterationAt: string | null
  lastError: string | null
}

export interface QuartermasterLoopStatus {
  activeRun: QuartermasterLoopRunSummary | null
  recentRuns: QuartermasterLoopRunSummary[]
}

export interface StartQuartermasterLoopArgs {
  userId: string
  shipDeploymentId: string
  prompt: string
  executionLevel?: QuartermasterExecutionLevel
  loopDefaults?: Partial<QuartermasterLoopDefaults>
}

export interface StopQuartermasterLoopArgs {
  userId: string
  shipDeploymentId: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  return null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function mergeLoopDefaults(
  base: QuartermasterLoopDefaults,
  patch?: Partial<QuartermasterLoopDefaults>,
): QuartermasterLoopDefaults {
  if (!patch) {
    return base
  }

  return {
    intervalSeconds: clamp(
      asInteger(patch.intervalSeconds) ?? base.intervalSeconds,
      10,
      3600,
    ),
    maxDurationSeconds: clamp(
      asInteger(patch.maxDurationSeconds) ?? base.maxDurationSeconds,
      60,
      86400,
    ),
    maxIterations: clamp(
      asInteger(patch.maxIterations) ?? base.maxIterations,
      1,
      1000,
    ),
    autoStopOnHealthyActive:
      asBoolean(patch.autoStopOnHealthyActive) ?? base.autoStopOnHealthyActive,
  }
}

function quartermasterLoopFromTask(task: Task): QuartermasterLoopTaskMetadata | null {
  const root = asRecord(task.metadata)
  const loop = asRecord(root.quartermasterLoop)
  const prompt = asString(loop.prompt)
  const shipDeploymentId = asString(loop.shipDeploymentId)
  const sessionId = asString(loop.sessionId)
  const startedAt = asString(loop.startedAt)
  const updatedAt = asString(loop.updatedAt)
  if (!prompt || !shipDeploymentId || !sessionId || !startedAt || !updatedAt) {
    return null
  }

  const loopDefaults = mergeLoopDefaults(QUARTERMASTER_LOOP_DEFAULTS, {
    intervalSeconds: asInteger(asRecord(loop.loopDefaults).intervalSeconds) || undefined,
    maxDurationSeconds: asInteger(asRecord(loop.loopDefaults).maxDurationSeconds) || undefined,
    maxIterations: asInteger(asRecord(loop.loopDefaults).maxIterations) || undefined,
    autoStopOnHealthyActive:
      asBoolean(asRecord(loop.loopDefaults).autoStopOnHealthyActive) ?? undefined,
  })

  return {
    version: asInteger(loop.version) ?? LOOP_VERSION,
    shipDeploymentId,
    sessionId,
    prompt,
    executionLevel: parseQuartermasterExecutionLevel(loop.executionLevel),
    loopDefaults,
    iterationCount: clamp(asInteger(loop.iterationCount) ?? 0, 0, 1_000_000),
    failureCount: clamp(asInteger(loop.failureCount) ?? 0, 0, 1_000_000),
    startedAt,
    updatedAt,
    lastIterationAt: asString(loop.lastIterationAt),
    lastError: asString(loop.lastError),
    lastInteractionId: asString(loop.lastInteractionId),
    lastResponseInteractionId: asString(loop.lastResponseInteractionId),
    stopRequested: loop.stopRequested === true,
    status: task.status === "failed" ? "failed" : task.status === "completed" ? "completed" : "running",
    stopReason: (asString(loop.stopReason) as QuartermasterLoopStopReason | null) || null,
  }
}

function withQuartermasterLoopMetadata(args: {
  existingMetadata: Prisma.JsonValue | null
  loop: QuartermasterLoopTaskMetadata
}): Prisma.InputJsonValue {
  const root = asRecord(args.existingMetadata)
  return {
    ...root,
    quartermasterLoop: {
      version: args.loop.version,
      shipDeploymentId: args.loop.shipDeploymentId,
      sessionId: args.loop.sessionId,
      prompt: args.loop.prompt,
      executionLevel: args.loop.executionLevel,
      loopDefaults: args.loop.loopDefaults,
      iterationCount: args.loop.iterationCount,
      failureCount: args.loop.failureCount,
      startedAt: args.loop.startedAt,
      updatedAt: args.loop.updatedAt,
      lastIterationAt: args.loop.lastIterationAt,
      lastError: args.loop.lastError,
      lastInteractionId: args.loop.lastInteractionId,
      lastResponseInteractionId: args.loop.lastResponseInteractionId,
      stopRequested: args.loop.stopRequested,
      status: args.loop.status,
      stopReason: args.loop.stopReason,
    },
  } as unknown as Prisma.InputJsonValue
}

function taskToSummary(task: Task): QuartermasterLoopRunSummary | null {
  const loop = quartermasterLoopFromTask(task)
  if (!loop) {
    return null
  }

  return {
    taskId: task.id,
    shipDeploymentId: loop.shipDeploymentId,
    status: task.status,
    startedAt: loop.startedAt,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    prompt: loop.prompt,
    executionLevel: loop.executionLevel,
    loopDefaults: loop.loopDefaults,
    iterationCount: loop.iterationCount,
    failureCount: loop.failureCount,
    stopRequested: loop.stopRequested,
    stopReason: loop.stopReason,
    lastIterationAt: loop.lastIterationAt,
    lastError: loop.lastError,
  }
}

async function findLoopTasks(args: {
  userId: string
  shipDeploymentId: string
  activeOnly: boolean
  take?: number
}): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      strategy: "background_agent",
      ...(args.activeOnly
        ? {
            status: {
              in: ACTIVE_TASK_STATUSES,
            },
          }
        : {}),
      session: {
        userId: args.userId,
      },
      metadata: {
        path: ["quartermasterLoop", "shipDeploymentId"],
        equals: args.shipDeploymentId,
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    take: Math.max(1, Math.min(20, args.take || 5)),
  })
}

function clearTaskTimer(taskId: string): void {
  const timer = loopTimers.get(taskId)
  if (timer) {
    clearTimeout(timer)
    loopTimers.delete(taskId)
  }
}

function scheduleTask(taskId: string, delayMs: number): void {
  clearTaskTimer(taskId)
  const timer = setTimeout(() => {
    void runLoopTask(taskId)
  }, Math.max(0, delayMs))
  loopTimers.set(taskId, timer)
}

async function completeLoopTask(args: {
  task: Task
  nextStatus: TaskStatus
  stopReason: QuartermasterLoopStopReason
  error?: string | null
}): Promise<Task> {
  clearTaskTimer(args.task.id)
  const loop = quartermasterLoopFromTask(args.task)

  if (!loop) {
    return prisma.task.update({
      where: { id: args.task.id },
      data: {
        status: args.nextStatus,
        completedAt: new Date(),
      },
    })
  }

  const nowIso = new Date().toISOString()
  const nextLoop: QuartermasterLoopTaskMetadata = {
    ...loop,
    updatedAt: nowIso,
    status: args.nextStatus === "failed" ? "failed" : "completed",
    stopRequested: true,
    stopReason: args.stopReason,
    ...(args.error ? { lastError: args.error } : {}),
  }

  return prisma.task.update({
    where: {
      id: args.task.id,
    },
    data: {
      status: args.nextStatus,
      completedAt: new Date(),
      metadata: withQuartermasterLoopMetadata({
        existingMetadata: args.task.metadata,
        loop: nextLoop,
      }),
    },
  })
}

async function updateLoopTask(
  task: Task,
  patch: Partial<QuartermasterLoopTaskMetadata>,
  taskStatus?: TaskStatus,
): Promise<Task> {
  const loop = quartermasterLoopFromTask(task)
  if (!loop) {
    throw new Error("Invalid quartermaster loop metadata")
  }

  const nextLoop: QuartermasterLoopTaskMetadata = {
    ...loop,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  return prisma.task.update({
    where: {
      id: task.id,
    },
    data: {
      ...(taskStatus ? { status: taskStatus } : {}),
      metadata: withQuartermasterLoopMetadata({
        existingMetadata: task.metadata,
        loop: nextLoop,
      }),
    },
  })
}

async function runLoopTask(taskId: string): Promise<void> {
  clearTaskTimer(taskId)
  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
    },
    include: {
      session: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  })

  if (!task) {
    return
  }

  if (!task.session) {
    await completeLoopTask({
      task,
      nextStatus: "failed",
      stopReason: "task_invalid",
      error: "Loop task session is missing",
    })
    return
  }

  if (!ACTIVE_TASK_STATUSES.includes(task.status)) {
    return
  }

  const loop = quartermasterLoopFromTask(task)
  if (!loop) {
    await completeLoopTask({
      task,
      nextStatus: "failed",
      stopReason: "task_invalid",
      error: "Loop task metadata is invalid",
    })
    return
  }

  if (loop.stopRequested) {
    await completeLoopTask({
      task,
      nextStatus: "completed",
      stopReason: loop.stopReason || "manual_stop",
    })
    return
  }

  const startedAtMs = Date.parse(loop.startedAt)
  const nowMs = Date.now()
  const elapsedSeconds = Number.isFinite(startedAtMs)
    ? Math.max(0, Math.floor((nowMs - startedAtMs) / 1000))
    : 0

  if (loop.iterationCount >= loop.loopDefaults.maxIterations) {
    await completeLoopTask({
      task,
      nextStatus: "completed",
      stopReason: "max_iterations",
    })
    return
  }
  if (elapsedSeconds >= loop.loopDefaults.maxDurationSeconds) {
    await completeLoopTask({
      task,
      nextStatus: "completed",
      stopReason: "max_duration",
    })
    return
  }

  const shipState = await getShipQuartermasterState({
    userId: task.session.userId,
    shipDeploymentId: loop.shipDeploymentId,
  })
  if (!shipState) {
    await completeLoopTask({
      task,
      nextStatus: "failed",
      stopReason: "ship_missing",
      error: "Ship no longer exists for this loop run",
    })
    return
  }

  if (
    loop.loopDefaults.autoStopOnHealthyActive
    && shipState.ship.status === "active"
    && shipState.ship.healthStatus === "healthy"
  ) {
    await completeLoopTask({
      task,
      nextStatus: "completed",
      stopReason: "healthy_active",
    })
    return
  }

  const thinkingTask = await updateLoopTask(task, {}, "thinking")

  try {
    const promptResult = await executeShipQuartermasterPrompt({
      userId: task.session.userId,
      shipDeploymentId: loop.shipDeploymentId,
      prompt: loop.prompt,
      requestedBackend: "auto",
      autoProvisionIfMissing: true,
      executionLevel: loop.executionLevel,
      runtimeExecutionKind: "autonomous_task",
      loopContext: {
        runId: task.id,
        iteration: loop.iterationCount + 1,
        fullAuto: true,
      },
      routePath: LOOP_ROUTE_PATH,
    })

    const refreshedTask = await updateLoopTask(
      thinkingTask,
      {
        iterationCount: loop.iterationCount + 1,
        failureCount: 0,
        lastIterationAt: new Date().toISOString(),
        lastError: null,
        lastInteractionId: promptResult.interaction.id,
        lastResponseInteractionId: promptResult.responseInteraction.id,
      },
      "running",
    )

    const refreshedLoop = quartermasterLoopFromTask(refreshedTask)
    if (!refreshedLoop) {
      await completeLoopTask({
        task: refreshedTask,
        nextStatus: "failed",
        stopReason: "task_invalid",
      })
      return
    }

    if (refreshedLoop.iterationCount >= refreshedLoop.loopDefaults.maxIterations) {
      await completeLoopTask({
        task: refreshedTask,
        nextStatus: "completed",
        stopReason: "max_iterations",
      })
      return
    }

    scheduleTask(task.id, refreshedLoop.loopDefaults.intervalSeconds * 1000)
  } catch (error) {
    const message = (error as Error)?.message || "Quartermaster loop iteration failed"
    const nextFailureCount = loop.failureCount + 1
    const failedTask = await updateLoopTask(
      thinkingTask,
      {
        failureCount: nextFailureCount,
        lastError: message,
        lastIterationAt: new Date().toISOString(),
      },
      "running",
    )

    if (nextFailureCount >= LOOP_MAX_CONSECUTIVE_FAILURES) {
      await completeLoopTask({
        task: failedTask,
        nextStatus: "failed",
        stopReason: "fatal_error",
        error: message,
      })
      return
    }

    const failedLoop = quartermasterLoopFromTask(failedTask)
    if (!failedLoop) {
      return
    }
    scheduleTask(task.id, failedLoop.loopDefaults.intervalSeconds * 1000)
  }
}

function loopSummaryFromTasks(tasks: Task[]): QuartermasterLoopRunSummary[] {
  return tasks
    .map((task) => taskToSummary(task))
    .filter((entry): entry is QuartermasterLoopRunSummary => Boolean(entry))
}

async function stopTasks(tasks: Task[], stopReason: QuartermasterLoopStopReason): Promise<void> {
  for (const task of tasks) {
    await completeLoopTask({
      task,
      nextStatus: "completed",
      stopReason,
    })
  }
}

export async function getQuartermasterLoopStatus(args: {
  userId: string
  shipDeploymentId: string
}): Promise<QuartermasterLoopStatus> {
  const [activeTasks, recentTasks] = await Promise.all([
    findLoopTasks({
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
      activeOnly: true,
      take: 5,
    }),
    findLoopTasks({
      userId: args.userId,
      shipDeploymentId: args.shipDeploymentId,
      activeOnly: false,
      take: 6,
    }),
  ])

  const activeSummaries = loopSummaryFromTasks(activeTasks)
  for (const task of activeTasks) {
    if (!loopTimers.has(task.id)) {
      scheduleTask(task.id, 0)
    }
  }

  return {
    activeRun: activeSummaries[0] || null,
    recentRuns: loopSummaryFromTasks(recentTasks),
  }
}

export async function startQuartermasterLoop(
  args: StartQuartermasterLoopArgs,
): Promise<QuartermasterLoopStatus> {
  const prompt = asString(args.prompt)
  if (!prompt) {
    throw new Error("prompt required")
  }

  const state = await ensureShipQuartermaster({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })
  if (!state.session) {
    throw new Error("Quartermaster session unavailable")
  }

  const currentControl = state.quartermaster
  const executionLevel = parseQuartermasterExecutionLevel(
    args.executionLevel,
    currentControl.executionLevel,
  )
  const loopDefaults = mergeLoopDefaults(currentControl.loopDefaults, args.loopDefaults)

  const activeTasks = await findLoopTasks({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    activeOnly: true,
    take: 10,
  })
  if (activeTasks.length > 0) {
    await stopTasks(activeTasks, "replaced_by_new_run")
  }

  const nowIso = new Date().toISOString()
  const loopMetadata: QuartermasterLoopTaskMetadata = {
    version: LOOP_VERSION,
    shipDeploymentId: args.shipDeploymentId,
    sessionId: state.session.id,
    prompt,
    executionLevel,
    loopDefaults,
    iterationCount: 0,
    failureCount: 0,
    startedAt: nowIso,
    updatedAt: nowIso,
    lastIterationAt: null,
    lastError: null,
    lastInteractionId: null,
    lastResponseInteractionId: null,
    stopRequested: false,
    status: "running",
    stopReason: null,
  }

  const task = await prisma.task.create({
    data: {
      sessionId: state.session.id,
      name: `Quartermaster Loop · ${state.ship.name}`,
      status: "running",
      strategy: "background_agent",
      permissionMode: executionLevel,
      metadata: withQuartermasterLoopMetadata({
        existingMetadata: null,
        loop: loopMetadata,
      }),
    },
  })

  scheduleTask(task.id, 0)
  return getQuartermasterLoopStatus({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })
}

export async function stopQuartermasterLoop(
  args: StopQuartermasterLoopArgs,
): Promise<QuartermasterLoopStatus> {
  const activeTasks = await findLoopTasks({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
    activeOnly: true,
    take: 10,
  })
  if (activeTasks.length > 0) {
    await stopTasks(activeTasks, "manual_stop")
  }

  return getQuartermasterLoopStatus({
    userId: args.userId,
    shipDeploymentId: args.shipDeploymentId,
  })
}
