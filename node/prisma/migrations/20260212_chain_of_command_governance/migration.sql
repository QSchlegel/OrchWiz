DO $$ BEGIN
  CREATE TYPE "CatalogActivationStatus" AS ENUM (
    'pending',
    'approved',
    'denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GovernanceEventType" AS ENUM (
    'ship_tool_grant_approved',
    'ship_tool_grant_revoked',
    'subagent_tool_granted',
    'subagent_tool_revoked',
    'tool_activation_approved',
    'tool_activation_denied',
    'skill_activation_approved',
    'skill_activation_denied'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SkillCatalogEntry"
  ADD COLUMN IF NOT EXISTS "activationStatus" "CatalogActivationStatus" NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "activationRationale" TEXT,
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activatedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "activatedByBridgeCrewId" TEXT,
  ADD COLUMN IF NOT EXISTS "activationSecurityReportId" TEXT;

ALTER TABLE "ToolCatalogEntry"
  ADD COLUMN IF NOT EXISTS "activationStatus" "CatalogActivationStatus" NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "activationRationale" TEXT,
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activatedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "activatedByBridgeCrewId" TEXT,
  ADD COLUMN IF NOT EXISTS "activationSecurityReportId" TEXT;

CREATE TABLE IF NOT EXISTS "BridgeCrewSubagentAssignment" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "shipDeploymentId" TEXT NOT NULL,
  "bridgeCrewId" TEXT NOT NULL,
  "subagentId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "assignedByBridgeCrewId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BridgeCrewSubagentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeCrewSubagentAssignment_bridgeCrewId_subagentId_key"
  ON "BridgeCrewSubagentAssignment"("bridgeCrewId", "subagentId");

CREATE INDEX IF NOT EXISTS "BridgeCrewSubagentAssignment_ownerUserId_shipDeploymentId_idx"
  ON "BridgeCrewSubagentAssignment"("ownerUserId", "shipDeploymentId");

CREATE INDEX IF NOT EXISTS "BridgeCrewSubagentAssignment_shipDeploymentId_bridgeCrewId_idx"
  ON "BridgeCrewSubagentAssignment"("shipDeploymentId", "bridgeCrewId");

CREATE INDEX IF NOT EXISTS "BridgeCrewSubagentAssignment_subagentId_idx"
  ON "BridgeCrewSubagentAssignment"("subagentId");

CREATE TABLE IF NOT EXISTS "GovernanceSecurityReport" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "eventType" "GovernanceEventType" NOT NULL,
  "rationale" TEXT NOT NULL,
  "reportPathMd" TEXT NOT NULL,
  "reportPathJson" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByBridgeCrewId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernanceSecurityReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GovernanceSecurityReport_ownerUserId_createdAt_idx"
  ON "GovernanceSecurityReport"("ownerUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "GovernanceSecurityReport_eventType_createdAt_idx"
  ON "GovernanceSecurityReport"("eventType", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "GovernanceSecurityReport_createdByBridgeCrewId_idx"
  ON "GovernanceSecurityReport"("createdByBridgeCrewId");

CREATE TABLE IF NOT EXISTS "GovernanceGrantEvent" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "eventType" "GovernanceEventType" NOT NULL,
  "toolCatalogEntryId" TEXT,
  "skillCatalogEntryId" TEXT,
  "shipDeploymentId" TEXT,
  "bridgeCrewId" TEXT,
  "subagentId" TEXT,
  "actorBridgeCrewId" TEXT,
  "securityReportId" TEXT,
  "rationale" TEXT,
  "metadata" JSONB,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernanceGrantEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_ownerUserId_createdAt_idx"
  ON "GovernanceGrantEvent"("ownerUserId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_eventType_createdAt_idx"
  ON "GovernanceGrantEvent"("eventType", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_toolCatalogEntryId_idx"
  ON "GovernanceGrantEvent"("toolCatalogEntryId");

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_skillCatalogEntryId_idx"
  ON "GovernanceGrantEvent"("skillCatalogEntryId");

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_shipDeploymentId_idx"
  ON "GovernanceGrantEvent"("shipDeploymentId");

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_bridgeCrewId_idx"
  ON "GovernanceGrantEvent"("bridgeCrewId");

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_subagentId_idx"
  ON "GovernanceGrantEvent"("subagentId");

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_actorBridgeCrewId_idx"
  ON "GovernanceGrantEvent"("actorBridgeCrewId");

CREATE INDEX IF NOT EXISTS "GovernanceGrantEvent_securityReportId_idx"
  ON "GovernanceGrantEvent"("securityReportId");

CREATE INDEX IF NOT EXISTS "SkillCatalogEntry_ownerUserId_activationStatus_idx"
  ON "SkillCatalogEntry"("ownerUserId", "activationStatus");

CREATE INDEX IF NOT EXISTS "ToolCatalogEntry_ownerUserId_activationStatus_idx"
  ON "ToolCatalogEntry"("ownerUserId", "activationStatus");

DO $$ BEGIN
  ALTER TABLE "SkillCatalogEntry"
    ADD CONSTRAINT "SkillCatalogEntry_activatedByUserId_fkey"
    FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SkillCatalogEntry"
    ADD CONSTRAINT "SkillCatalogEntry_activatedByBridgeCrewId_fkey"
    FOREIGN KEY ("activatedByBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ToolCatalogEntry"
    ADD CONSTRAINT "ToolCatalogEntry_activatedByUserId_fkey"
    FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ToolCatalogEntry"
    ADD CONSTRAINT "ToolCatalogEntry_activatedByBridgeCrewId_fkey"
    FOREIGN KEY ("activatedByBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCrewSubagentAssignment"
    ADD CONSTRAINT "BridgeCrewSubagentAssignment_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCrewSubagentAssignment"
    ADD CONSTRAINT "BridgeCrewSubagentAssignment_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCrewSubagentAssignment"
    ADD CONSTRAINT "BridgeCrewSubagentAssignment_bridgeCrewId_fkey"
    FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCrewSubagentAssignment"
    ADD CONSTRAINT "BridgeCrewSubagentAssignment_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCrewSubagentAssignment"
    ADD CONSTRAINT "BridgeCrewSubagentAssignment_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCrewSubagentAssignment"
    ADD CONSTRAINT "BridgeCrewSubagentAssignment_assignedByBridgeCrewId_fkey"
    FOREIGN KEY ("assignedByBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceSecurityReport"
    ADD CONSTRAINT "GovernanceSecurityReport_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceSecurityReport"
    ADD CONSTRAINT "GovernanceSecurityReport_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceSecurityReport"
    ADD CONSTRAINT "GovernanceSecurityReport_createdByBridgeCrewId_fkey"
    FOREIGN KEY ("createdByBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_toolCatalogEntryId_fkey"
    FOREIGN KEY ("toolCatalogEntryId") REFERENCES "ToolCatalogEntry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_skillCatalogEntryId_fkey"
    FOREIGN KEY ("skillCatalogEntryId") REFERENCES "SkillCatalogEntry"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_bridgeCrewId_fkey"
    FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_actorBridgeCrewId_fkey"
    FOREIGN KEY ("actorBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "GovernanceGrantEvent"
    ADD CONSTRAINT "GovernanceGrantEvent_securityReportId_fkey"
    FOREIGN KEY ("securityReportId") REFERENCES "GovernanceSecurityReport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SkillCatalogEntry"
    ADD CONSTRAINT "SkillCatalogEntry_activationSecurityReportId_fkey"
    FOREIGN KEY ("activationSecurityReportId") REFERENCES "GovernanceSecurityReport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ToolCatalogEntry"
    ADD CONSTRAINT "ToolCatalogEntry_activationSecurityReportId_fkey"
    FOREIGN KEY ("activationSecurityReportId") REFERENCES "GovernanceSecurityReport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE "SkillCatalogEntry"
SET "activationStatus" = 'approved'
WHERE "activationStatus" IS NULL;

UPDATE "ToolCatalogEntry"
SET "activationStatus" = 'approved'
WHERE "activationStatus" IS NULL;
