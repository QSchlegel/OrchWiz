import crypto from "node:crypto"

export type AgentLightningSpanStatusCode = "OK" | "ERROR"

export interface AgentLightningSpanStatus {
  status_code: AgentLightningSpanStatusCode
  message?: string
}

export type AgentLightningSpanAttributeValue = string | number | boolean | null

export interface AgentLightningSpan {
  trace_id: string
  span_id: string
  parent_span_id?: string
  name: string
  start_time_unix_nano: string
  end_time_unix_nano: string
  attributes: Record<string, AgentLightningSpanAttributeValue>
  resource: {
    attributes: Record<string, AgentLightningSpanAttributeValue>
  }
  status: AgentLightningSpanStatus
}

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex")
}

export function randomTraceId(): string {
  return randomHex(16)
}

export function randomSpanId(): string {
  return randomHex(8)
}

export function nowUnixNano(): string {
  return String(BigInt(Date.now()) * 1_000_000n)
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function buildAgentLightningSpan(args: {
  rollout_id: string
  attempt_id: string
  span_sequence_id: number
  name: string
  attributes?: Record<string, AgentLightningSpanAttributeValue>
  status_code?: AgentLightningSpanStatusCode
  status_message?: string
  parent_span_id?: string
}): AgentLightningSpan {
  const now = nowUnixNano()
  return {
    trace_id: randomTraceId(),
    span_id: randomSpanId(),
    ...(args.parent_span_id ? { parent_span_id: args.parent_span_id } : {}),
    name: args.name,
    start_time_unix_nano: now,
    end_time_unix_nano: now,
    attributes: {
      ...(args.attributes || {}),
    },
    resource: {
      attributes: {
        "agentlightning.rollout_id": args.rollout_id,
        "agentlightning.attempt_id": args.attempt_id,
        "agentlightning.span_sequence_id": args.span_sequence_id,
      },
    },
    status: {
      status_code: args.status_code || "OK",
      ...(args.status_message ? { message: args.status_message } : {}),
    },
  }
}
