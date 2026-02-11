import { loadConfig } from "../config.js"
import { DataCoreDb, ensureSchema } from "../db.js"
import { createDataCorePlugin } from "../plugins/index.js"

type BackfillDomain = "orchwiz" | "ship" | "agent-public"

interface BackfillOptions {
  domain?: BackfillDomain
  limit?: number
  dryRun: boolean
}

interface BackfillRow {
  domain: BackfillDomain
  canonical_path: string
  content_markdown: string
  latest_event_id: string
}

function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--dry-run") {
      options.dryRun = true
      continue
    }
    if (arg === "--domain") {
      const value = argv[i + 1]
      if (!value || !["orchwiz", "ship", "agent-public"].includes(value)) {
        throw new Error("--domain must be one of: orchwiz, ship, agent-public")
      }
      options.domain = value as BackfillDomain
      i += 1
      continue
    }
    if (arg === "--limit") {
      const value = Number.parseInt(argv[i + 1] || "", 10)
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("--limit must be a positive integer")
      }
      options.limit = value
      i += 1
      continue
    }
  }

  return options
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const config = loadConfig()
  if (!config.edgequake.enabled) {
    throw new Error("EdgeQuake plugin is disabled. Set DATA_CORE_PLUGIN_EDGEQUAKE_ENABLED=true to run backfill.")
  }

  const db = new DataCoreDb(config)
  if (config.autoMigrate) {
    await ensureSchema(db)
  }

  const plugin = createDataCorePlugin({ db, config })
  if (!plugin) {
    throw new Error("Failed to initialize EdgeQuake plugin.")
  }

  const whereParts: string[] = ["deleted_at IS NULL"]
  const params: unknown[] = []
  if (options.domain) {
    params.push(options.domain)
    whereParts.push(`domain = $${params.length}`)
  }
  const limitClause = options.limit ? `LIMIT ${options.limit}` : ""

  const rows = await db.query<BackfillRow>(
    `
      SELECT domain, canonical_path, content_markdown, latest_event_id
      FROM memory_document_current
      WHERE ${whereParts.join(" AND ")}
      ORDER BY updated_at DESC
      ${limitClause}
    `,
    params,
  )

  console.log(`[edgequake-backfill] scanned ${rows.rows.length} document(s)`)
  let queued = 0
  let synced = 0
  let failed = 0

  for (const row of rows.rows) {
    console.log(`[edgequake-backfill] ${row.domain}:${row.canonical_path}`)
    if (options.dryRun) {
      continue
    }

    await plugin.enqueueWriteSync({
      eventId: row.latest_event_id,
      operation: "upsert",
      domain: row.domain,
      canonicalPath: row.canonical_path,
      contentMarkdown: row.content_markdown,
    })
    queued += 1

    const drain = await plugin.drainPending({ limit: 1 })
    if (drain.failed > 0) {
      failed += drain.failed
    } else if (drain.succeeded > 0 || drain.skipped > 0) {
      synced += drain.succeeded + drain.skipped
    }
  }

  if (!options.dryRun) {
    const remaining = await plugin.drainPending({ limit: Math.max(1, config.edgequake.drainBatch) })
    failed += remaining.failed
    synced += remaining.succeeded + remaining.skipped
  }

  console.log(`[edgequake-backfill] done dryRun=${options.dryRun} queued=${queued} synced=${synced} failed=${failed}`)
  await db.close()
}

main().catch((error) => {
  console.error("[edgequake-backfill] fatal:", error)
  process.exit(1)
})
