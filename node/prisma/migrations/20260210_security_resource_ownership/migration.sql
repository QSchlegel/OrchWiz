ALTER TABLE "Command"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

ALTER TABLE "Subagent"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

ALTER TABLE "Permission"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

ALTER TABLE "PermissionPolicy"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

ALTER TABLE "NodeSource"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Command_ownerUserId_idx"
  ON "Command"("ownerUserId");

CREATE INDEX IF NOT EXISTS "Subagent_ownerUserId_idx"
  ON "Subagent"("ownerUserId");

CREATE INDEX IF NOT EXISTS "Permission_ownerUserId_idx"
  ON "Permission"("ownerUserId");

CREATE INDEX IF NOT EXISTS "PermissionPolicy_ownerUserId_idx"
  ON "PermissionPolicy"("ownerUserId");

CREATE INDEX IF NOT EXISTS "NodeSource_ownerUserId_idx"
  ON "NodeSource"("ownerUserId");

ALTER TABLE "NodeSource"
  DROP CONSTRAINT IF EXISTS "NodeSource_nodeId_key";

DROP INDEX IF EXISTS "NodeSource_nodeId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "NodeSource_ownerUserId_nodeId_key"
  ON "NodeSource"("ownerUserId", "nodeId");

DO $$ BEGIN
  ALTER TABLE "Command"
    ADD CONSTRAINT "Command_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Subagent"
    ADD CONSTRAINT "Subagent_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Permission"
    ADD CONSTRAINT "Permission_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PermissionPolicy"
    ADD CONSTRAINT "PermissionPolicy_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "NodeSource"
    ADD CONSTRAINT "NodeSource_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
