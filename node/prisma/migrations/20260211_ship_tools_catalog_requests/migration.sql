DO $$ BEGIN
  CREATE TYPE "ToolCatalogSource" AS ENUM (
    'curated',
    'custom_github',
    'local',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ToolImportStatus" AS ENUM (
    'running',
    'succeeded',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShipToolGrantScope" AS ENUM (
    'ship',
    'bridge_crew'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShipToolAccessRequestStatus" AS ENUM (
    'pending',
    'approved',
    'denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShipToolRequestScopePreference" AS ENUM (
    'requester_only',
    'ship'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ToolCatalogEntry" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "source" "ToolCatalogSource" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "repo" TEXT,
  "sourcePath" TEXT,
  "sourceRef" TEXT,
  "sourceUrl" TEXT,
  "isInstalled" BOOLEAN NOT NULL DEFAULT false,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "installedPath" TEXT,
  "metadata" JSONB,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToolCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ToolCatalogEntry_ownerUserId_sourceKey_key"
  ON "ToolCatalogEntry"("ownerUserId", "sourceKey");

CREATE INDEX IF NOT EXISTS "ToolCatalogEntry_ownerUserId_source_idx"
  ON "ToolCatalogEntry"("ownerUserId", "source");

CREATE INDEX IF NOT EXISTS "ToolCatalogEntry_ownerUserId_isInstalled_idx"
  ON "ToolCatalogEntry"("ownerUserId", "isInstalled");

CREATE INDEX IF NOT EXISTS "ToolCatalogEntry_ownerUserId_slug_idx"
  ON "ToolCatalogEntry"("ownerUserId", "slug");

CREATE INDEX IF NOT EXISTS "ToolCatalogEntry_ownerUserId_updatedAt_idx"
  ON "ToolCatalogEntry"("ownerUserId", "updatedAt");

CREATE TABLE IF NOT EXISTS "ToolImportRun" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "catalogEntryId" TEXT,
  "mode" TEXT NOT NULL,
  "source" "ToolCatalogSource",
  "toolSlug" TEXT,
  "repo" TEXT,
  "sourcePath" TEXT,
  "sourceRef" TEXT,
  "sourceUrl" TEXT,
  "status" "ToolImportStatus" NOT NULL DEFAULT 'running',
  "exitCode" INTEGER,
  "stdout" TEXT,
  "stderr" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ToolImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ToolImportRun_ownerUserId_createdAt_idx"
  ON "ToolImportRun"("ownerUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ToolImportRun_ownerUserId_status_createdAt_idx"
  ON "ToolImportRun"("ownerUserId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ToolImportRun_catalogEntryId_idx"
  ON "ToolImportRun"("catalogEntryId");

CREATE TABLE IF NOT EXISTS "ShipToolGrant" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "shipDeploymentId" TEXT NOT NULL,
  "catalogEntryId" TEXT NOT NULL,
  "scope" "ShipToolGrantScope" NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "bridgeCrewId" TEXT,
  "grantedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipToolGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipToolGrant_shipDeploymentId_catalogEntryId_scopeKey_key"
  ON "ShipToolGrant"("shipDeploymentId", "catalogEntryId", "scopeKey");

CREATE INDEX IF NOT EXISTS "ShipToolGrant_ownerUserId_shipDeploymentId_scope_idx"
  ON "ShipToolGrant"("ownerUserId", "shipDeploymentId", "scope");

CREATE INDEX IF NOT EXISTS "ShipToolGrant_bridgeCrewId_idx"
  ON "ShipToolGrant"("bridgeCrewId");

CREATE INDEX IF NOT EXISTS "ShipToolGrant_catalogEntryId_idx"
  ON "ShipToolGrant"("catalogEntryId");

CREATE TABLE IF NOT EXISTS "ShipToolAccessRequest" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "shipDeploymentId" TEXT NOT NULL,
  "catalogEntryId" TEXT NOT NULL,
  "requesterBridgeCrewId" TEXT,
  "requestedByUserId" TEXT NOT NULL,
  "scopePreference" "ShipToolRequestScopePreference" NOT NULL DEFAULT 'requester_only',
  "status" "ShipToolAccessRequestStatus" NOT NULL DEFAULT 'pending',
  "rationale" TEXT,
  "metadata" JSONB,
  "approvedGrantId" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipToolAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShipToolAccessRequest_ownerUserId_shipDeploymentId_status_createdAt_idx"
  ON "ShipToolAccessRequest"("ownerUserId", "shipDeploymentId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ShipToolAccessRequest_requesterBridgeCrewId_idx"
  ON "ShipToolAccessRequest"("requesterBridgeCrewId");

CREATE INDEX IF NOT EXISTS "ShipToolAccessRequest_catalogEntryId_idx"
  ON "ShipToolAccessRequest"("catalogEntryId");

CREATE INDEX IF NOT EXISTS "ShipToolAccessRequest_approvedGrantId_idx"
  ON "ShipToolAccessRequest"("approvedGrantId");

DO $$ BEGIN
  ALTER TABLE "ToolCatalogEntry"
    ADD CONSTRAINT "ToolCatalogEntry_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ToolImportRun"
    ADD CONSTRAINT "ToolImportRun_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ToolImportRun"
    ADD CONSTRAINT "ToolImportRun_catalogEntryId_fkey"
    FOREIGN KEY ("catalogEntryId") REFERENCES "ToolCatalogEntry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolGrant"
    ADD CONSTRAINT "ShipToolGrant_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolGrant"
    ADD CONSTRAINT "ShipToolGrant_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolGrant"
    ADD CONSTRAINT "ShipToolGrant_catalogEntryId_fkey"
    FOREIGN KEY ("catalogEntryId") REFERENCES "ToolCatalogEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolGrant"
    ADD CONSTRAINT "ShipToolGrant_bridgeCrewId_fkey"
    FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolGrant"
    ADD CONSTRAINT "ShipToolGrant_grantedByUserId_fkey"
    FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_catalogEntryId_fkey"
    FOREIGN KEY ("catalogEntryId") REFERENCES "ToolCatalogEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_requesterBridgeCrewId_fkey"
    FOREIGN KEY ("requesterBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipToolAccessRequest"
    ADD CONSTRAINT "ShipToolAccessRequest_approvedGrantId_fkey"
    FOREIGN KEY ("approvedGrantId") REFERENCES "ShipToolGrant"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
