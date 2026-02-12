ALTER TABLE "AgentDeployment"
  ADD COLUMN "shipVersion" TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN "shipVersionUpdatedAt" TIMESTAMP(3);
