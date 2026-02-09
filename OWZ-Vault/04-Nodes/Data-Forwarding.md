# Data Forwarding

## Overview

Data forwarding is implemented. OrchWiz nodes can ingest signed events from other nodes, store them as canonical forwarding events, and expose aggregate views in existing list APIs and dashboard pages.

Core ingest route:

- `POST /api/forwarding/events`

## Implemented Data Model

Forwarding is persisted with dedicated models:

- `NodeSource`: source node identity + API key hash + health metadata
- `ForwardingEvent`: canonical forwarded event payload (`eventType`, `payload`, `metadata`, `occurredAt`, `dedupeKey`)
- `ForwardingNonce`: replay protection (unique nonce per source)
- `ForwardingConfig`: user-owned source/target forwarding configuration

Supported forwarded `eventType` values:

- `session`
- `task`
- `command_execution`
- `verification`
- `action`
- `deployment`
- `application`
- `bridge_station`
- `system_status`

## Security Model

Forwarding ingest enforces:

- API key verification against stored hash (`NodeSource.apiKeyHash`)
- HMAC signature verification
- Timestamp freshness window
- Nonce replay guard
- Per-source/IP rate limiting
- Payload schema validation
- Deduplication by `dedupeKey`

Required ingest headers:

- `x-orchwiz-source-node`
- `x-orchwiz-api-key`
- `x-orchwiz-timestamp`
- `x-orchwiz-nonce`
- `x-orchwiz-signature`

Signature input format:

`HMAC_SHA256(apiKey, "${timestamp}.${nonce}.${rawBody}")`

## Setup

### 1) Target node (receiver)

Configure environment:

```env
ENABLE_FORWARDING_INGEST=true
FORWARDING_RATE_LIMIT=60
FORWARDING_RATE_WINDOW_MS=60000
DEFAULT_FORWARDING_API_KEY=orchwiz-dev-forwarding-key
DEFAULT_SOURCE_NODE_ID=local-node
DEFAULT_SOURCE_NODE_NAME=Local Node
```

Apply schema and seed defaults:

```bash
cd node
npm run db:migrate
npm run db:generate
npm run db:seed
```

### 2) Source node (sender)

Create forwarding config (Dashboard or API):

- `POST /api/forwarding/config`
  - required: `targetUrl`
  - optional: `targetApiKey`, `enabled`, `eventTypes`, `status`
  - optional source setup:
    - `sourceNode` object (`nodeId`, `name`, `nodeType`, `nodeUrl`, optional `apiKey`)
    - or existing `sourceNodeId`

The response may include `sourceApiKey` (when source node is provisioned/rotated). Persist it securely on the source node.

Optional source env for outbound workers/scripts:

```env
FORWARD_TARGET_URL=https://target.example.com
FORWARD_API_KEY=<source-api-key>
FORWARDING_FEATURE_ENABLED=true
```

### 3) Verify connectivity

Run a signed test event:

- `POST /api/forwarding/test`
  - required body: `targetUrl`, `sourceNodeId`, `sourceApiKey`

Expected response:

- `ok: true` with downstream ingest response body.

## Aggregate Queries

Forwarded records are merged into local list endpoints with:

- `includeForwarded=true`
- `sourceNodeId=<node-id>` (optional filter)

Supported list routes:

- `/api/sessions`
- `/api/commands`
- `/api/actions`
- `/api/tasks`
- `/api/verification`
- `/api/deployments`
- `/api/applications`
- `/api/bridge/state` (bridge/system aggregate view)

Forwarded records include source metadata (`isForwarded`, `sourceNodeId`, `sourceNodeName`, `forwardingEventId`) for UI labeling and filtering.

## Realtime Integration

Ingest publishes realtime events through SSE:

- `/api/events/stream`

Forwarding-related event types:

- `forwarding.received`
- `bridge.updated` (for `bridge_station` and `system_status`)

## Operational Notes

- Keep forwarding over HTTPS in non-local environments.
- Rotate source API keys periodically (recreate source node key via forwarding config).
- Keep clock sync (timestamp freshness is enforced).
- Use route-level filtering (`sourceNodeId`) in dashboards for multi-node investigations.

## Related Notes

- [[API-Documentation]]
- [[Database-Schema]]
- [[Architecture]]
