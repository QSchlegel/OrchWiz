DO $$ BEGIN
  CREATE TYPE "RuntimeAdapterProtocol" AS ENUM (
    'internal',
    'webhook',
    'openai_compat',
    'mcp_sse',
    'mcp_stdio',
    'cli_exec'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RuntimeAdapterBindingScope" AS ENUM (
    'global',
    'profile',
    'user',
    'deployment',
    'subagent'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "GovernanceEventType" ADD VALUE IF NOT EXISTS 'runtime_activation_approved';
ALTER TYPE "GovernanceEventType" ADD VALUE IF NOT EXISTS 'runtime_activation_denied';

CREATE TABLE IF NOT EXISTS "RuntimeAdapterCatalogEntry" (
  "id" TEXT NOT NULL,
  "adapterId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "protocol" "RuntimeAdapterProtocol" NOT NULL,
  "endpoint" TEXT,
  "authRef" TEXT,
  "capabilities" JSONB,
  "metadata" JSONB,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "activationStatus" "CatalogActivationStatus" NOT NULL DEFAULT 'pending',
  "activationRationale" TEXT,
  "activatedAt" TIMESTAMP(3),
  "activatedByUserId" TEXT,
  "activatedByBridgeCrewId" TEXT,
  "activationSecurityReportId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuntimeAdapterCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RuntimeAdapterCatalogEntry_adapterId_key"
  ON "RuntimeAdapterCatalogEntry"("adapterId");

CREATE INDEX IF NOT EXISTS "RuntimeAdapterCatalogEntry_activationStatus_idx"
  ON "RuntimeAdapterCatalogEntry"("activationStatus");

CREATE INDEX IF NOT EXISTS "RuntimeAdapterCatalogEntry_isSystem_idx"
  ON "RuntimeAdapterCatalogEntry"("isSystem");

CREATE TABLE IF NOT EXISTS "RuntimeAdapterBinding" (
  "id" TEXT NOT NULL,
  "runtimeAdapterId" TEXT NOT NULL,
  "scope" "RuntimeAdapterBindingScope" NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuntimeAdapterBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RuntimeAdapterBinding_runtimeAdapterId_scope_scopeKey_key"
  ON "RuntimeAdapterBinding"("runtimeAdapterId", "scope", "scopeKey");

CREATE INDEX IF NOT EXISTS "RuntimeAdapterBinding_scope_scopeKey_enabled_priority_idx"
  ON "RuntimeAdapterBinding"("scope", "scopeKey", "enabled", "priority");

CREATE INDEX IF NOT EXISTS "RuntimeAdapterBinding_runtimeAdapterId_enabled_idx"
  ON "RuntimeAdapterBinding"("runtimeAdapterId", "enabled");

ALTER TABLE "GovernanceGrantEvent"
  ADD COLUMN IF NOT EXISTS "runtimeAdapterCatalogEntryId" TEXT;

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_runtimeAdapterCatalogEntryId_idx"
  ON "GovernanceGrantEvent"("runtimeAdapterCatalogEntryId");

DO $$ BEGIN
  ALTER TABLE "RuntimeAdapterCatalogEntry"
    ADD CONSTRAINT "RuntimeAdapterCatalogEntry_activatedByUserId_fkey"
    FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RuntimeAdapterCatalogEntry"
    ADD CONSTRAINT "RuntimeAdapterCatalogEntry_activatedByBridgeCrewId_fkey"
    FOREIGN KEY ("activatedByBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RuntimeAdapterCatalogEntry"
    ADD CONSTRAINT "RuntimeAdapterCatalogEntry_activationSecurityReportId_fkey"
    FOREIGN KEY ("activationSecurityReportId") REFERENCES "GovernanceSecurityReport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RuntimeAdapterCatalogEntry"
    ADD CONSTRAINT "RuntimeAdapterCatalogEntry_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RuntimeAdapterBinding"
    ADD CONSTRAINT "RuntimeAdapterBinding_runtimeAdapterId_fkey"
    FOREIGN KEY ("runtimeAdapterId") REFERENCES "RuntimeAdapterCatalogEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "RuntimeAdapterBinding"
    ADD CONSTRAINT "RuntimeAdapterBinding_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_runtimeAdapterCatalogEntryId_fkey"
    FOREIGN KEY ("runtimeAdapterCatalogEntryId") REFERENCES "RuntimeAdapterCatalogEntry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
