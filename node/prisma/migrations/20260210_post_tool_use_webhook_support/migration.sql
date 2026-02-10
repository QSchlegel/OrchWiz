DO $$ BEGIN
  ALTER TYPE "HookType" ADD VALUE 'webhook';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Hook"
  ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

CREATE INDEX IF NOT EXISTS "Hook_ownerUserId_idx"
  ON "Hook"("ownerUserId");

DO $$ BEGIN
  ALTER TABLE "Hook"
    ADD CONSTRAINT "Hook_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

WITH earliest_user AS (
  SELECT "id"
  FROM "User"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
UPDATE "Hook"
SET "ownerUserId" = (SELECT "id" FROM earliest_user)
WHERE "ownerUserId" IS NULL
  AND EXISTS (SELECT 1 FROM earliest_user);

ALTER TABLE "HookExecution"
  ALTER COLUMN "sessionId" DROP NOT NULL;

ALTER TABLE "HookExecution"
  DROP CONSTRAINT IF EXISTS "HookExecution_sessionId_fkey";

DO $$ BEGIN
  ALTER TABLE "HookExecution"
    ADD CONSTRAINT "HookExecution_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
