import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { parseVaultId } from "@/lib/vault/config"
import { searchVaultNotes } from "@/lib/vault"
import { resolveVaultRagMode } from "@/lib/vault/rag"
import { dataCoreDualReadVerifyEnabled, dataCoreEnabled } from "@/lib/data-core/config"
import { searchVaultNotesFromDataCore } from "@/lib/data-core/vault-adapter"
import { logDualReadDrift } from "@/lib/data-core/dual-read"
import {
  parseRagBackend,
  type RagBackend,
  RagBackendUnavailableError,
  resolveRagBackend,
} from "@/lib/memory/rag-backend"
import { recordRagPerformanceSample } from "@/lib/performance/tracker"

export const dynamic = "force-dynamic"

function parseTopK(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(1, Math.min(100, parsed))
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("q") || ""
  const mode = resolveVaultRagMode(searchParams.get("mode"))
  const requestedBackend = parseRagBackend(searchParams.get("backend"))
  let effectiveBackend: RagBackend = requestedBackend
  let userId: string | null = null

  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    userId = session.user.id

    const vaultId = parseVaultId(searchParams.get("vault"))
    const k = parseTopK(searchParams.get("k"))

    if (!vaultId) {
      return NextResponse.json({ error: "Invalid vault id" }, { status: 400 })
    }

    const backendResolution = resolveRagBackend({
      requestedBackend,
      dataCoreEnabled: dataCoreEnabled(),
    })
    effectiveBackend = backendResolution.effectiveBackend

    let payload
    if (backendResolution.effectiveBackend === "data-core-merged") {
      payload = await searchVaultNotesFromDataCore({
        vaultId,
        query,
        mode,
        k,
        userId: session.user.id,
      })
      if (requestedBackend === "auto" && dataCoreDualReadVerifyEnabled()) {
        const legacyPayload = await searchVaultNotes(vaultId, query, { mode, k }).catch(() => null)
        if (legacyPayload) {
          logDualReadDrift({
            route: "/api/vaults/search",
            key: `${vaultId}:${query}`,
            legacyPayload,
            dataCorePayload: payload,
          })
        }
      }
    } else {
      payload = await searchVaultNotes(vaultId, query, { mode, k })
    }

    const durationMs = Date.now() - startedAt
    const performance = {
      durationMs,
      resultCount: payload.results.length,
      fallbackUsed: payload.fallbackUsed === true,
      status: "success" as const,
    }

    await recordRagPerformanceSample({
      userId,
      route: "/api/vaults/search",
      operation: "search",
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      mode,
      scope: null,
      status: "success",
      fallbackUsed: payload.fallbackUsed === true,
      durationMs,
      resultCount: payload.results.length,
      query,
    })

    return NextResponse.json({
      ...payload,
      requestedBackend: backendResolution.requestedBackend,
      effectiveBackend: backendResolution.effectiveBackend,
      performance,
    })
  } catch (error) {
    if (error instanceof RagBackendUnavailableError) {
      const durationMs = Date.now() - startedAt

      await recordRagPerformanceSample({
        userId,
        route: "/api/vaults/search",
        operation: "search",
        requestedBackend,
        effectiveBackend: requestedBackend,
        mode: resolveVaultRagMode(searchParams.get("mode")),
        scope: null,
        status: "backend_unavailable",
        fallbackUsed: false,
        durationMs,
        resultCount: 0,
        query,
        errorCode: error.code,
      })

      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          requestedBackend,
          effectiveBackend: requestedBackend,
          performance: {
            durationMs,
            resultCount: 0,
            fallbackUsed: false,
            status: "backend_unavailable",
          },
        },
        { status: error.status },
      )
    }

    const durationMs = Date.now() - startedAt
    await recordRagPerformanceSample({
      userId,
      route: "/api/vaults/search",
      operation: "search",
      requestedBackend,
      effectiveBackend,
      mode,
      scope: null,
      status: "error",
      fallbackUsed: false,
      durationMs,
      resultCount: 0,
      query,
      errorCode: "INTERNAL_ERROR",
    })

    console.error("Error searching vault notes:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
