DO $$ BEGIN
  CREATE TYPE "VaultRagScopeType" AS ENUM (
    'ship',
    'fleet',
    'global'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "VaultRagSyncScope" AS ENUM (
    'ship',
    'fleet',
    'all'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "VaultRagSyncTrigger" AS ENUM (
    'auto',
    'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "VaultRagSyncStatus" AS ENUM (
    'running',
    'completed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "VaultRagDocument" (
  "id" TEXT NOT NULL,
  "joinedPath" TEXT NOT NULL,
  "physicalVaultId" TEXT NOT NULL,
  "physicalPath" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scopeType" "VaultRagScopeType" NOT NULL,
  "shipDeploymentId" TEXT,
  "contentHash" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "mtime" TIMESTAMP(3) NOT NULL,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaultRagDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VaultRagDocument_joinedPath_key" ON "VaultRagDocument"("joinedPath");
CREATE INDEX IF NOT EXISTS "VaultRagDocument_scopeType_shipDeploymentId_idx" ON "VaultRagDocument"("scopeType", "shipDeploymentId");
CREATE INDEX IF NOT EXISTS "VaultRagDocument_physicalVaultId_idx" ON "VaultRagDocument"("physicalVaultId");
CREATE INDEX IF NOT EXISTS "VaultRagDocument_updatedAt_idx" ON "VaultRagDocument"("updatedAt");

CREATE TABLE IF NOT EXISTS "VaultRagChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "joinedPath" TEXT NOT NULL,
  "scopeType" "VaultRagScopeType" NOT NULL,
  "shipDeploymentId" TEXT,
  "chunkIndex" INTEGER NOT NULL,
  "heading" TEXT,
  "content" TEXT NOT NULL,
  "normalizedContent" TEXT NOT NULL,
  "embedding" JSONB,
  "tokenCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaultRagChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VaultRagChunk_documentId_chunkIndex_key" ON "VaultRagChunk"("documentId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "VaultRagChunk_joinedPath_idx" ON "VaultRagChunk"("joinedPath");
CREATE INDEX IF NOT EXISTS "VaultRagChunk_scopeType_shipDeploymentId_idx" ON "VaultRagChunk"("scopeType", "shipDeploymentId");

CREATE TABLE IF NOT EXISTS "VaultRagSyncRun" (
  "id" TEXT NOT NULL,
  "trigger" "VaultRagSyncTrigger" NOT NULL,
  "scope" "VaultRagSyncScope" NOT NULL,
  "status" "VaultRagSyncStatus" NOT NULL DEFAULT 'running',
  "shipDeploymentId" TEXT,
  "initiatedByUserId" TEXT,
  "mode" TEXT,
  "documentsScanned" INTEGER NOT NULL DEFAULT 0,
  "documentsUpserted" INTEGER NOT NULL DEFAULT 0,
  "documentsRemoved" INTEGER NOT NULL DEFAULT 0,
  "chunksUpserted" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VaultRagSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VaultRagSyncRun_status_createdAt_idx" ON "VaultRagSyncRun"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "VaultRagSyncRun_scope_shipDeploymentId_createdAt_idx" ON "VaultRagSyncRun"("scope", "shipDeploymentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "VaultRagChunk"
    ADD CONSTRAINT "VaultRagChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "VaultRagDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
