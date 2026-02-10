DO $$ BEGIN
  CREATE TYPE "AgentSyncTrigger" AS ENUM ('manual', 'nightly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentSyncScope" AS ENUM ('selected_agent', 'bridge_crew');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentSyncRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentSyncSignalSource" AS ENUM ('command', 'verification', 'bridge_call');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentSyncSuggestionRisk" AS ENUM ('low', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentSyncSuggestionStatus" AS ENUM ('proposed', 'applied', 'rejected', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgentSyncFileSyncStatus" AS ENUM ('synced', 'filesystem_sync_failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AgentSyncPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "nightlyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "nightlyHour" INTEGER NOT NULL DEFAULT 2,
  "lastNightlyRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentSyncPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentSyncPreference_userId_key" ON "AgentSyncPreference"("userId");

DO $$ BEGIN
  ALTER TABLE "AgentSyncPreference"
    ADD CONSTRAINT "AgentSyncPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AgentSyncSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subagentId" TEXT NOT NULL,
  "source" "AgentSyncSignalSource" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "reward" DOUBLE PRECISION NOT NULL,
  "details" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentSyncSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentSyncSignal_source_sourceId_subagentId_key"
  ON "AgentSyncSignal"("source", "sourceId", "subagentId");
CREATE INDEX IF NOT EXISTS "AgentSyncSignal_userId_occurredAt_idx"
  ON "AgentSyncSignal"("userId", "occurredAt");
CREATE INDEX IF NOT EXISTS "AgentSyncSignal_subagentId_occurredAt_idx"
  ON "AgentSyncSignal"("subagentId", "occurredAt");
CREATE INDEX IF NOT EXISTS "AgentSyncSignal_source_occurredAt_idx"
  ON "AgentSyncSignal"("source", "occurredAt");

DO $$ BEGIN
  ALTER TABLE "AgentSyncSignal"
    ADD CONSTRAINT "AgentSyncSignal_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentSyncSignal"
    ADD CONSTRAINT "AgentSyncSignal_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AgentSyncRun" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subagentId" TEXT,
  "trigger" "AgentSyncTrigger" NOT NULL,
  "scope" "AgentSyncScope" NOT NULL,
  "status" "AgentSyncRunStatus" NOT NULL DEFAULT 'pending',
  "summary" TEXT,
  "error" TEXT,
  "fileSyncStatus" "AgentSyncFileSyncStatus" NOT NULL DEFAULT 'skipped',
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentSyncRun_userId_createdAt_idx"
  ON "AgentSyncRun"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentSyncRun_status_createdAt_idx"
  ON "AgentSyncRun"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentSyncRun_subagentId_createdAt_idx"
  ON "AgentSyncRun"("subagentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AgentSyncRun"
    ADD CONSTRAINT "AgentSyncRun_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentSyncRun"
    ADD CONSTRAINT "AgentSyncRun_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AgentSyncSuggestion" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subagentId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "risk" "AgentSyncSuggestionRisk" NOT NULL,
  "status" "AgentSyncSuggestionStatus" NOT NULL DEFAULT 'proposed',
  "reason" TEXT,
  "fileSyncStatus" "AgentSyncFileSyncStatus" NOT NULL DEFAULT 'skipped',
  "existingContent" TEXT,
  "suggestedContent" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),

  CONSTRAINT "AgentSyncSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentSyncSuggestion_runId_idx"
  ON "AgentSyncSuggestion"("runId");
CREATE INDEX IF NOT EXISTS "AgentSyncSuggestion_subagentId_createdAt_idx"
  ON "AgentSyncSuggestion"("subagentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentSyncSuggestion_status_createdAt_idx"
  ON "AgentSyncSuggestion"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AgentSyncSuggestion"
    ADD CONSTRAINT "AgentSyncSuggestion_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "AgentSyncRun"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentSyncSuggestion"
    ADD CONSTRAINT "AgentSyncSuggestion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AgentSyncSuggestion"
    ADD CONSTRAINT "AgentSyncSuggestion_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
