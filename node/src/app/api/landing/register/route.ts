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

interface LandingRegisterRequestBody {
  email?: string
  name?: string
  newsletterOptIn: boolean
}

type TraceEmitInput = Parameters<typeof emitTrace>[0]

interface LandingUserProfile {
  id: string
  email: string
  name: string | null
  isAnonymous: boolean
}

type SessionShape = {
  session: { id: string | null }
  user: { id: string; email?: string | null }
} | null

export interface LandingRegisterRouteDeps {
  env: NodeJS.ProcessEnv
  getSession: () => Promise<SessionShape>
  hasPasskey: (userId: string) => Promise<boolean>
  getUser: (userId: string) => Promise<LandingUserProfile | null>
  updateUser: (userId: string, data: Prisma.UserUpdateInput) => Promise<LandingUserProfile>
  emailInUse: (email: string, currentUserId: string) => Promise<boolean>
  upsertNewsletter: (input: { email: string; userId: string; source: string; metadata: Record<string, unknown> }) => Promise<void>
  sendWelcome: (input: { email: string; name?: string | null; env: NodeJS.ProcessEnv }) => Promise<"sent" | "skipped" | "failed">
  emitTrace: (input: TraceEmitInput) => Promise<void>
  createTraceId: () => string
}

const defaultDeps: LandingRegisterRouteDeps = {
  env: process.env,
  getSession: async () => auth.api.getSession({ headers: await headers() }) as Promise<SessionShape>,
  hasPasskey: async (userId: string) => {
    const count = await prisma.passkey.count({ where: { userId } })
    return count > 0
  },
  getUser: async (userId: string) => prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      isAnonymous: true,
    },
  }),
  updateUser: async (userId, data) => prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      isAnonymous: true,
    },
  }),
  emailInUse: async (email, currentUserId) => {
    const existing = await prisma.user.findFirst({
      where: {
        email,
        id: {
          not: currentUserId,
        },
      },
      select: {
        id: true,
      },
    })
    return Boolean(existing)
  },
  upsertNewsletter: async ({ email, userId, source, metadata }) => {
    await prisma.newsletterSubscription.upsert({
      where: {
        email,
      },
      create: {
        email,
        userId,
        source,
        status: "subscribed",
        metadata: metadata as Prisma.InputJsonValue,
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
      update: {
        userId,
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
  return normalized.length > 0 ? normalized : null
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null
}

function normalizeNewsletterOptIn(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value
  }
  return true
}

function normalizeBody(body: Record<string, unknown>): { ok: true; value: LandingRegisterRequestBody } | { ok: false; error: string } {
  const email = normalizeEmail(body.email)
  if (email && !isEmailLike(email)) {
    return {
      ok: false,
      error: "email must be a valid email address",
    }
  }

  return {
    ok: true,
    value: {
      email: email || undefined,
      name: normalizeName(body.name) || undefined,
      newsletterOptIn: normalizeNewsletterOptIn(body.newsletterOptIn),
    },
  }
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
  const subject = "Welcome to the OrchWiz landing brief"
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="margin: 0 0 12px;">Welcome aboard, ${userName}</h2>
      <p>You are subscribed to lightweight launch updates from XO.</p>
      <p>Need tactical docs? Start at <a href="${input.env.NEXT_PUBLIC_APP_URL || input.env.BETTER_AUTH_URL || "http://localhost:3000"}/docs">/docs</a>.</p>
    </div>
  `
  const text = `Welcome aboard, ${userName}. You are subscribed to OrchWiz landing updates.`

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
        subject,
        html,
        text,
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

async function emitLandingTraceSafe(
  deps: LandingRegisterRouteDeps,
  input: TraceEmitInput,
): Promise<void> {
  try {
    await deps.emitTrace({
      ...input,
      skipEncryption: true,
    })
  } catch (error) {
    console.error("landing_xo_register_trace_failed", {
      traceId: input.traceId,
      source: input.source,
      message: error instanceof Error ? error.message : "unknown",
    })
  }
}

export async function handlePostRegister(
  request: NextRequest,
  deps: LandingRegisterRouteDeps = defaultDeps,
) {
  const body = asRecord(await request.json().catch(() => ({})))
  const normalized = normalizeBody(body)
  const traceId = deps.createTraceId()

  if (!isLandingXoEnabled(deps.env)) {
    await emitLandingTraceSafe(deps, {
      traceId,
      source: "landing.xo.register",
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
      source: "landing.xo.register",
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
      source: "landing.xo.register",
      status: "unauthorized",
      payload: {
        input: normalized.value,
        output: {
          error: "Passkey registration required.",
        },
      },
    })
    return landingErrorJson(
      "Sign in with passkey first.",
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
      source: "landing.xo.register",
      status: "passkey_required",
      payload: {
        input: normalized.value,
        output: {
          error: "Passkey registration required.",
        },
      },
    })
    return landingErrorJson(
      "Add a passkey before completing registration.",
      403,
      { code: "PASSKEY_REQUIRED" },
      deps.env,
    )
  }

  const existingUser = await deps.getUser(session.user.id)
  if (!existingUser) {
    await emitLandingTraceSafe(deps, {
      traceId,
      userId: session.user.id,
      sessionId: session.session.id,
      source: "landing.xo.register",
      status: "user_missing",
      payload: {
        input: normalized.value,
        output: {
          error: "User not found",
        },
      },
    })
    return landingErrorJson("User not found.", 404, { code: "USER_NOT_FOUND" }, deps.env)
  }

  if (normalized.value.email) {
    const alreadyTaken = await deps.emailInUse(normalized.value.email, existingUser.id)
    if (alreadyTaken) {
      await emitLandingTraceSafe(deps, {
        traceId,
        userId: session.user.id,
        sessionId: session.session.id,
        source: "landing.xo.register",
        status: "email_conflict",
        payload: {
          input: normalized.value,
          output: {
            error: "Email already exists.",
          },
        },
      })
      return landingErrorJson(
        "That email is already linked to another account.",
        409,
        { code: "EMAIL_CONFLICT" },
        deps.env,
      )
    }
  }

  const updateData: Prisma.UserUpdateInput = {}
  if (normalized.value.email) {
    updateData.email = normalized.value.email
    updateData.isAnonymous = false
  }
  if (normalized.value.name) {
    updateData.name = normalized.value.name
  }

  const updatedUser = Object.keys(updateData).length > 0
    ? await deps.updateUser(existingUser.id, updateData)
    : existingUser

  let newsletter = {
    optedIn: normalized.value.newsletterOptIn,
    status: "skipped" as "subscribed" | "requires_email" | "skipped",
    email: null as string | null,
    welcome: "skipped" as "sent" | "skipped" | "failed",
  }

  if (normalized.value.newsletterOptIn) {
    const newsletterEmail = normalized.value.email || (updatedUser.isAnonymous ? null : updatedUser.email)

    if (!newsletterEmail) {
      newsletter = {
        optedIn: true,
        status: "requires_email",
        email: null,
        welcome: "skipped",
      }
    } else {
      await deps.upsertNewsletter({
        email: newsletterEmail,
        userId: updatedUser.id,
        source: "landing_xo_register",
        metadata: {
          flow: "landing_register",
        },
      })
      const welcomeResult = await deps.sendWelcome({
        email: newsletterEmail,
        name: updatedUser.name,
        env: deps.env,
      })
      newsletter = {
        optedIn: true,
        status: "subscribed",
        email: newsletterEmail,
        welcome: welcomeResult,
      }
    }
  }

  const output = {
    registered: true,
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      isAnonymous: updatedUser.isAnonymous,
    },
    newsletter,
  }

  await emitLandingTraceSafe(deps, {
    traceId,
    userId: session.user.id,
    sessionId: session.session.id,
    source: "landing.xo.register",
    status: "success",
    payload: {
      input: normalized.value,
      output,
    },
  })

  return landingJson(output, 200, deps.env)
}

export async function POST(request: NextRequest) {
  return handlePostRegister(request)
}
