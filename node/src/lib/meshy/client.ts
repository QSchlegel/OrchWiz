/**
 * Server-only Meshy API client for Text-to-3D. Use MESHY_API_KEY in env.
 * @see https://docs.meshy.ai/api/text-to-3d
 */

import type { BridgeCrewRole } from "@/lib/shipyard/bridge-crew"
import { BRIDGE_CREW_ROLE_ORDER } from "@/lib/shipyard/bridge-crew"

const MESHY_BASE = "https://api.meshy.ai/openapi/v2"
const POLL_INTERVAL_MS = 4000
const POLL_MAX_ATTEMPTS = 120 // ~8 min

export function meshyApiKey(): string | null {
  const key = process.env.MESHY_API_KEY
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return null
  }
  return key.trim()
}

export function meshyEnabled(): boolean {
  return meshyApiKey() !== null
}

export interface MeshyTextTo3DCreateResponse {
  result: string // task_id
}

export interface MeshyTaskResult {
  id: string
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED"
  model_urls?: {
    glb?: string
    fbx?: string
    obj?: string
    mtl?: string
    usdz?: string
  }
  task_error?: { message?: string }
  progress?: number
}

async function meshyFetch<T>(
  path: string,
  options: RequestInit & { parseJson?: boolean } = {},
): Promise<{ ok: boolean; status: number; data?: T; text?: string }> {
  const key = meshyApiKey()
  if (!key) {
    return { ok: false, status: 503, text: "MESHY_API_KEY not configured" }
  }

  const { parseJson = true, ...init } = options
  const res = await fetch(`${MESHY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })

  const text = await res.text()
  let data: T | undefined
  if (parseJson && text) {
    try {
      data = JSON.parse(text) as T
    } catch {
      // leave data undefined
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    text,
  }
}

/**
 * Create a Text-to-3D preview task. Returns task_id or throws.
 */
export async function createTextTo3DTask(prompt: string): Promise<string> {
  const res = await meshyFetch<MeshyTextTo3DCreateResponse>("/text-to-3d", {
    method: "POST",
    body: JSON.stringify({
      mode: "preview",
      prompt: prompt.slice(0, 600),
      ai_model: "latest",
      target_polycount: 15000,
    }),
  })

  if (!res.ok) {
    const msg = res.data && "detail" in res.data
      ? String((res.data as { detail?: unknown }).detail)
      : res.text || `HTTP ${res.status}`
    throw new Error(`Meshy create task failed: ${msg}`)
  }

  const taskId = res.data?.result
  if (!taskId || typeof taskId !== "string") {
    throw new Error("Meshy response missing result task_id")
  }
  return taskId
}

/**
 * Get current task result (status and optional model_urls).
 */
export async function getTaskResult(taskId: string): Promise<MeshyTaskResult | null> {
  const res = await meshyFetch<MeshyTaskResult>(`/text-to-3d/${encodeURIComponent(taskId)}`, {
    method: "GET",
  })

  if (!res.ok) {
    if (res.status === 404) return null
    const msg = res.text || `HTTP ${res.status}`
    throw new Error(`Meshy get task failed: ${msg}`)
  }

  return res.data ?? null
}

/**
 * Poll until task reaches a terminal state; returns final result with modelUrl (glb) if succeeded.
 */
export async function waitForTaskResult(taskId: string): Promise<{
  status: MeshyTaskResult["status"]
  modelUrl: string | null
  taskError?: string
}> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const task = await getTaskResult(taskId)
    if (!task) {
      return { status: "FAILED", modelUrl: null, taskError: "Task not found" }
    }

    const status = task.status
    if (status === "SUCCEEDED") {
      const glb = task.model_urls?.glb
      return {
        status: "SUCCEEDED",
        modelUrl: typeof glb === "string" && glb.trim().length > 0 ? glb.trim() : null,
      }
    }
    if (status === "FAILED" || status === "CANCELED") {
      return {
        status,
        modelUrl: null,
        taskError: task.task_error?.message ?? undefined,
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  return {
    status: "FAILED",
    modelUrl: null,
    taskError: "Polling timeout",
  }
}

/** Role-specific prompts for bridge crew character generation (stylized, humanoid, toon). */
export const MESHY_PROMPTS_BY_ROLE: Record<BridgeCrewRole, string> = {
  xo: "sci-fi bridge officer, humanoid, executive officer, stylized toon, standing, uniform",
  ops: "sci-fi bridge officer, humanoid, operations specialist, stylized toon, standing, uniform",
  eng: "sci-fi bridge officer, humanoid, engineer, stylized toon, standing, uniform",
  sec: "sci-fi bridge officer, humanoid, security officer, stylized toon, standing, uniform",
  med: "sci-fi bridge officer, humanoid, medical officer, stylized toon, standing, uniform",
  cou: "sci-fi bridge officer, humanoid, communications officer, stylized toon, standing, uniform",
}

export function getPromptForRole(role: BridgeCrewRole): string {
  return MESHY_PROMPTS_BY_ROLE[role] ?? `sci-fi bridge officer, humanoid, stylized toon, standing`
}

export function getAllRoles(): BridgeCrewRole[] {
  return [...BRIDGE_CREW_ROLE_ORDER]
}
