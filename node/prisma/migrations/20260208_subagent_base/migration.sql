-- CreateTable: Subagent (base table). Required by 20260209_agent_permission_policy_profiles and later migrations.
-- Later migrations add: subagentType (20260210_subagent_type), ownerUserId (20260210_security_resource_ownership).
CREATE TABLE IF NOT EXISTS "Subagent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "content" TEXT NOT NULL,
  "path" TEXT,
  "settings" JSONB,
  "isShared" BOOLEAN NOT NULL DEFAULT false,
  "teamId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subagent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Subagent_name_teamId_key"
  ON "Subagent"("name", "teamId");

CREATE INDEX IF NOT EXISTS "Subagent_teamId_idx"
  ON "Subagent"("teamId");
