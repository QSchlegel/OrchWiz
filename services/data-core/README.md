# data-core (OrchWiz)

Standalone memory core for signed public memory domains (`orchwiz`, `ship`, `agent-public`).

## Features

- Signed append-only public memory events
- Materialized current-document view
- Markdown chunk index for hybrid/lexical query
- Obsidian-style link graph generation
- Fleet sync delta feed and ingest endpoints
- Pending merge job worker (`QTM-LGR` deterministic merge)

## Endpoints

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

## Environment

Required:

- `DATA_CORE_DATABASE_URL`

Optional:

- `DATA_CORE_HOST` (default `127.0.0.1`)
- `DATA_CORE_PORT` (default `3390`)
- `DATA_CORE_ROLE` (`ship|fleet`, default `ship`)
- `DATA_CORE_CORE_ID`
- `DATA_CORE_CLUSTER_ID`
- `DATA_CORE_SHIP_DEPLOYMENT_ID`
- `DATA_CORE_FLEET_HUB_URL`
- `DATA_CORE_API_KEY`
- `DATA_CORE_SYNC_SHARED_SECRET`
- `DATA_CORE_AUTO_MIGRATE` (default `true`)
- `DATA_CORE_MAX_SYNC_BATCH` (default `200`)
- `DATA_CORE_QUERY_CANDIDATE_LIMIT` (default `2500`)
- `DATA_CORE_QUERY_TOP_K` (default `12`)
- `DATA_CORE_ENABLE_MERGE_WORKER` (default `true`)
- `DATA_CORE_EMBEDDING_MODEL` (default `text-embedding-3-small`)
- `DATA_CORE_WALLET_ENCLAVE_VERIFY` (default `false`; when enabled, verifies CIP-8 signatures by enclave re-sign comparison)
- `WALLET_ENCLAVE_URL` (default `http://127.0.0.1:3377`)
- `WALLET_ENCLAVE_SHARED_SECRET`
- `OPENAI_API_KEY` (optional, for semantic embeddings)

## Run

```bash
cd services/data-core
npm install
npm run dev
```
