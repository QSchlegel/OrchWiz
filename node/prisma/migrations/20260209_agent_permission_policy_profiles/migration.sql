CREATE TABLE IF NOT EXISTS "PermissionPolicy" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PermissionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PermissionPolicy_slug_key"
  ON "PermissionPolicy"("slug");

CREATE TABLE IF NOT EXISTS "PermissionPolicyRule" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "commandPattern" TEXT NOT NULL,
  "type" "PermissionType" NOT NULL,
  "status" "PermissionStatus" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PermissionPolicyRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PermissionPolicyRule_policyId_idx"
  ON "PermissionPolicyRule"("policyId");

CREATE INDEX IF NOT EXISTS "PermissionPolicyRule_policyId_sortOrder_idx"
  ON "PermissionPolicyRule"("policyId", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "PermissionPolicyRule"
    ADD CONSTRAINT "PermissionPolicyRule_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "PermissionPolicy"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SubagentPermissionPolicy" (
  "id" TEXT NOT NULL,
  "subagentId" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubagentPermissionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubagentPermissionPolicy_subagentId_policyId_key"
  ON "SubagentPermissionPolicy"("subagentId", "policyId");

CREATE INDEX IF NOT EXISTS "SubagentPermissionPolicy_subagentId_priority_idx"
  ON "SubagentPermissionPolicy"("subagentId", "priority");

CREATE INDEX IF NOT EXISTS "SubagentPermissionPolicy_policyId_idx"
  ON "SubagentPermissionPolicy"("policyId");

DO $$ BEGIN
  ALTER TABLE "SubagentPermissionPolicy"
    ADD CONSTRAINT "SubagentPermissionPolicy_subagentId_fkey"
    FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SubagentPermissionPolicy"
    ADD CONSTRAINT "SubagentPermissionPolicy_policyId_fkey"
    FOREIGN KEY ("policyId") REFERENCES "PermissionPolicy"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
