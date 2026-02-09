DO $$ BEGIN
  CREATE TYPE "DeploymentType" AS ENUM ('agent', 'ship');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AgentDeployment"
  ADD COLUMN IF NOT EXISTS "deploymentType" "DeploymentType";

UPDATE "AgentDeployment"
SET "deploymentType" = 'agent'
WHERE "deploymentType" IS NULL;

ALTER TABLE "AgentDeployment"
  ALTER COLUMN "deploymentType" SET DEFAULT 'agent',
  ALTER COLUMN "deploymentType" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "AgentDeployment_deploymentType_idx"
  ON "AgentDeployment"("deploymentType");

DO $$ BEGIN
  CREATE TYPE "BridgeCrewRole" AS ENUM ('xo', 'ops', 'eng', 'sec', 'med', 'cou');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeCrewStatus" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BridgeCrew" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "role" "BridgeCrewRole" NOT NULL,
  "callsign" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "content" TEXT NOT NULL,
  "status" "BridgeCrewStatus" NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeCrew_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeCrew_deploymentId_role_key"
  ON "BridgeCrew"("deploymentId", "role");
CREATE INDEX IF NOT EXISTS "BridgeCrew_deploymentId_idx"
  ON "BridgeCrew"("deploymentId");

DO $$ BEGIN
  ALTER TABLE "BridgeCrew"
    ADD CONSTRAINT "BridgeCrew_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DELETE FROM "Subagent"
WHERE "teamId" = 'uss-k8s'
  AND "name" IN ('XO-CB01', 'OPS-ARX', 'ENG-GEO', 'SEC-KOR', 'MED-BEV', 'COU-DEA');
