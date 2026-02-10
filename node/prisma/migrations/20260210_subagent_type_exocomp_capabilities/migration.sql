DO $$ BEGIN
  CREATE TYPE "SubagentType" AS ENUM ('general', 'bridge_crew', 'exocomp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Subagent"
  ADD COLUMN IF NOT EXISTS "subagentType" "SubagentType";

UPDATE "Subagent"
SET "subagentType" = 'bridge_crew'
WHERE "subagentType" IS NULL
  AND (
    UPPER(COALESCE("name", '')) IN ('XO-CB01', 'OPS-ARX', 'ENG-GEO', 'SEC-KOR', 'MED-BEV', 'COU-DEA')
    OR COALESCE("path", '') ILIKE '.claude/agents/bridge-crew/%'
  );

UPDATE "Subagent"
SET "subagentType" = 'general'
WHERE "subagentType" IS NULL;

ALTER TABLE "Subagent"
  ALTER COLUMN "subagentType" SET DEFAULT 'general',
  ALTER COLUMN "subagentType" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Subagent_subagentType_idx"
  ON "Subagent"("subagentType");
