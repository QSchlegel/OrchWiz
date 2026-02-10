import express, { type Request, type Response } from "express"
import crypto from "node:crypto"
import { z } from "zod"
import { loadConfig } from "./config.js"
import { DataCoreDb, ensureSchema } from "./db.js"
import { MemoryStore } from "./memory-store.js"
import { memoryWriteEnvelopeSchema, moveRequestSchema, queryRequestSchema, signerUpsertSchema, syncEventsRequestSchema } from "./schema.js"
import { requireApiKey, signSyncPayload, verifySyncRequest } from "./security.js"

interface RequestWithRawBody extends Request {
  rawBody?: string
}

function asPositiveInt(raw: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function asBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback
  const normalized = raw.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return fallback
}

function firstErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || "Invalid payload"
  }
  return error instanceof Error ? error.message : "Unknown error"
}

async function main(): Promise<void> {
  const config = loadConfig()
  const db = new DataCoreDb(config)
  if (config.autoMigrate) {
    await ensureSchema(db)
  }

  const store = new MemoryStore(db, config)

  const app = express()
  app.use(express.json({
    limit: "4mb",
    verify: (req, _res, buf) => {
      (req as RequestWithRawBody).rawBody = buf.toString("utf8")
    },
  }))

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "data-core",
      role: config.role,
      coreId: config.coreId,
      clusterId: config.clusterId,
      shipDeploymentId: config.shipDeploymentId,
      ts: new Date().toISOString(),
    })
  })

  app.use("/v1", (req, res, next) => {
    if (!requireApiKey(req, res, config.apiKey)) {
      return
    }
    next()
  })

  async function pushEnvelopeToFleet(envelope: unknown): Promise<void> {
    if (config.role !== "ship" || !config.fleetHubUrl) {
      return
    }

    const parsedSigner = memoryWriteEnvelopeSchema.safeParse(envelope)
    if (parsedSigner.success) {
      await pushSignerToFleet({
        writerType: parsedSigner.data.metadata.writerType,
        writerId: parsedSigner.data.metadata.writerId,
        keyRef: parsedSigner.data.signature.keyRef,
        address: parsedSigner.data.signature.address,
        key: parsedSigner.data.signature.key,
        metadata: {
          source: parsedSigner.data.metadata.source,
        },
      }).catch((error) => {
        console.error("data-core fleet sync signer push failed:", error)
      })
    }

    const body = JSON.stringify({
      sourceCoreId: config.coreId,
      events: [envelope],
    })

    const timestamp = String(Date.now())
    const nonce = crypto.randomUUID()
    const signature = config.syncSharedSecret
      ? signSyncPayload(timestamp, nonce, body, config.syncSharedSecret)
      : ""

    const response = await fetch(`${config.fleetHubUrl.replace(/\/$/u, "")}/v1/sync/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey
          ? {
              "x-data-core-api-key": config.apiKey,
            }
          : {}),
        ...(config.syncSharedSecret
          ? {
              "x-data-core-timestamp": timestamp,
              "x-data-core-nonce": nonce,
              "x-data-core-signature": signature,
            }
          : {}),
      },
      body,
    })

    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new Error(`Fleet sync push failed (${response.status}): ${details}`)
    }
  }

  async function pushSignerToFleet(payload: {
    writerType: "agent" | "user" | "system"
    writerId: string
    keyRef: string
    address: string
    key?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    if (config.role !== "ship" || !config.fleetHubUrl) {
      return
    }

    const body = JSON.stringify(payload)
    const timestamp = String(Date.now())
    const nonce = crypto.randomUUID()
    const signature = config.syncSharedSecret
      ? signSyncPayload(timestamp, nonce, body, config.syncSharedSecret)
      : ""

    const response = await fetch(`${config.fleetHubUrl.replace(/\/$/u, "")}/v1/signer/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey
          ? {
              "x-data-core-api-key": config.apiKey,
            }
          : {}),
        ...(config.syncSharedSecret
          ? {
              "x-data-core-timestamp": timestamp,
              "x-data-core-nonce": nonce,
              "x-data-core-signature": signature,
            }
          : {}),
      },
      body,
    })

    if (!response.ok) {
      const details = await response.text().catch(() => "")
      throw new Error(`Fleet signer push failed (${response.status}): ${details}`)
    }
  }

  async function pullFromFleet(limit: number): Promise<{ pulled: number; applied: number; nextCursor: number }> {
    if (config.role !== "ship" || !config.fleetHubUrl) {
      return { pulled: 0, applied: 0, nextCursor: 0 }
    }

    const cursorRow = await db.query<{ last_cursor: number }>(
      `
        SELECT last_cursor
        FROM memory_sync_cursor
        WHERE peer_core_id = $1
        LIMIT 1
      `,
      ["fleet-hub"],
    )

    const afterCursor = cursorRow.rows[0]?.last_cursor || 0
    const url = new URL(`${config.fleetHubUrl.replace(/\/$/u, "")}/v1/sync/events`)
    url.searchParams.set("afterCursor", String(afterCursor))
    url.searchParams.set("limit", String(Math.max(1, Math.min(config.maxSyncBatch, limit))))

    const response = await fetch(url.toString(), {
      headers: {
        ...(config.apiKey
          ? {
              "x-data-core-api-key": config.apiKey,
            }
          : {}),
      },
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Fleet sync pull failed (${response.status}): ${text}`)
    }

    const payload = (await response.json().catch(() => null)) as
      | { events?: unknown[]; nextCursor?: number }
      | null

    const events = Array.isArray(payload?.events) ? payload.events : []
    const nextCursor = typeof payload?.nextCursor === "number" ? payload.nextCursor : afterCursor

    let applied = 0
    for (const event of events) {
      const parsed = memoryWriteEnvelopeSchema.safeParse(event)
      if (!parsed.success) {
        continue
      }

      await store.applyWriteEnvelope({ envelope: parsed.data, skipSignatureCheck: true })
      applied += 1
    }

    await db.query(
      `
        INSERT INTO memory_sync_cursor (id, peer_core_id, last_cursor, last_synced_at, updated_at)
        VALUES ($1, $2, $3, now(), now())
        ON CONFLICT (peer_core_id)
        DO UPDATE SET
          last_cursor = EXCLUDED.last_cursor,
          last_synced_at = now(),
          updated_at = now()
      `,
      [crypto.randomUUID(), "fleet-hub", nextCursor],
    )

    return {
      pulled: events.length,
      applied,
      nextCursor,
    }
  }

  app.post("/v1/signer/upsert", async (req, res) => {
    try {
      const parsed = signerUpsertSchema.parse(req.body)
      const signer = await store.upsertSigner(parsed)
      void pushSignerToFleet(parsed).catch((error) => {
        console.error("data-core fleet sync signer push failed (upsert):", error)
      })
      return res.json({ signer })
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.get("/v1/signer/:writerType/:writerId", async (req, res) => {
    try {
      const signer = await store.getSigner(req.params.writerType, req.params.writerId)
      if (!signer) {
        return res.status(404).json({ error: "Signer not found" })
      }
      return res.json({ signer })
    } catch (error) {
      return res.status(500).json({ error: firstErrorMessage(error) })
    }
  })

  app.post("/v1/memory/upsert", async (req, res) => {
    try {
      const parsed = memoryWriteEnvelopeSchema.parse(req.body)
      if (parsed.operation !== "upsert" && parsed.operation !== "merge") {
        return res.status(400).json({ error: "operation must be upsert or merge" })
      }

      const applied = await store.applyWriteEnvelope({ envelope: parsed })
      if (!applied.duplicate) {
        void pushEnvelopeToFleet(parsed).catch((error) => {
          console.error("data-core fleet sync push failed (upsert):", error)
        })
      }

      return res.json({
        ...applied,
      })
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.post("/v1/memory/delete", async (req, res) => {
    try {
      const parsed = memoryWriteEnvelopeSchema.parse(req.body)
      if (parsed.operation !== "delete") {
        return res.status(400).json({ error: "operation must be delete" })
      }

      const applied = await store.applyWriteEnvelope({ envelope: parsed })
      if (!applied.duplicate) {
        void pushEnvelopeToFleet(parsed).catch((error) => {
          console.error("data-core fleet sync push failed (delete):", error)
        })
      }

      return res.json(applied)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.post("/v1/memory/move", async (req, res) => {
    try {
      const parsed = moveRequestSchema.parse(req.body)
      const envelope = {
        operation: "move" as const,
        domain: parsed.domain,
        canonicalPath: parsed.canonicalPath,
        contentMarkdown: parsed.contentMarkdown,
        metadata: {
          ...parsed.metadata,
          fromCanonicalPath: parsed.fromCanonicalPath,
        },
        event: parsed.event,
        signature: parsed.signature,
      }

      const applied = await store.applyWriteEnvelope({ envelope })
      if (!applied.duplicate) {
        void pushEnvelopeToFleet(envelope).catch((error) => {
          console.error("data-core fleet sync push failed (move):", error)
        })
      }

      return res.json(applied)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.post("/v1/memory/query", async (req, res) => {
    try {
      const parsed = queryRequestSchema.parse(req.body)
      const response = await store.query({
        query: parsed.query,
        mode: parsed.mode,
        domain: parsed.domain,
        prefix: parsed.prefix,
        k: parsed.k,
      })
      return res.json(response)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.get("/v1/memory/tree", async (req, res) => {
    try {
      const domain = typeof req.query.domain === "string" ? req.query.domain : null
      if (!domain) {
        return res.status(400).json({ error: "domain is required" })
      }
      const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined
      const tree = await store.listTree({
        domain,
        prefix,
      })
      return res.json(tree)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.get("/v1/memory/file", async (req, res) => {
    try {
      const domain = typeof req.query.domain === "string" ? req.query.domain : null
      const canonicalPath = typeof req.query.canonicalPath === "string" ? req.query.canonicalPath : null
      if (!domain || !canonicalPath) {
        return res.status(400).json({ error: "domain and canonicalPath are required" })
      }

      const file = await store.getFile({ domain, canonicalPath })
      if (!file) {
        return res.status(404).json({ error: "Memory file not found" })
      }

      return res.json(file)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.get("/v1/memory/graph", async (req, res) => {
    try {
      const domain = typeof req.query.domain === "string" ? req.query.domain : undefined
      const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined
      const includeUnresolved = asBoolean(
        typeof req.query.includeUnresolved === "string" ? req.query.includeUnresolved : undefined,
        true,
      )

      const graph = await store.graph({ domain, prefix, includeUnresolved })
      return res.json(graph)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.post("/v1/sync/events", async (req: RequestWithRawBody, res: Response) => {
    try {
      const nonceHeader = req.header("x-data-core-nonce") ?? null
      const syncVerify = verifySyncRequest({
        timestamp: req.header("x-data-core-timestamp") ?? null,
        nonce: nonceHeader,
        signature: req.header("x-data-core-signature") ?? null,
        rawBody: req.rawBody || JSON.stringify(req.body || {}),
        secret: config.syncSharedSecret,
      })

      if (!syncVerify.ok) {
        return res.status(401).json({ error: syncVerify.reason || "Invalid sync signature" })
      }

      if (config.syncSharedSecret && nonceHeader) {
        const replayCheck = await db.query<{ id: string }>(
          `
            INSERT INTO ingest_idempotency (id, idempotency_key, event_id, created_at)
            VALUES ($1, $2, NULL, now())
            ON CONFLICT (idempotency_key) DO NOTHING
            RETURNING id
          `,
          [crypto.randomUUID(), `sync-nonce:${nonceHeader}`],
        )
        if (!replayCheck.rows[0]) {
          return res.status(409).json({ error: "Replay nonce rejected" })
        }
      }

      const parsed = syncEventsRequestSchema.parse(req.body)
      let applied = 0
      let duplicates = 0

      for (const event of parsed.events) {
        const outcome = await store.applyWriteEnvelope({ envelope: event })
        if (outcome.duplicate) {
          duplicates += 1
        } else {
          applied += 1
        }
      }

      return res.json({
        received: parsed.events.length,
        applied,
        duplicates,
      })
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.get("/v1/sync/events", async (req, res) => {
    try {
      const afterCursor = asPositiveInt(typeof req.query.afterCursor === "string" ? req.query.afterCursor : null, 0)
      const limit = asPositiveInt(typeof req.query.limit === "string" ? req.query.limit : null, config.maxSyncBatch)

      const events = await store.listSyncEvents({ afterCursor, limit })
      return res.json(events)
    } catch (error) {
      return res.status(400).json({ error: firstErrorMessage(error) })
    }
  })

  app.post("/v1/sync/reconcile", async (_req, res) => {
    try {
      const pull = await pullFromFleet(config.maxSyncBatch)
      const merge = config.enableMergeWorker
        ? await store.processPendingMergeJobs(20)
        : { processed: 0, completed: 0, failed: 0 }

      return res.json({
        role: config.role,
        coreId: config.coreId,
        pull,
        merge,
      })
    } catch (error) {
      return res.status(500).json({ error: firstErrorMessage(error) })
    }
  })

  const server = app.listen(config.port, config.host, () => {
    console.log(`data-core listening on http://${config.host}:${config.port}`)
  })

  const shutdown = async () => {
    server.close(() => {})
    await db.close().catch(() => {})
    process.exit(0)
  }

  process.on("SIGINT", () => {
    void shutdown()
  })
  process.on("SIGTERM", () => {
    void shutdown()
  })
}

main().catch((error) => {
  console.error("data-core startup failed:", error)
  process.exit(1)
})
