CREATE TABLE IF NOT EXISTS "ObservabilityTrace" (
  "id" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "source" TEXT,
  "status" TEXT,
  "payload" JSONB NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ObservabilityTrace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ObservabilityTrace_traceId_key" ON "ObservabilityTrace"("traceId");
CREATE INDEX IF NOT EXISTS "ObservabilityTrace_userId_createdAt_idx" ON "ObservabilityTrace"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ObservabilityTrace_sessionId_createdAt_idx" ON "ObservabilityTrace"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "ObservabilityTrace_createdAt_idx" ON "ObservabilityTrace"("createdAt");

ALTER TABLE "ObservabilityTrace"
  ADD CONSTRAINT "ObservabilityTrace_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ObservabilityTrace"
  ADD CONSTRAINT "ObservabilityTrace_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ObservabilityTraceDecryptAudit" (
  "id" TEXT NOT NULL,
  "traceId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ObservabilityTraceDecryptAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ObservabilityTraceDecryptAudit_traceId_createdAt_idx" ON "ObservabilityTraceDecryptAudit"("traceId", "createdAt");
CREATE INDEX IF NOT EXISTS "ObservabilityTraceDecryptAudit_actorType_createdAt_idx" ON "ObservabilityTraceDecryptAudit"("actorType", "createdAt");

ALTER TABLE "ObservabilityTraceDecryptAudit"
  ADD CONSTRAINT "ObservabilityTraceDecryptAudit_traceId_fkey"
  FOREIGN KEY ("traceId") REFERENCES "ObservabilityTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
