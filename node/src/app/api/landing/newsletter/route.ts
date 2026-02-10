import crypto from "node:crypto"
import { NextRequest } from "next/server"
import { headers } from "next/headers"
import type { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { isLandingXoEnabled } from "@/lib/landing/feature"
import { emitTrace } from "@/lib/observability"
import { prisma } from "@/lib/prisma"
import {
  landingErrorJson,
  landingFeatureDisabledJson,
  landingJson,
} from "../http"

export const dynamic = "force-dynamic"

interface LandingNewsletterRequestBody {
  email: string
  name?: string
}

type TraceEmitInput = Parameters<typeof emitTrace>[0]

type SessionShape = {
  session: { id: string | null }
  user: { id: string; email?: string | null }
} | null

export interface LandingNewsletterRouteDeps {
  env: NodeJS.ProcessEnv
  getSession: () => Promise<SessionShape>
  upsertNewsletter: (input: { email: string; userId?: string; source: string; metadata: Record<string, unknown> }) => Promise<void>
  sendWelcome: (input: { email: string; name?: string | null; env: NodeJS.ProcessEnv }) => Promise<"sent" | "skipped" | "failed">
  emitTrace: (input: TraceEmitInput) => Promise<void>
  createTraceId: () => string
}

async function sendNewsletterWelcomeEmail(input: {
  email: string
  name?: string | null
  env: NodeJS.ProcessEnv
}): Promise<"sent" | "skipped" | "failed"> {
  const apiKey = input.env.RESEND_API_KEY
  const fromEmail = input.env.RESEND_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    return "skipped"
  }

  const userName = input.name?.trim() || "there"
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.email],
        subject: "You are on the OrchWiz XO list",
        html: `<p>Welcome aboard, ${userName}. XO will send short bridge updates.</p>`,
        text: `Welcome aboard, ${userName}. XO will send short bridge updates.`,
      }),
    })

    if (!response.ok) {
      return "failed"
    }

    return "sent"
  } catch {
    return "failed"
  }
}

const defaultDeps: LandingNewsletterRouteDeps = {
  env: process.env,
  getSession: async () => auth.api.getSession({ headers: await headers() }) as Promise<SessionShape>,
  upsertNewsletter: async ({ email, userId, source, metadata }) => {
    await prisma.newsletterSubscription.upsert({
      where: {
        email,
      },
      create: {
        email,
        userId: userId || null,
        source,
        status: "subscribed",
        metadata: metadata as Prisma.InputJsonValue,
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
      update: {
        userId: userId || null,
        source,
        status: "subscribed",
        metadata: metadata as Prisma.InputJsonValue,
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
    })
  },
  sendWelcome: sendNewsletterWelcomeEmail,
  emitTrace,
  createTraceId: () => crypto.randomUUID(),
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.length === 0) {
    return null
  }
  return normalized
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeBody(body: Record<string, unknown>): { ok: true; value: LandingNewsletterRequestBody } | { ok: false; error: string } {
  const email = normalizeEmail(body.email)
  if (!email) {
    return {
      ok: false,
      error: "email is required",
    }
  }
  if (!isEmailLike(email)) {
    return {
      ok: false,
      error: "email must be a valid email address",
    }
  }

  return {
    ok: true,
    value: {
      email,
      name: normalizeName(body.name) || undefined,
    },
  }
}

async function emitLandingTraceSafe(
  deps: LandingNewsletterRouteDeps,
  input: TraceEmitInput,
): Promise<void> {
  try {
    await deps.emitTrace({
      ...input,
      skipEncryption: true,
    })
  } catch (error) {
    console.error("landing_xo_newsletter_trace_failed", {
      traceId: input.traceId,
      source: input.source,
      message: error instanceof Error ? error.message : "unknown",
    })
  }
}

export async function handlePostNewsletter(
  request: NextRequest,
  deps: LandingNewsletterRouteDeps = defaultDeps,
) {
  const body = asRecord(await request.json().catch(() => ({})))
  const normalized = normalizeBody(body)
  const traceId = deps.createTraceId()

  if (!isLandingXoEnabled(deps.env)) {
    await emitLandingTraceSafe(deps, {
      traceId,
      source: "landing.xo.newsletter",
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
      source: "landing.xo.newsletter",
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
  await deps.upsertNewsletter({
    email: normalized.value.email,
    userId: session?.user.id,
    source: "landing_xo_newsletter",
    metadata: {
      flow: "landing_newsletter",
      hasSession: Boolean(session),
    },
  })
  const welcome = await deps.sendWelcome({
    email: normalized.value.email,
    name: normalized.value.name,
    env: deps.env,
  })

  const output = {
    subscribed: true,
    email: normalized.value.email,
    welcome,
  }

  await emitLandingTraceSafe(deps, {
    traceId,
    userId: session?.user.id,
    sessionId: session?.session.id,
    source: "landing.xo.newsletter",
    status: "success",
    payload: {
      input: normalized.value,
      output,
    },
  })

  return landingJson(output, 200, deps.env)
}

export async function POST(request: NextRequest) {
  return handlePostNewsletter(request)
}
