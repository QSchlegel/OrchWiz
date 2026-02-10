DO $$ BEGIN
  CREATE TYPE "SkillCatalogSource" AS ENUM (
    'curated',
    'experimental',
    'custom_github',
    'local',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SkillImportStatus" AS ENUM (
    'running',
    'succeeded',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SkillCatalogEntry" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "source" "SkillCatalogSource" NOT NULL,
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
  CONSTRAINT "SkillCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SkillCatalogEntry_ownerUserId_sourceKey_key"
  ON "SkillCatalogEntry"("ownerUserId", "sourceKey");

CREATE INDEX IF NOT EXISTS "SkillCatalogEntry_ownerUserId_source_idx"
  ON "SkillCatalogEntry"("ownerUserId", "source");

CREATE INDEX IF NOT EXISTS "SkillCatalogEntry_ownerUserId_isInstalled_idx"
  ON "SkillCatalogEntry"("ownerUserId", "isInstalled");

CREATE INDEX IF NOT EXISTS "SkillCatalogEntry_ownerUserId_slug_idx"
  ON "SkillCatalogEntry"("ownerUserId", "slug");

CREATE INDEX IF NOT EXISTS "SkillCatalogEntry_ownerUserId_updatedAt_idx"
  ON "SkillCatalogEntry"("ownerUserId", "updatedAt");

CREATE TABLE IF NOT EXISTS "SkillImportRun" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "catalogEntryId" TEXT,
  "mode" TEXT NOT NULL,
  "source" "SkillCatalogSource",
  "skillSlug" TEXT,
  "repo" TEXT,
  "sourcePath" TEXT,
  "sourceRef" TEXT,
  "sourceUrl" TEXT,
  "status" "SkillImportStatus" NOT NULL DEFAULT 'running',
  "exitCode" INTEGER,
  "stdout" TEXT,
  "stderr" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SkillImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SkillImportRun_ownerUserId_createdAt_idx"
  ON "SkillImportRun"("ownerUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SkillImportRun_ownerUserId_status_createdAt_idx"
  ON "SkillImportRun"("ownerUserId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "SkillImportRun_catalogEntryId_idx"
  ON "SkillImportRun"("catalogEntryId");

DO $$ BEGIN
  ALTER TABLE "SkillCatalogEntry"
    ADD CONSTRAINT "SkillCatalogEntry_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SkillImportRun"
    ADD CONSTRAINT "SkillImportRun_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SkillImportRun"
    ADD CONSTRAINT "SkillImportRun_catalogEntryId_fkey"
    FOREIGN KEY ("catalogEntryId") REFERENCES "SkillCatalogEntry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
