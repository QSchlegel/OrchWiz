ALTER TABLE "Subagent"
  ADD COLUMN IF NOT EXISTS "settings" JSONB;

DO $$ BEGIN
  ALTER TYPE "PermissionScope" ADD VALUE 'subagent';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Permission"
  ADD COLUMN IF NOT EXISTS "subagentId" TEXT;

CREATE INDEX IF NOT EXISTS "Permission_subagentId_idx"
  ON "Permission"("subagentId");

DO $$ BEGIN
  ALTER TABLE "Permission"
    ADD CONSTRAINT "Permission_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "CommandExecution"
  ADD COLUMN IF NOT EXISTS "subagentId" TEXT;

CREATE INDEX IF NOT EXISTS "CommandExecution_subagentId_idx"
  ON "CommandExecution"("subagentId");

DO $$ BEGIN
  ALTER TABLE "CommandExecution"
    ADD CONSTRAINT "CommandExecution_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
