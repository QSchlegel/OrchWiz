# Data-core Service

## Overview

`services/data-core` is the standalone memory service for non-private domains:

- `orchwiz`
- `ship`
- `agent-public`

Private memory stays local to the node/agent host:

- private markdown stays encrypted at rest
- private vector embeddings stay local in Node DB (`LocalPrivateRagDocument`, `LocalPrivateRagChunk`)
- private records are not replicated to data-core

## Topology

- One data-core instance per ship (`DATA_CORE_ROLE=ship`)
- One fleet hub data-core instance (`DATA_CORE_ROLE=fleet`)
- Ship cores push accepted local events to fleet hub
- Ship cores pull deltas from fleet hub via cursor
- Reconcile endpoint runs pull + merge-worker pass

## API

Implemented in `services/data-core/src/server.ts`:

- `GET /health`
- `POST /v1/memory/upsert`
- `POST /v1/memory/delete`
- `POST /v1/memory/query`
- `GET /v1/memory/tree`
- `GET /v1/memory/file`
- `POST /v1/memory/move`
- `GET /v1/memory/graph`
- `POST /v1/signer/upsert`
- `GET /v1/signer/:writerType/:writerId`
- `POST /v1/sync/events`
- `GET /v1/sync/events`
- `POST /v1/sync/reconcile`

## Signing + Verification

- Node writes use wallet-enclave CIP-8 signing (`signMessagePayload`).
- User writes auto-provision signer row in `UserMemorySigner` (`usr_mem:<userId>` keyRef format expected by convention).
- Data-core verifies:
  - payload hash vs canonical envelope payload
  - signer registry keyRef/address match
  - non-empty signature field

Cryptographic check is optional: if `DATA_CORE_WALLET_ENCLAVE_VERIFY=true`, data-core performs CIP-8 verification by wallet-enclave re-sign comparison.

## Node integration

New internal modules under `node/src/lib/data-core`:

- `client.ts` (`DataCoreClient`)
- `vault-adapter.ts` (route-compatible vault behaviors backed by data-core + local private merge)
- `merged-memory-retriever.ts` (`MergedMemoryRetriever`) for quartermaster/knowledge retrieval
- `user-signer.ts` (`UserMemorySigner` provisioning)
- `local-private-rag.ts` (local private chunk index/query)
- `canonical.ts` (canonical path mapping)

Existing external APIs remain shape-compatible:

- `/api/vaults*`
- `/api/ships/:id/knowledge*`

Behavior change:

- when `DATA_CORE_ENABLED=true`, non-private operations route through data-core
- private reads/writes stay local
- joined retrieval merges public data-core + local private vectors

## Data model

### Data-core DB (per core instance)

Created by `ensureSchema` in `services/data-core/src/db.ts`:

- `memory_document_current`
- `memory_event_log`
- `memory_chunk_index`
- `memory_sync_peer`
- `memory_sync_cursor`
- `memory_merge_job`
- `signer_registry`
- `ingest_idempotency`

### Node DB

Added in Prisma:

- `LocalPrivateRagDocument`
- `LocalPrivateRagChunk`
- `UserMemorySigner`

Migration: `node/prisma/migrations/20260210_data_core_memory_foundation/migration.sql`

## Env controls

Node `.env`:

- `DATA_CORE_ENABLED`
- `DATA_CORE_DUAL_READ_VERIFY`
- `DATA_CORE_BASE_URL`
- `DATA_CORE_API_KEY`
- `DATA_CORE_CORE_ID`
- `DATA_CORE_CLUSTER_ID`
- `DATA_CORE_SHIP_DEPLOYMENT_ID`
- `LOCAL_PRIVATE_RAG_TOP_K`
- `LOCAL_PRIVATE_RAG_QUERY_CANDIDATE_LIMIT`

Data-core `.env`:

- `DATA_CORE_DATABASE_URL`
- `DATA_CORE_ROLE`
- `DATA_CORE_CORE_ID`
- `DATA_CORE_CLUSTER_ID`
- `DATA_CORE_SHIP_DEPLOYMENT_ID`
- `DATA_CORE_FLEET_HUB_URL`
- `DATA_CORE_API_KEY`
- `DATA_CORE_SYNC_SHARED_SECRET`
- `DATA_CORE_WALLET_ENCLAVE_VERIFY`
- `WALLET_ENCLAVE_URL`
- `WALLET_ENCLAVE_SHARED_SECRET`

## Bootstrap import

Script:

```bash
cd node
npm run data-core:bootstrap-import
```

The script scans non-private markdown vaults, canonicalizes paths, signs writes, upserts into data-core, and can run reconcile afterward.
