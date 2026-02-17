DO $$ BEGIN
  CREATE TYPE "SecurityIncidentStatus" AS ENUM (
    'open',
    'investigating',
    'contained',
    'eradicated',
    'recovered',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SecurityIncidentSeverity" AS ENUM (
    'low',
    'medium',
    'high',
    'critical'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SecurityIncident" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'open',
  "severity" "SecurityIncidentSeverity" NOT NULL DEFAULT 'medium',
  "isShared" BOOLEAN NOT NULL DEFAULT false,
  "caseFile" JSONB NOT NULL,
  "sessionId" TEXT,
  "mispEventId" TEXT,
  "mispPushedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SecurityIntegrationSecrets" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stored" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityIntegrationSecrets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityIncident_sessionId_key" ON "SecurityIncident"("sessionId");
CREATE INDEX IF NOT EXISTS "SecurityIncident_ownerUserId_updatedAt_idx" ON "SecurityIncident"("ownerUserId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "SecurityIncident_ownerUserId_status_severity_updatedAt_idx" ON "SecurityIncident"("ownerUserId", "status", "severity", "updatedAt" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityIntegrationSecrets_userId_key" ON "SecurityIntegrationSecrets"("userId");
CREATE INDEX IF NOT EXISTS "SecurityIntegrationSecrets_userId_idx" ON "SecurityIntegrationSecrets"("userId");

DO $$ BEGIN
  ALTER TABLE "SecurityIncident"
    ADD CONSTRAINT "SecurityIncident_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SecurityIncident"
    ADD CONSTRAINT "SecurityIncident_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SecurityIntegrationSecrets"
    ADD CONSTRAINT "SecurityIntegrationSecrets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
