import crypto from "node:crypto"
import { NextRequest } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isLandingXoEnabled } from "@/lib/landing/feature"
import { emitTrace } from "@/lib/observability"
import { prisma } from "@/lib/prisma"
import { resolveXoSlashCommand } from "@/lib/landing/xo-commands"
import {
  landingErrorJson,
  landingFeatureDisabledJson,
  landingJson,
} from "../http"

export const dynamic = "force-dynamic"

interface LandingChatHistoryEntry {
  role: "user" | "assistant"
  content: string
}

interface LandingChatRequestBody {
  prompt: string
  history: LandingChatHistoryEntry[]
}

type TraceEmitInput = Parameters<typeof emitTrace>[0]

type SessionShape = {
  session: { id: string | null }
  user: { id: string; email?: string | null }
} | null

export interface LandingChatRouteDeps {
  env: NodeJS.ProcessEnv
  getSession: () => Promise<SessionShape>
  hasPasskey: (userId: string) => Promise<boolean>
  emitTrace: (input: TraceEmitInput) => Promise<void>
  createTraceId: () => string
}

const defaultDeps: LandingChatRouteDeps = {
  env: process.env,
  getSession: async () => auth.api.getSession({ headers: await headers() }) as Promise<SessionShape>,
  hasPasskey: async (userId: string) => {
    const count = await prisma.passkey.count({ where: { userId } })
    return count > 0
  },
  emitTrace,
  createTraceId: () => crypto.randomUUID(),
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function sanitizePrompt(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().slice(0, 600)
}

function sanitizeHistory(value: unknown): LandingChatHistoryEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .slice(-8)
    .map((entry) => asRecord(entry))
    .map((entry) => {
      const role: "user" | "assistant" = entry.role === "assistant" ? "assistant" : "user"
      return {
        role,
        content: typeof entry.content === "string" ? entry.content.trim().slice(0, 600) : "",
      }
    })
    .filter((entry) => entry.content.length > 0)
}

function buildTeaserReply(inputPrompt: string): string {
  const prompt = inputPrompt.toLowerCase()

  if (prompt.includes("deploy") || prompt.includes("launch")) {
    return "XO: Helm is ready, but this is only a teaser sim. Use /go start for the live launch path."
  }
  if (prompt.includes("security") || prompt.includes("policy")) {
    return "XO: Tactical note, security posture is green enough to proceed. Pull details with /docs passkey."
  }
  if (prompt.includes("docs") || prompt.includes("how")) {
    return "XO: I can hand you concise docs pointers. Try /docs slash-commands or /docs cloud."
  }
  if (prompt.includes("newsletter") || prompt.includes("updates")) {
    return "XO: Broadcast channel available. Use /newsletter and I will open the signup panel."
  }

  return "XO: Bridge chatter acknowledged. I tease mission context only; use /help for next tactical moves."
}

function normalizeBody(body: Record<string, unknown>): { ok: true; value: LandingChatRequestBody } | { ok: false; error: string } {
  const prompt = sanitizePrompt(body.prompt)
  if (!prompt) {
    return {
      ok: false,
      error: "prompt is required",
    }
  }

  return {
    ok: true,
    value: {
      prompt,
      history: sanitizeHistory(body.history),
    },
  }
}

async function emitLandingTraceSafe(
  deps: LandingChatRouteDeps,
  input: TraceEmitInput,
): Promise<void> {
  try {
    await deps.emitTrace({
      ...input,
      skipEncryption: true,
    })
  } catch (error) {
    console.error("landing_xo_chat_trace_failed", {
      traceId: input.traceId,
      source: input.source,
      message: error instanceof Error ? error.message : "unknown",
    })
  }
}

export async function handlePostChat(
  request: NextRequest,
  deps: LandingChatRouteDeps = defaultDeps,
) {
  const body = asRecord(await request.json().catch(() => ({})))
  const normalized = normalizeBody(body)
  const traceId = deps.createTraceId()

  if (!isLandingXoEnabled(deps.env)) {
    await emitLandingTraceSafe(deps, {
      traceId,
      source: "landing.xo.chat",
      status: "disabled",
      payload: {
        input: body,
        output: {
          error: "Landing XO is disabled for this deployment.",
        },
      },
    })
    return landingFeatureDisabledJson(deps.env)
  }

  if (!normalized.ok) {
    await emitLandingTraceSafe(deps, {
      traceId,
      source: "landing.xo.chat",
      status: "validation_error",
      payload: {
        input: body,
        output: {
          error: normalized.error,
        },
      },
    })
    return landingErrorJson(normalized.error, 400, {}, deps.env)
  }

  const session = await deps.getSession()
  if (!session) {
    await emitLandingTraceSafe(deps, {
      traceId,
      source: "landing.xo.chat",
      status: "unauthorized",
      payload: {
        input: normalized.value,
        output: {
          error: "Passkey registration required.",
        },
      },
    })
    return landingErrorJson(
      "Passkey registration required before chat access.",
      401,
      { code: "PASSKEY_REQUIRED" },
      deps.env,
    )
  }

  const passkeyRegistered = await deps.hasPasskey(session.user.id)
  if (!passkeyRegistered) {
    await emitLandingTraceSafe(deps, {
      traceId,
      userId: session.user.id,
      sessionId: session.session.id,
      source: "landing.xo.chat",
      status: "passkey_required",
      payload: {
        input: normalized.value,
        output: {
          error: "Passkey registration required.",
        },
      },
    })
    return landingErrorJson(
      "Add a passkey to unlock XO chat.",
      403,
      { code: "PASSKEY_REQUIRED" },
      deps.env,
    )
  }

  const command = resolveXoSlashCommand(normalized.value.prompt)
  const reply = command ? command.reply : buildTeaserReply(normalized.value.prompt)
  const output = {
    reply,
    provider: "xo-scripted",
    fallback: false,
    mode: command ? "command" : "tease",
    command: command?.command || null,
    action: command?.action || null,
  }

  await emitLandingTraceSafe(deps, {
    traceId,
    userId: session.user.id,
    sessionId: session.session.id,
    source: "landing.xo.chat",
    status: "success",
    payload: {
      input: {
        prompt: normalized.value.prompt,
        history: normalized.value.history,
      },
      output: {
        text: output.reply,
        provider: output.provider,
        fallback: output.fallback,
        mode: output.mode,
        command: output.command,
        action: output.action,
      },
    },
  })

  return landingJson(output, 200, deps.env)
}

export async function POST(request: NextRequest) {
  return handlePostChat(request)
}
