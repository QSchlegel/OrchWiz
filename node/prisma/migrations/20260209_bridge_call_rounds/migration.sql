DO $$ BEGIN
  CREATE TYPE "BridgeCallRoundSource" AS ENUM ('operator', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeCallRoundStatus" AS ENUM ('pending', 'running', 'completed', 'partial', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeCallOfficerResultStatus" AS ENUM ('success', 'offline', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BridgeCallRound" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shipDeploymentId" TEXT,
  "directive" TEXT NOT NULL,
  "source" "BridgeCallRoundSource" NOT NULL DEFAULT 'operator',
  "status" "BridgeCallRoundStatus" NOT NULL DEFAULT 'pending',
  "leadStationKey" "BridgeCrewRole",
  "summary" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "BridgeCallRound_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeCallOfficerResult" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "stationKey" "BridgeCrewRole" NOT NULL,
  "callsign" TEXT NOT NULL,
  "status" "BridgeCallOfficerResultStatus" NOT NULL,
  "wasRetried" BOOLEAN NOT NULL DEFAULT false,
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "error" TEXT,
  "summary" TEXT,
  "threadId" TEXT,
  "sessionId" TEXT,
  "userInteractionId" TEXT,
  "aiInteractionId" TEXT,
  "provider" TEXT,
  "fallbackUsed" BOOLEAN,
  "latencyMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeCallOfficerResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BridgeCallRound_userId_createdAt_idx"
  ON "BridgeCallRound"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeCallRound_userId_shipDeploymentId_createdAt_idx"
  ON "BridgeCallRound"("userId", "shipDeploymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeCallRound_shipDeploymentId_idx"
  ON "BridgeCallRound"("shipDeploymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeCallOfficerResult_roundId_stationKey_key"
  ON "BridgeCallOfficerResult"("roundId", "stationKey");
CREATE INDEX IF NOT EXISTS "BridgeCallOfficerResult_roundId_idx"
  ON "BridgeCallOfficerResult"("roundId");
CREATE INDEX IF NOT EXISTS "BridgeCallOfficerResult_stationKey_idx"
  ON "BridgeCallOfficerResult"("stationKey");
CREATE INDEX IF NOT EXISTS "BridgeCallOfficerResult_status_idx"
  ON "BridgeCallOfficerResult"("status");

DO $$ BEGIN
  ALTER TABLE "BridgeCallRound"
    ADD CONSTRAINT "BridgeCallRound_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCallRound"
    ADD CONSTRAINT "BridgeCallRound_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeCallOfficerResult"
    ADD CONSTRAINT "BridgeCallOfficerResult_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "BridgeCallRound"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
