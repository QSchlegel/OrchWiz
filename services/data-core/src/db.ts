import { Pool, type PoolClient } from "pg"
import type { DataCoreConfig } from "./config.js"

export class DataCoreDb {
  private pool: Pool

  constructor(config: DataCoreConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20,
    })
  }

  async connect(): Promise<PoolClient> {
    return this.pool.connect()
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const result = await this.pool.query(sql, params)
    return { rows: result.rows as T[] }
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const result = await fn(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}

export async function ensureSchema(db: DataCoreDb): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS signer_registry (
      id TEXT PRIMARY KEY,
      writer_type TEXT NOT NULL,
      writer_id TEXT NOT NULL,
      key_ref TEXT NOT NULL,
      address TEXT NOT NULL,
      key TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(writer_type, writer_id)
    );

    CREATE TABLE IF NOT EXISTS memory_event_log (
      id TEXT PRIMARY KEY,
      cursor BIGSERIAL UNIQUE,
      source_core_id TEXT NOT NULL,
      source_seq BIGINT NOT NULL,
      idempotency_key TEXT NOT NULL,
      operation TEXT NOT NULL,
      domain TEXT NOT NULL,
      canonical_path TEXT NOT NULL,
      content_markdown TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      writer_type TEXT NOT NULL,
      writer_id TEXT NOT NULL,
      signature JSONB NOT NULL,
      payload_hash TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted BOOLEAN NOT NULL DEFAULT false,
      supersedes_event_id TEXT,
      status TEXT NOT NULL DEFAULT 'applied',
      UNIQUE(source_core_id, source_seq),
      UNIQUE(idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS memory_document_current (
      domain TEXT NOT NULL,
      canonical_path TEXT NOT NULL,
      title TEXT NOT NULL,
      content_markdown TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      latest_event_id TEXT NOT NULL REFERENCES memory_event_log(id) ON DELETE RESTRICT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ,
      PRIMARY KEY(domain, canonical_path)
    );

    CREATE TABLE IF NOT EXISTS memory_chunk_index (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      canonical_path TEXT NOT NULL,
      chunk_index INT NOT NULL,
      heading TEXT,
      content TEXT NOT NULL,
      normalized_content TEXT NOT NULL,
      embedding JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(domain, canonical_path, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS memory_sync_peer (
      id TEXT PRIMARY KEY,
      peer_core_id TEXT NOT NULL UNIQUE,
      peer_url TEXT NOT NULL,
      role TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      last_seen_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS memory_sync_cursor (
      id TEXT PRIMARY KEY,
      peer_core_id TEXT NOT NULL UNIQUE,
      last_cursor BIGINT NOT NULL DEFAULT 0,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS memory_merge_job (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      canonical_path TEXT NOT NULL,
      base_event_id TEXT,
      incoming_event_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      merged_event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ingest_idempotency (
      id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      event_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS memory_plugin_edgequake_workspace (
      id TEXT PRIMARY KEY,
      cluster_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      workspace_slug TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(cluster_id, domain)
    );

    CREATE TABLE IF NOT EXISTS memory_plugin_edgequake_document (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      canonical_path TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      last_event_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(domain, canonical_path),
      UNIQUE(workspace_id, document_id)
    );

    CREATE TABLE IF NOT EXISTS memory_plugin_edgequake_sync_job (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      operation TEXT NOT NULL,
      domain TEXT NOT NULL,
      canonical_path TEXT NOT NULL,
      from_canonical_path TEXT,
      content_markdown TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INT NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS memory_event_log_domain_path_idx ON memory_event_log(domain, canonical_path, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS memory_event_log_cursor_idx ON memory_event_log(cursor);
    CREATE INDEX IF NOT EXISTS memory_document_current_domain_deleted_idx ON memory_document_current(domain, deleted_at);
    CREATE INDEX IF NOT EXISTS memory_chunk_index_domain_path_idx ON memory_chunk_index(domain, canonical_path);
    CREATE INDEX IF NOT EXISTS memory_chunk_index_updated_idx ON memory_chunk_index(updated_at DESC);
    CREATE INDEX IF NOT EXISTS memory_merge_job_status_idx ON memory_merge_job(status, created_at);
    CREATE INDEX IF NOT EXISTS memory_plugin_edgequake_sync_job_status_next_idx
      ON memory_plugin_edgequake_sync_job(status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS memory_plugin_edgequake_sync_job_domain_path_idx
      ON memory_plugin_edgequake_sync_job(domain, canonical_path);
  `)
}
