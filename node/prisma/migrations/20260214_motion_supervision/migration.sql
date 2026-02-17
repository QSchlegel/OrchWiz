DO $$ BEGIN
  CREATE TYPE "MotionSupervisionMode" AS ENUM (
    'observation',
    'production',
    'off'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MotionStrictness" AS ENUM (
    'lenient',
    'standard',
    'strict'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MotionFailMode" AS ENUM (
    'fail_open_alert',
    'fail_closed',
    'fail_open_silent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MotionEntityType" AS ENUM (
    'user',
    'subagent',
    'ship_subagent',
    'ship_station'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MotionEventType" AS ENUM (
    'runtime_prompt',
    'command_execution'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MotionDecision" AS ENUM (
    'allow',
    'warn',
    'block'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SecurityIncident"
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityIncident_dedupeKey_key" ON "SecurityIncident"("dedupeKey");

CREATE TABLE IF NOT EXISTS "MotionSupervisionConfig" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "mode" "MotionSupervisionMode" NOT NULL DEFAULT 'observation',
  "strictness" "MotionStrictness" NOT NULL DEFAULT 'strict',
  "failMode" "MotionFailMode" NOT NULL DEFAULT 'fail_open_alert',
  "baselineMinSamples" INTEGER NOT NULL DEFAULT 10,
  "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotionSupervisionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MotionSupervisionConfig_ownerUserId_key" ON "MotionSupervisionConfig"("ownerUserId");
CREATE INDEX IF NOT EXISTS "MotionSupervisionConfig_ownerUserId_idx" ON "MotionSupervisionConfig"("ownerUserId");
CREATE INDEX IF NOT EXISTS "MotionSupervisionConfig_mode_idx" ON "MotionSupervisionConfig"("mode");

CREATE TABLE IF NOT EXISTS "MotionBaseline" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "entityType" "MotionEntityType" NOT NULL,
  "entityKey" TEXT NOT NULL,
  "shipDeploymentId" TEXT,
  "subagentId" TEXT,
  "stationKey" "BridgeCrewRole",
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "promptCharsMean" DOUBLE PRECISION,
  "promptCharsM2" DOUBLE PRECISION,
  "promptCharsCount" INTEGER NOT NULL DEFAULT 0,
  "outputCharsMean" DOUBLE PRECISION,
  "outputCharsM2" DOUBLE PRECISION,
  "outputCharsCount" INTEGER NOT NULL DEFAULT 0,
  "durationMsMean" DOUBLE PRECISION,
  "durationMsM2" DOUBLE PRECISION,
  "durationMsCount" INTEGER NOT NULL DEFAULT 0,
  "inputCentroid" JSONB,
  "inputSimMean" DOUBLE PRECISION,
  "inputSimM2" DOUBLE PRECISION,
  "inputSimCount" INTEGER NOT NULL DEFAULT 0,
  "outputCentroid" JSONB,
  "outputSimMean" DOUBLE PRECISION,
  "outputSimM2" DOUBLE PRECISION,
  "outputSimCount" INTEGER NOT NULL DEFAULT 0,
  "toolBindingSlugCounts" JSONB,
  "skillPolicySlugCounts" JSONB,
  "shipGrantedToolSlugCounts" JSONB,
  "commandUsageCounts" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotionBaseline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MotionBaseline_ownerUserId_entityKey_key" ON "MotionBaseline"("ownerUserId", "entityKey");
CREATE INDEX IF NOT EXISTS "MotionBaseline_ownerUserId_entityType_idx" ON "MotionBaseline"("ownerUserId", "entityType");
CREATE INDEX IF NOT EXISTS "MotionBaseline_ownerUserId_updatedAt_idx" ON "MotionBaseline"("ownerUserId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "MotionBaseline_shipDeploymentId_idx" ON "MotionBaseline"("shipDeploymentId");
CREATE INDEX IF NOT EXISTS "MotionBaseline_subagentId_idx" ON "MotionBaseline"("subagentId");
CREATE INDEX IF NOT EXISTS "MotionBaseline_stationKey_idx" ON "MotionBaseline"("stationKey");

CREATE TABLE IF NOT EXISTS "MotionSample" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "baselineId" TEXT,
  "entityType" "MotionEntityType" NOT NULL,
  "entityKey" TEXT NOT NULL,
  "eventType" "MotionEventType" NOT NULL,
  "decision" "MotionDecision" NOT NULL,
  "reasons" JSONB NOT NULL,
  "baselineReady" BOOLEAN NOT NULL DEFAULT false,
  "shipDeploymentId" TEXT,
  "subagentId" TEXT,
  "stationKey" "BridgeCrewRole",
  "bridgeCrewId" TEXT,
  "sessionId" TEXT,
  "interactionId" TEXT,
  "responseInteractionId" TEXT,
  "traceId" TEXT,
  "commandExecutionId" TEXT,
  "incidentId" TEXT,
  "runtimeProfile" TEXT,
  "executionKind" TEXT,
  "provider" TEXT,
  "promptChars" INTEGER,
  "outputChars" INTEGER,
  "durationMs" INTEGER,
  "inputSimilarity" DOUBLE PRECISION,
  "outputSimilarity" DOUBLE PRECISION,
  "toolBindingSlugs" JSONB,
  "skillPolicySlugs" JSONB,
  "shipGrantedToolSlugs" JSONB,
  "shipRequestableToolSlugs" JSONB,
  "commandId" TEXT,
  "commandName" TEXT,
  "commandPath" TEXT,
  "commandCandidates" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotionSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MotionSample_ownerUserId_createdAt_idx" ON "MotionSample"("ownerUserId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MotionSample_ownerUserId_decision_createdAt_idx" ON "MotionSample"("ownerUserId", "decision", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MotionSample_entityKey_createdAt_idx" ON "MotionSample"("entityKey", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "MotionSample_baselineId_idx" ON "MotionSample"("baselineId");
CREATE INDEX IF NOT EXISTS "MotionSample_sessionId_idx" ON "MotionSample"("sessionId");
CREATE INDEX IF NOT EXISTS "MotionSample_subagentId_idx" ON "MotionSample"("subagentId");
CREATE INDEX IF NOT EXISTS "MotionSample_stationKey_idx" ON "MotionSample"("stationKey");
CREATE INDEX IF NOT EXISTS "MotionSample_commandExecutionId_idx" ON "MotionSample"("commandExecutionId");
CREATE INDEX IF NOT EXISTS "MotionSample_incidentId_idx" ON "MotionSample"("incidentId");
CREATE INDEX IF NOT EXISTS "MotionSample_shipDeploymentId_idx" ON "MotionSample"("shipDeploymentId");

DO $$ BEGIN
  ALTER TABLE "MotionSupervisionConfig"
    ADD CONSTRAINT "MotionSupervisionConfig_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionBaseline"
    ADD CONSTRAINT "MotionBaseline_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionBaseline"
    ADD CONSTRAINT "MotionBaseline_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionSample"
    ADD CONSTRAINT "MotionSample_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionSample"
    ADD CONSTRAINT "MotionSample_baselineId_fkey"
    FOREIGN KEY ("baselineId") REFERENCES "MotionBaseline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionSample"
    ADD CONSTRAINT "MotionSample_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionSample"
    ADD CONSTRAINT "MotionSample_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionSample"
    ADD CONSTRAINT "MotionSample_commandExecutionId_fkey"
    FOREIGN KEY ("commandExecutionId") REFERENCES "CommandExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MotionSample"
    ADD CONSTRAINT "MotionSample_incidentId_fkey"
    FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

