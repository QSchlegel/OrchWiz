import { prisma } from "@/lib/prisma"
import type {
  HookExecutionSummary,
  PostToolUseEvent,
  PostToolUseEventInput,
  PostToolUseHookRunResult,
} from "@/lib/hooks/types"
import { normalizePostToolUseEvent } from "@/lib/hooks/validation"

export interface HookRecord {
  id: string
  name: string
  matcher: string
  type: string
  command: string
}

export interface HookExecutionPersistInput {
  hookId: string
  sessionId: string | null
  toolUseId: string | null
  status: "completed" | "failed"
  output: string | null
  error: string | null
  durationMs: number
  event: PostToolUseEvent
}

export interface PostToolUseHookRunnerDeps {
  findActiveWebhookHooks: (ownerUserId: string) => Promise<HookRecord[]>
  persistExecution: (input: HookExecutionPersistInput) => Promise<void>
  fetchFn: typeof fetch
  timeoutMs: () => number
  now: () => number
}

function hookWebhookTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.HOOK_WEBHOOK_TIMEOUT_MS || "8000", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 8000
  }

  return parsed
}

function truncateText(value: string, maxLength = 4000): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength)}...`
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return String(error)
}

function toSerializableJsonValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }

    return value === undefined ? null : String(value)
  }
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(toSerializableJsonValue(value), null, 2)
  } catch {
    return String(value)
  }
}

function hookMatchesToolName(hook: HookRecord, toolName: string): boolean {
  try {
    return new RegExp(hook.matcher).test(toolName)
  } catch {
    return false
  }
}

function buildHookWebhookPayload(hook: HookRecord, event: PostToolUseEvent) {
  return {
    event: "post_tool_use.v1",
    occurredAt: event.occurredAt.toISOString(),
    hook: {
      id: hook.id,
      name: hook.name,
      matcher: hook.matcher,
      type: hook.type,
    },
    toolUse: {
      toolName: event.toolName,
      status: event.status,
      sessionId: event.sessionId,
      toolUseId: event.toolUseId,
      durationMs: event.durationMs,
      input: toSerializableJsonValue(event.input),
      output: toSerializableJsonValue(event.output),
      error: toSerializableJsonValue(event.error),
      metadata: toSerializableJsonValue(event.metadata),
    },
  }
}

async function postWebhook(args: {
  hook: HookRecord
  event: PostToolUseEvent
  fetchFn: typeof fetch
  timeoutMs: number
}): Promise<{
  status: "completed" | "failed"
  output: string | null
  error: string | null
}> {
  const payload = buildHookWebhookPayload(args.hook, args.event)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs)

  try {
    const response = await args.fetchFn(args.hook.command, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "OrchWiz-Hooks/1.0",
        "X-OrchWiz-Hook-Id": args.hook.id,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const responseText = await response.text().catch(() => "")
    const summarizedResponse = truncateText(responseText || `HTTP ${response.status}`)

    if (!response.ok) {
      return {
        status: "failed",
        output: summarizedResponse,
        error: `Webhook request failed with status ${response.status}`,
      }
    }

    return {
      status: "completed",
      output: summarizedResponse,
      error: null,
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return {
        status: "failed",
        output: null,
        error: `Webhook request timed out after ${args.timeoutMs}ms`,
      }
    }

    return {
      status: "failed",
      output: null,
      error: asErrorMessage(error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function recordExecution(args: HookExecutionPersistInput) {
  const outputText =
    args.output ||
    truncateText(
      stringifyJson({
        toolName: args.event.toolName,
        status: args.event.status,
      }),
    )

  await prisma.hookExecution.create({
    data: {
      hookId: args.hookId,
      sessionId: args.sessionId,
      toolUseId: args.toolUseId,
      status: args.status,
      output: outputText,
      error: args.error,
      duration: args.durationMs,
    },
  })
}

const defaultDeps: PostToolUseHookRunnerDeps = {
  findActiveWebhookHooks: (ownerUserId) =>
    prisma.hook.findMany({
      where: {
        ownerUserId,
        isActive: true,
        type: "webhook",
      },
      orderBy: {
        createdAt: "asc",
      },
    } as any) as unknown as Promise<HookRecord[]>,
  persistExecution: (input) => recordExecution(input),
  fetchFn: (input, init) => fetch(input, init),
  timeoutMs: () => hookWebhookTimeoutMs(),
  now: () => Date.now(),
}

export async function runPostToolUseHooks(
  input: PostToolUseEventInput,
  deps: PostToolUseHookRunnerDeps = defaultDeps,
): Promise<PostToolUseHookRunResult> {
  const normalizedInput = normalizePostToolUseEvent(input)

  const ownerUserId = normalizedInput.ownerUserId?.trim()
  const toolName = normalizedInput.toolName?.trim()
  if (!ownerUserId || !toolName) {
    return {
      matchedHooks: 0,
      delivered: 0,
      failed: 0,
      executions: [],
    }
  }

  const event: PostToolUseEvent = {
    ownerUserId,
    toolName,
    status: normalizedInput.status,
    sessionId: normalizedInput.sessionId || null,
    toolUseId: normalizedInput.toolUseId || null,
    durationMs: normalizedInput.durationMs ?? null,
    input: normalizedInput.input,
    output: normalizedInput.output,
    error: normalizedInput.error,
    metadata: normalizedInput.metadata || {},
    occurredAt: normalizedInput.occurredAt || new Date(),
  }

  const hooks = await deps.findActiveWebhookHooks(ownerUserId)

  const result: PostToolUseHookRunResult = {
    matchedHooks: 0,
    delivered: 0,
    failed: 0,
    executions: [],
  }

  for (const hook of hooks) {
    if (!hookMatchesToolName(hook, event.toolName)) {
      continue
    }

    result.matchedHooks += 1
    const startedAt = deps.now()
    const delivery = await postWebhook({
      hook,
      event,
      fetchFn: deps.fetchFn,
      timeoutMs: deps.timeoutMs(),
    })
    const durationMs = Math.max(0, deps.now() - startedAt)

    try {
      await deps.persistExecution({
        hookId: hook.id,
        sessionId: event.sessionId,
        toolUseId: event.toolUseId,
        status: delivery.status,
        output: delivery.output,
        error: delivery.error,
        durationMs,
        event,
      })
    } catch (persistError) {
      console.error("Failed to persist hook execution log:", persistError)
    }

    if (delivery.status === "completed") {
      result.delivered += 1
    } else {
      result.failed += 1
    }

    const summary: HookExecutionSummary = {
      hookId: hook.id,
      hookName: hook.name,
      status: delivery.status,
      durationMs,
      error: delivery.error,
    }
    result.executions.push(summary)
  }

  return result
}
