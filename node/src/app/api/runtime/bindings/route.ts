import { NextRequest, NextResponse } from "next/server"
import { AccessControlError, requireAccessActor } from "@/lib/security/access-control"
import {
  RuntimeAdapterRegistryError,
  listRuntimeAdapterBindings,
  upsertBuiltinRuntimeAdapters,
  upsertDefaultRuntimeAdapterBindings,
  upsertRuntimeAdapterBindings,
} from "@/lib/runtime/registry"

export const dynamic = "force-dynamic"

type RuntimeBindingScope = "global" | "profile" | "user" | "deployment" | "subagent"

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

function asScope(value: unknown): RuntimeBindingScope | null {
  if (value === "global" || value === "profile" || value === "user" || value === "deployment" || value === "subagent") {
    return value
  }

  return null
}

function asPriority(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

export async function GET() {
  try {
    const actor = await requireAccessActor()
    await upsertBuiltinRuntimeAdapters()
    await upsertDefaultRuntimeAdapterBindings({
      userId: actor.userId,
    })

    const bindings = await listRuntimeAdapterBindings()
    return NextResponse.json({ bindings })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof RuntimeAdapterRegistryError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to list runtime bindings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireAccessActor()
    await upsertBuiltinRuntimeAdapters()

    const body = asRecord(await request.json().catch(() => ({})))
    const bindingsPayload = Array.isArray(body.bindings) ? body.bindings : []

    const bindings = bindingsPayload.map((entry) => {
      const record = asRecord(entry)
      const adapterId = asString(record.adapterId)
      const scope = asScope(record.scope)
      const scopeKey = asString(record.scopeKey)

      if (!adapterId || !scope || !scopeKey) {
        throw new RuntimeAdapterRegistryError("Each binding requires adapterId, scope, and scopeKey.")
      }

      if (!actor.isAdmin && (scope === "global" || scope === "profile")) {
        throw new RuntimeAdapterRegistryError("Only admins can modify global/profile runtime bindings.", 403)
      }

      return {
        adapterId,
        scope,
        scopeKey,
        priority: asPriority(record.priority),
        enabled: record.enabled !== false,
        metadata:
          record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
            ? record.metadata as Record<string, unknown>
            : null,
      }
    })

    const updated = await upsertRuntimeAdapterBindings({
      bindings,
      createdByUserId: actor.userId,
    })

    return NextResponse.json({ bindings: updated })
  } catch (error) {
    if (error instanceof AccessControlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }

    if (error instanceof RuntimeAdapterRegistryError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Failed to update runtime bindings:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
