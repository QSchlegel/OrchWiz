import type { AgentLightningConfig } from "./config"

export interface AgentLightningResourcesLatest {
  resourcesId: string | null
  resources: unknown[]
}

export interface AgentLightningRolloutStartResult {
  rollout_id: string
  attempt_id: string
}

export type AgentLightningAttemptTerminalStatus = "succeeded" | "failed"

type FetchLike = typeof fetch

let unreachableUntilEpochMs = 0

export function resetAgentLightningCircuitBreakerForTests() {
  unreachableUntilEpochMs = 0
}

function isCircuitOpen(): boolean {
  return unreachableUntilEpochMs > Date.now()
}

function openCircuit(backoffMs: number) {
  unreachableUntilEpochMs = Math.max(unreachableUntilEpochMs, Date.now() + backoffMs)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string })?.name === "AbortError"
}

function isNetworkError(error: unknown): boolean {
  // In undici/fetch, network/connection failures are typically surfaced as TypeError("fetch failed").
  return error instanceof TypeError
}

function shouldTripCircuitBreaker(error: unknown): boolean {
  return isAbortError(error) || isNetworkError(error)
}

export class AgentLightningClient {
  private config: AgentLightningConfig
  private fetchImpl: FetchLike

  constructor(config: AgentLightningConfig, fetchImpl?: FetchLike) {
    this.config = config
    this.fetchImpl = fetchImpl || fetch
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  isEnabledForAgentSync(): boolean {
    return this.config.enabled && this.config.agentSyncEnabled
  }

  private async requestJson(path: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: unknown | null }> {
    if (!this.config.enabled) {
      return { ok: false, status: 0, json: null }
    }

    if (isCircuitOpen()) {
      return { ok: false, status: 0, json: null }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await this.fetchImpl(`${this.config.storeUrl}${path}`, {
        ...init,
        signal: controller.signal,
      })

      const contentType = response.headers.get("content-type") || ""
      const isJson = contentType.toLowerCase().includes("application/json")
      const json = isJson ? await response.json().catch(() => null) : null

      return { ok: response.ok, status: response.status, json }
    } catch (error) {
      if (shouldTripCircuitBreaker(error)) {
        openCircuit(this.config.failOpenBackoffMs)
      }
      return { ok: false, status: 0, json: null }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async health(): Promise<boolean> {
    const response = await this.requestJson("/v1/agl/health", {
      method: "GET",
    })
    return response.ok
  }

  async getLatestResources(): Promise<AgentLightningResourcesLatest | null> {
    const response = await this.requestJson("/v1/agl/resources/latest", {
      method: "GET",
    })

    if (!response.ok || !response.json) {
      return null
    }

    const payload = asRecord(response.json)
    const update = asRecord(payload.resources_update ?? payload.resourcesUpdate ?? payload.update ?? payload)
    const resources = Array.isArray(update.resources)
      ? update.resources
      : Array.isArray(payload.resources)
        ? payload.resources
        : []

    const resourcesId = asString(update.resources_id ?? update.resourcesId ?? update.id ?? payload.resources_id ?? payload.resourcesId) || null

    return {
      resourcesId,
      resources,
    }
  }

  async startRollout(input: Record<string, unknown>): Promise<AgentLightningRolloutStartResult | null> {
    const response = await this.requestJson("/v1/agl/rollouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
      }),
    })

    if (!response.ok || !response.json) {
      return null
    }

    const payload = asRecord(response.json)
    const rolloutId = asString(payload.rollout_id ?? payload.rolloutId)
    const attempt = asRecord(payload.attempt)
    const attemptId = asString(attempt.attempt_id ?? attempt.attemptId) || asString(payload.attempt_id ?? payload.attemptId)

    if (!rolloutId || !attemptId) {
      return null
    }

    return {
      rollout_id: rolloutId,
      attempt_id: attemptId,
    }
  }

  async nextSpanSequenceId(args: { rollout_id: string; attempt_id: string }): Promise<number | null> {
    const response = await this.requestJson("/v1/agl/spans/next", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rollout_id: args.rollout_id,
        attempt_id: args.attempt_id,
      }),
    })

    if (!response.ok || !response.json) {
      return null
    }

    const payload = asRecord(response.json)
    return (
      asNumber(payload.span_sequence_id)
      ?? asNumber(payload.spanSequenceId)
      ?? asNumber(payload.sequence_id)
      ?? asNumber(payload.sequenceId)
      ?? null
    )
  }

  async addSpan(span: Record<string, unknown>): Promise<boolean> {
    const response = await this.requestJson("/v1/agl/spans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(span),
    })

    return response.ok
  }

  async updateAttemptTerminal(args: {
    rollout_id: string
    attempt_id: string
    status: AgentLightningAttemptTerminalStatus
  }): Promise<boolean> {
    const response = await this.requestJson(`/v1/agl/rollouts/${args.rollout_id}/attempts/${args.attempt_id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: args.status,
        terminal: true,
        ended_at_iso: new Date().toISOString(),
      }),
    })

    return response.ok
  }
}

