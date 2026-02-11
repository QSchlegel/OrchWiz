CREATE TABLE IF NOT EXISTS "SubagentToolBinding" (
  "id" TEXT NOT NULL,
  "subagentId" TEXT NOT NULL,
  "toolCatalogEntryId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubagentToolBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubagentToolBinding_subagentId_toolCatalogEntryId_key"
  ON "SubagentToolBinding"("subagentId", "toolCatalogEntryId");

CREATE INDEX IF NOT EXISTS "SubagentToolBinding_subagentId_idx"
  ON "SubagentToolBinding"("subagentId");

DO $$ BEGIN
  ALTER TABLE "SubagentToolBinding"
    ADD CONSTRAINT "SubagentToolBinding_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SubagentToolBinding"
    ADD CONSTRAINT "SubagentToolBinding_toolCatalogEntryId_fkey"
    FOREIGN KEY ("toolCatalogEntryId") REFERENCES "ToolCatalogEntry"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
