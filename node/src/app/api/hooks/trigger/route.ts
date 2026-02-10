import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { runPostToolUseHooks } from "@/lib/hooks/runner"
import {
  HookValidationError,
  parsePostToolUseTriggerBody,
} from "@/lib/hooks/validation"
import {
  AccessControlError,
  type AccessActor,
  requireAccessActor,
} from "@/lib/security/access-control"
import type { PostToolUseEventInput, PostToolUseHookRunResult } from "@/lib/hooks/types"

export const dynamic = "force-dynamic"

function parseBearerToken(headerValue: string | null): string | null {
  if (!headerValue) {
    return null
  }

  const match = headerValue.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

async function resolveSessionOwnerUserId(sessionId: string): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: {
      id: sessionId,
    },
    select: {
      userId: true,
    },
  })

  return session?.userId || null
}

export interface HookTriggerRouteDeps {
  expectedBearerToken: () => string | null
  resolveSessionOwnerUserId: (sessionId: string) => Promise<string | null>
  resolveActor: () => Promise<AccessActor>
  runHooks: (input: PostToolUseEventInput) => Promise<PostToolUseHookRunResult>
}

const defaultDeps: HookTriggerRouteDeps = {
  expectedBearerToken: () => {
    const token = process.env.HOOK_TRIGGER_BEARER_TOKEN?.trim()
    return token && token.length > 0 ? token : null
  },
  resolveSessionOwnerUserId,
  resolveActor: () => requireAccessActor(),
  runHooks: (input) => runPostToolUseHooks(input),
}

export async function handlePostTrigger(
  request: NextRequest,
  deps: HookTriggerRouteDeps = defaultDeps,
) {
  try {
    const parsedBody = parsePostToolUseTriggerBody(await request.json().catch(() => ({})))

    const suppliedToken = parseBearerToken(request.headers.get("authorization"))
    const expectedToken = deps.expectedBearerToken()
    const machineMode = Boolean(suppliedToken)

    let actor: AccessActor | null = null
    if (machineMode) {
      if (!expectedToken || suppliedToken !== expectedToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    } else {
      actor = await deps.resolveActor()
    }

    let ownerUserId: string | null = null
    if (machineMode) {
      if (parsedBody.sessionId) {
        const sessionOwnerUserId = await deps.resolveSessionOwnerUserId(parsedBody.sessionId)
        if (!sessionOwnerUserId) {
          return NextResponse.json({ error: "sessionId does not exist" }, { status: 404 })
        }

        if (parsedBody.userId && parsedBody.userId !== sessionOwnerUserId) {
          return NextResponse.json(
            { error: "userId does not match sessionId owner" },
            { status: 400 },
          )
        }

        ownerUserId = parsedBody.userId || sessionOwnerUserId
      } else {
        ownerUserId = parsedBody.userId
      }

      if (!ownerUserId) {
        return NextResponse.json(
          { error: "userId is required when sessionId is not provided in machine mode" },
          { status: 400 },
        )
      }
    } else {
      ownerUserId = actor?.userId || null
      if (!ownerUserId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }

      if (parsedBody.userId && parsedBody.userId !== ownerUserId && !actor?.isAdmin) {
        return NextResponse.json({ error: "userId does not match authenticated user" }, { status: 403 })
      }

      if (parsedBody.sessionId) {
        const sessionOwnerUserId = await deps.resolveSessionOwnerUserId(parsedBody.sessionId)
        if (!sessionOwnerUserId) {
          return NextResponse.json({ error: "sessionId does not exist" }, { status: 404 })
        }

        if (sessionOwnerUserId !== ownerUserId && !actor?.isAdmin) {
          return NextResponse.json({ error: "sessionId does not belong to authenticated user" }, { status: 404 })
        }
      }
    }

    const hookResult = await deps.runHooks({
      ownerUserId,
      toolName: parsedBody.toolName,
      status: parsedBody.status,
      sessionId: parsedBody.sessionId,
      toolUseId: parsedBody.toolUseId,
      durationMs: parsedBody.durationMs,
      input: parsedBody.input,
      output: parsedBody.output,
      error: parsedBody.error,
      metadata: parsedBody.metadata,
      occurredAt: parsedBody.occurredAt,
    })

    return NextResponse.json({
      received: true,
      matchedHooks: hookResult.matchedHooks,
      delivered: hookResult.delivered,
      failed: hookResult.failed,
      executions: hookResult.executions,
    })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof HookValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Error triggering hooks:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return handlePostTrigger(request)
}
