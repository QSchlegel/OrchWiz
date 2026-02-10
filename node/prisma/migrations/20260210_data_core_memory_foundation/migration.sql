CREATE TABLE IF NOT EXISTS "LocalPrivateRagDocument" (
  "id" TEXT NOT NULL,
  "joinedPath" TEXT NOT NULL,
  "physicalPath" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "mtime" TIMESTAMP(3) NOT NULL,
  "chunkCount" INTEGER NOT NULL DEFAULT 0,
  "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocalPrivateRagDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocalPrivateRagDocument_joinedPath_key" ON "LocalPrivateRagDocument"("joinedPath");
CREATE INDEX IF NOT EXISTS "LocalPrivateRagDocument_updatedAt_idx" ON "LocalPrivateRagDocument"("updatedAt");

CREATE TABLE IF NOT EXISTS "LocalPrivateRagChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "joinedPath" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "heading" TEXT,
  "content" TEXT NOT NULL,
  "normalizedContent" TEXT NOT NULL,
  "embedding" JSONB,
  "tokenCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocalPrivateRagChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LocalPrivateRagChunk_documentId_chunkIndex_key" ON "LocalPrivateRagChunk"("documentId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "LocalPrivateRagChunk_joinedPath_idx" ON "LocalPrivateRagChunk"("joinedPath");

DO $$ BEGIN
  ALTER TABLE "LocalPrivateRagChunk"
    ADD CONSTRAINT "LocalPrivateRagChunk_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "LocalPrivateRagDocument"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "UserMemorySigner" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "keyRef" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "key" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMemorySigner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserMemorySigner_userId_key" ON "UserMemorySigner"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserMemorySigner_keyRef_key" ON "UserMemorySigner"("keyRef");

DO $$ BEGIN
  ALTER TABLE "UserMemorySigner"
    ADD CONSTRAINT "UserMemorySigner_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
