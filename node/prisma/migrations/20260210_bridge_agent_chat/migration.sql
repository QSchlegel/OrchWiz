DO $$ BEGIN
  CREATE TYPE "BridgeAgentChatRoomType" AS ENUM ('dm', 'group');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeAgentChatMessageKind" AS ENUM ('agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeAgentChatReplyJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BridgeAgentChatRoom" (
  "id" TEXT NOT NULL,
  "shipDeploymentId" TEXT NOT NULL,
  "roomType" "BridgeAgentChatRoomType" NOT NULL,
  "title" TEXT NOT NULL,
  "dmKey" TEXT,
  "createdByBridgeCrewId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeAgentChatRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeAgentChatMember" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "bridgeCrewId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeAgentChatMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeAgentChatMessage" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "kind" "BridgeAgentChatMessageKind" NOT NULL DEFAULT 'agent',
  "senderBridgeCrewId" TEXT,
  "content" TEXT NOT NULL,
  "inReplyToMessageId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeAgentChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeAgentChatReplyJob" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "shipDeploymentId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "sourceMessageId" TEXT NOT NULL,
  "recipientBridgeCrewId" TEXT NOT NULL,
  "recipientSessionId" TEXT NOT NULL,
  "status" "BridgeAgentChatReplyJobStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "outputMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "BridgeAgentChatReplyJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeAgentChatRoom_dmKey_key"
  ON "BridgeAgentChatRoom"("dmKey");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatRoom_shipDeploymentId_updatedAt_idx"
  ON "BridgeAgentChatRoom"("shipDeploymentId", "updatedAt");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatRoom_shipDeploymentId_roomType_idx"
  ON "BridgeAgentChatRoom"("shipDeploymentId", "roomType");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatRoom_createdByBridgeCrewId_idx"
  ON "BridgeAgentChatRoom"("createdByBridgeCrewId");

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeAgentChatMember_roomId_bridgeCrewId_key"
  ON "BridgeAgentChatMember"("roomId", "bridgeCrewId");
CREATE UNIQUE INDEX IF NOT EXISTS "BridgeAgentChatMember_roomId_sessionId_key"
  ON "BridgeAgentChatMember"("roomId", "sessionId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatMember_bridgeCrewId_idx"
  ON "BridgeAgentChatMember"("bridgeCrewId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatMember_sessionId_idx"
  ON "BridgeAgentChatMember"("sessionId");

CREATE INDEX IF NOT EXISTS "BridgeAgentChatMessage_roomId_createdAt_idx"
  ON "BridgeAgentChatMessage"("roomId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatMessage_senderBridgeCrewId_createdAt_idx"
  ON "BridgeAgentChatMessage"("senderBridgeCrewId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatMessage_inReplyToMessageId_idx"
  ON "BridgeAgentChatMessage"("inReplyToMessageId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatMessage_createdAt_idx"
  ON "BridgeAgentChatMessage"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_dedupeKey_key"
  ON "BridgeAgentChatReplyJob"("dedupeKey");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_status_nextAttemptAt_idx"
  ON "BridgeAgentChatReplyJob"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_shipDeploymentId_createdAt_idx"
  ON "BridgeAgentChatReplyJob"("shipDeploymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_roomId_createdAt_idx"
  ON "BridgeAgentChatReplyJob"("roomId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_sourceMessageId_idx"
  ON "BridgeAgentChatReplyJob"("sourceMessageId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_recipientBridgeCrewId_idx"
  ON "BridgeAgentChatReplyJob"("recipientBridgeCrewId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_recipientSessionId_idx"
  ON "BridgeAgentChatReplyJob"("recipientSessionId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_outputMessageId_idx"
  ON "BridgeAgentChatReplyJob"("outputMessageId");
CREATE INDEX IF NOT EXISTS "BridgeAgentChatReplyJob_createdAt_idx"
  ON "BridgeAgentChatReplyJob"("createdAt");

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatRoom"
    ADD CONSTRAINT "BridgeAgentChatRoom_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatRoom"
    ADD CONSTRAINT "BridgeAgentChatRoom_createdByBridgeCrewId_fkey"
    FOREIGN KEY ("createdByBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatMember"
    ADD CONSTRAINT "BridgeAgentChatMember_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "BridgeAgentChatRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatMember"
    ADD CONSTRAINT "BridgeAgentChatMember_bridgeCrewId_fkey"
    FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatMember"
    ADD CONSTRAINT "BridgeAgentChatMember_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatMessage"
    ADD CONSTRAINT "BridgeAgentChatMessage_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "BridgeAgentChatRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatMessage"
    ADD CONSTRAINT "BridgeAgentChatMessage_senderBridgeCrewId_fkey"
    FOREIGN KEY ("senderBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatMessage"
    ADD CONSTRAINT "BridgeAgentChatMessage_inReplyToMessageId_fkey"
    FOREIGN KEY ("inReplyToMessageId") REFERENCES "BridgeAgentChatMessage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatReplyJob"
    ADD CONSTRAINT "BridgeAgentChatReplyJob_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatReplyJob"
    ADD CONSTRAINT "BridgeAgentChatReplyJob_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "BridgeAgentChatRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatReplyJob"
    ADD CONSTRAINT "BridgeAgentChatReplyJob_sourceMessageId_fkey"
    FOREIGN KEY ("sourceMessageId") REFERENCES "BridgeAgentChatMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatReplyJob"
    ADD CONSTRAINT "BridgeAgentChatReplyJob_recipientBridgeCrewId_fkey"
    FOREIGN KEY ("recipientBridgeCrewId") REFERENCES "BridgeCrew"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatReplyJob"
    ADD CONSTRAINT "BridgeAgentChatReplyJob_recipientSessionId_fkey"
    FOREIGN KEY ("recipientSessionId") REFERENCES "Session"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeAgentChatReplyJob"
    ADD CONSTRAINT "BridgeAgentChatReplyJob_outputMessageId_fkey"
    FOREIGN KEY ("outputMessageId") REFERENCES "BridgeAgentChatMessage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
