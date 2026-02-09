DO $$ BEGIN
  CREATE TYPE "ForwardingEventType" AS ENUM (
    'session',
    'task',
    'command_execution',
    'verification',
    'action',
    'deployment',
    'application',
    'bridge_station',
    'system_status'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ForwardingEventStatus" AS ENUM (
    'received',
    'projected',
    'duplicate',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ForwardingTargetStatus" AS ENUM (
    'active',
    'paused',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NodeSource" (
  "id" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "name" TEXT,
  "nodeType" "NodeType",
  "nodeUrl" TEXT,
  "apiKeyHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NodeSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NodeSource_nodeId_key" ON "NodeSource"("nodeId");

CREATE TABLE IF NOT EXISTS "ForwardingEvent" (
  "id" TEXT NOT NULL,
  "sourceNodeId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "eventType" "ForwardingEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "ForwardingEventStatus" NOT NULL DEFAULT 'received',
  CONSTRAINT "ForwardingEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForwardingEvent_dedupeKey_key" ON "ForwardingEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "ForwardingEvent_sourceNodeId_idx" ON "ForwardingEvent"("sourceNodeId");
CREATE INDEX IF NOT EXISTS "ForwardingEvent_eventType_idx" ON "ForwardingEvent"("eventType");
CREATE INDEX IF NOT EXISTS "ForwardingEvent_occurredAt_idx" ON "ForwardingEvent"("occurredAt");
CREATE INDEX IF NOT EXISTS "ForwardingEvent_status_idx" ON "ForwardingEvent"("status");

CREATE TABLE IF NOT EXISTS "ForwardingNonce" (
  "id" TEXT NOT NULL,
  "sourceNodeId" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForwardingNonce_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ForwardingNonce_sourceNodeId_nonce_key" ON "ForwardingNonce"("sourceNodeId", "nonce");
CREATE INDEX IF NOT EXISTS "ForwardingNonce_timestamp_idx" ON "ForwardingNonce"("timestamp");

CREATE TABLE IF NOT EXISTS "ForwardingConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceNodeId" TEXT,
  "targetUrl" TEXT NOT NULL,
  "targetApiKey" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "eventTypes" "ForwardingEventType"[] NOT NULL,
  "status" "ForwardingTargetStatus" NOT NULL DEFAULT 'paused',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForwardingConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ForwardingConfig_userId_idx" ON "ForwardingConfig"("userId");
CREATE INDEX IF NOT EXISTS "ForwardingConfig_enabled_idx" ON "ForwardingConfig"("enabled");

DO $$ BEGIN
  ALTER TABLE "ForwardingEvent"
    ADD CONSTRAINT "ForwardingEvent_sourceNodeId_fkey"
    FOREIGN KEY ("sourceNodeId") REFERENCES "NodeSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ForwardingNonce"
    ADD CONSTRAINT "ForwardingNonce_sourceNodeId_fkey"
    FOREIGN KEY ("sourceNodeId") REFERENCES "NodeSource"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ForwardingConfig"
    ADD CONSTRAINT "ForwardingConfig_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ForwardingConfig"
    ADD CONSTRAINT "ForwardingConfig_sourceNodeId_fkey"
    FOREIGN KEY ("sourceNodeId") REFERENCES "NodeSource"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "GitHubWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "action" TEXT,
  "repository" TEXT,
  "pullRequestNumber" INTEGER,
  "commentId" INTEGER,
  "commentBody" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "responseBody" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "GitHubWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GitHubWebhookEvent_eventType_idx" ON "GitHubWebhookEvent"("eventType");
CREATE INDEX IF NOT EXISTS "GitHubWebhookEvent_action_idx" ON "GitHubWebhookEvent"("action");
CREATE INDEX IF NOT EXISTS "GitHubWebhookEvent_repository_idx" ON "GitHubWebhookEvent"("repository");
CREATE INDEX IF NOT EXISTS "GitHubWebhookEvent_createdAt_idx" ON "GitHubWebhookEvent"("createdAt");
