CREATE TABLE IF NOT EXISTS "RagPerformanceSample" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "shipDeploymentId" TEXT,
  "route" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestedBackend" TEXT NOT NULL,
  "effectiveBackend" TEXT NOT NULL,
  "mode" TEXT,
  "scope" TEXT,
  "status" TEXT NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "durationMs" INTEGER NOT NULL,
  "resultCount" INTEGER,
  "queryHash" TEXT,
  "queryLength" INTEGER,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RagPerformanceSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RagPerformanceSample_createdAt_idx" ON "RagPerformanceSample"("createdAt");
CREATE INDEX IF NOT EXISTS "RagPerformanceSample_status_createdAt_idx" ON "RagPerformanceSample"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RagPerformanceSample_effectiveBackend_createdAt_idx" ON "RagPerformanceSample"("effectiveBackend", "createdAt");
CREATE INDEX IF NOT EXISTS "RagPerformanceSample_route_operation_createdAt_idx" ON "RagPerformanceSample"("route", "operation", "createdAt");
CREATE INDEX IF NOT EXISTS "RagPerformanceSample_shipDeploymentId_createdAt_idx" ON "RagPerformanceSample"("shipDeploymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "RagPerformanceSample_userId_createdAt_idx" ON "RagPerformanceSample"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "RagPerformanceSample"
    ADD CONSTRAINT "RagPerformanceSample_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RagPerformanceSample"
    ADD CONSTRAINT "RagPerformanceSample_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RagPerformanceSample"
    ADD CONSTRAINT "RagPerformanceSample_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RuntimePerformanceSample" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "source" TEXT NOT NULL,
  "runtimeProfile" TEXT,
  "provider" TEXT,
  "status" TEXT NOT NULL,
  "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
  "durationMs" INTEGER NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RuntimePerformanceSample_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_createdAt_idx" ON "RuntimePerformanceSample"("createdAt");
CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_status_createdAt_idx" ON "RuntimePerformanceSample"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_provider_createdAt_idx" ON "RuntimePerformanceSample"("provider", "createdAt");
CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_runtimeProfile_createdAt_idx" ON "RuntimePerformanceSample"("runtimeProfile", "createdAt");
CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_source_createdAt_idx" ON "RuntimePerformanceSample"("source", "createdAt");
CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_userId_createdAt_idx" ON "RuntimePerformanceSample"("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "RuntimePerformanceSample"
    ADD CONSTRAINT "RuntimePerformanceSample_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RuntimePerformanceSample"
    ADD CONSTRAINT "RuntimePerformanceSample_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
