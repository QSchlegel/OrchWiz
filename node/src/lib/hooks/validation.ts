import {
  configuredHookWebhookTargetAllowlist,
  isHookWebhookProtocolAllowed,
  isHookWebhookTargetAllowed,
  parseHookWebhookUrl,
} from "@/lib/hooks/allowlist"
import type { PostToolUseEventInput, PostToolUseStatus } from "@/lib/hooks/types"

export type HookTypeValue = "command" | "script" | "webhook"

export interface ParsedHookCreateInput {
  name: string
  matcher: string
  type: HookTypeValue
  command: string
  isActive: boolean
}

export interface ParsedHookUpdateInput {
  name?: string
  matcher?: string
  type?: HookTypeValue
  command?: string
  isActive?: boolean
}

export interface ParsedTriggerBody {
  toolName: string
  status: PostToolUseStatus
  sessionId: string | null
  userId: string | null
  toolUseId: string | null
  durationMs: number | null
  input: unknown
  output: unknown
  error: unknown
  metadata: Record<string, unknown>
  occurredAt: Date
}

export class HookValidationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "HookValidationError"
    this.status = status
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) {
    return value
  }

  return undefined
}

function parseHookType(value: unknown): HookTypeValue {
  if (value === "command" || value === "script" || value === "webhook") {
    return value
  }

  throw new HookValidationError("type must be command, script, or webhook.")
}

export function assertValidMatcherPattern(matcher: string): void {
  try {
    // Validate user-supplied regex pattern eagerly to avoid runtime failures.
    // eslint-disable-next-line no-new
    new RegExp(matcher)
  } catch {
    throw new HookValidationError("matcher must be a valid regular expression.")
  }
}

function parseWebhookTarget(commandValue: unknown, webhookUrlValue: unknown): string {
  const webhookUrl = asNonEmptyString(webhookUrlValue)
  const command = asNonEmptyString(commandValue)
  const targetCandidate = webhookUrl || command

  if (!targetCandidate) {
    throw new HookValidationError("webhookUrl is required when type is webhook.")
  }

  let parsedTarget: URL
  try {
    parsedTarget = parseHookWebhookUrl(targetCandidate)
  } catch {
    throw new HookValidationError("webhookUrl must be a valid URL.")
  }

  if (!isHookWebhookProtocolAllowed(parsedTarget)) {
    throw new HookValidationError("webhookUrl must use https unless the host is loopback (localhost/127.0.0.1/::1).")
  }

  const allowlist = configuredHookWebhookTargetAllowlist()
  if (!isHookWebhookTargetAllowed(parsedTarget.toString(), allowlist)) {
    throw new HookValidationError(`webhookUrl host is not allowed by HOOK_WEBHOOK_TARGET_ALLOWLIST (${allowlist.join(", ")}).`)
  }

  return parsedTarget.toString()
}

export function parseHookCreateInput(input: unknown): ParsedHookCreateInput {
  const record = asRecord(input)

  const name = asNonEmptyString(record.name)
  const matcher = asNonEmptyString(record.matcher)
  const type = parseHookType(record.type)

  if (!name || !matcher) {
    throw new HookValidationError("Name and matcher are required.")
  }

  assertValidMatcherPattern(matcher)

  let command: string
  if (type === "webhook") {
    command = parseWebhookTarget(record.command, record.webhookUrl)
  } else {
    command = asNonEmptyString(record.command) || ""
    if (!command) {
      throw new HookValidationError("command is required for command/script hooks.")
    }
  }

  return {
    name,
    matcher,
    type,
    command,
    isActive: asOptionalBoolean(record.isActive) ?? true,
  }
}

export function parseHookUpdateInput(
  input: unknown,
  existing: { type: HookTypeValue },
): ParsedHookUpdateInput {
  const record = asRecord(input)
  const nextType = record.type === undefined ? existing.type : parseHookType(record.type)
  const update: ParsedHookUpdateInput = {}

  if (record.name !== undefined) {
    const name = asNonEmptyString(record.name)
    if (!name) {
      throw new HookValidationError("name must be a non-empty string when provided.")
    }
    update.name = name
  }

  if (record.matcher !== undefined) {
    const matcher = asNonEmptyString(record.matcher)
    if (!matcher) {
      throw new HookValidationError("matcher must be a non-empty string when provided.")
    }
    assertValidMatcherPattern(matcher)
    update.matcher = matcher
  }

  if (record.type !== undefined) {
    update.type = nextType
  }

  const hasCommandField = Object.prototype.hasOwnProperty.call(record, "command")
  const hasWebhookUrlField = Object.prototype.hasOwnProperty.call(record, "webhookUrl")
  if (nextType === "webhook") {
    if (hasCommandField || hasWebhookUrlField) {
      update.command = parseWebhookTarget(record.command, record.webhookUrl)
    } else if (existing.type !== "webhook" && record.type !== undefined) {
      throw new HookValidationError("webhookUrl is required when changing type to webhook.")
    }
  } else if (hasCommandField) {
    const command = asNonEmptyString(record.command)
    if (!command) {
      throw new HookValidationError("command must be a non-empty string when provided.")
    }
    update.command = command
  }

  const isActive = asOptionalBoolean(record.isActive)
  if (isActive !== undefined) {
    update.isActive = isActive
  }

  return update
}

function parseStatus(value: unknown): PostToolUseStatus {
  if (value === "completed" || value === "failed" || value === "blocked") {
    return value
  }

  throw new HookValidationError("status must be completed, failed, or blocked.")
}

function parseDurationMs(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HookValidationError("durationMs must be a non-negative number when provided.")
  }

  return Math.round(parsed)
}

function parseOccurredAt(value: unknown): Date {
  if (value === undefined || value === null || value === "") {
    return new Date()
  }

  if (typeof value === "number") {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new HookValidationError("occurredAt must be a valid timestamp when provided.")
    }
    return date
  }

  if (typeof value === "string") {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      throw new HookValidationError("occurredAt must be a valid ISO datetime when provided.")
    }
    return date
  }

  throw new HookValidationError("occurredAt must be a string or number when provided.")
}

export function parsePostToolUseTriggerBody(input: unknown): ParsedTriggerBody {
  const record = asRecord(input)

  const toolName = asNonEmptyString(record.toolName)
  if (!toolName) {
    throw new HookValidationError("toolName is required.")
  }

  const sessionId = asNonEmptyString(record.sessionId)
  const userId = asNonEmptyString(record.userId)
  const toolUseId = asNonEmptyString(record.toolUseId)

  return {
    toolName,
    status: parseStatus(record.status),
    sessionId,
    userId,
    toolUseId,
    durationMs: parseDurationMs(record.durationMs),
    input: record.input,
    output: record.output,
    error: record.error,
    metadata: asRecord(record.metadata),
    occurredAt: parseOccurredAt(record.occurredAt),
  }
}

export function normalizePostToolUseEvent(input: PostToolUseEventInput): PostToolUseEventInput {
  return {
    ...input,
    toolName: input.toolName.trim(),
    sessionId: asNonEmptyString(input.sessionId),
    toolUseId: asNonEmptyString(input.toolUseId),
    durationMs: input.durationMs === null || input.durationMs === undefined ? null : Math.max(0, Math.round(input.durationMs)),
    metadata: asRecord(input.metadata),
    occurredAt: input.occurredAt || new Date(),
  }
}
