DO $$ BEGIN
  CREATE TYPE "BridgeChatRole" AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeMirrorDirection" AS ENUM ('thread_to_session', 'session_to_thread');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeMirrorJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BridgeThread" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "userId" TEXT,
  "stationKey" "BridgeCrewRole",
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "BridgeChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeMirrorLink" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "interactionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeMirrorLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BridgeMirrorJob" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "direction" "BridgeMirrorDirection" NOT NULL,
  "status" "BridgeMirrorJobStatus" NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "lastError" TEXT,
  "threadId" TEXT,
  "sessionId" TEXT,
  "messageId" TEXT,
  "interactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeMirrorJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeThread_sessionId_key"
  ON "BridgeThread"("sessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "BridgeThread_userId_stationKey_key"
  ON "BridgeThread"("userId", "stationKey");
CREATE INDEX IF NOT EXISTS "BridgeThread_userId_idx"
  ON "BridgeThread"("userId");
CREATE INDEX IF NOT EXISTS "BridgeThread_stationKey_idx"
  ON "BridgeThread"("stationKey");
CREATE INDEX IF NOT EXISTS "BridgeThread_updatedAt_idx"
  ON "BridgeThread"("updatedAt");

CREATE INDEX IF NOT EXISTS "BridgeMessage_threadId_createdAt_idx"
  ON "BridgeMessage"("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeMessage_createdAt_idx"
  ON "BridgeMessage"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeMirrorLink_messageId_key"
  ON "BridgeMirrorLink"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "BridgeMirrorLink_interactionId_key"
  ON "BridgeMirrorLink"("interactionId");
CREATE INDEX IF NOT EXISTS "BridgeMirrorLink_createdAt_idx"
  ON "BridgeMirrorLink"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeMirrorJob_dedupeKey_key"
  ON "BridgeMirrorJob"("dedupeKey");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_status_nextAttemptAt_idx"
  ON "BridgeMirrorJob"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_direction_idx"
  ON "BridgeMirrorJob"("direction");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_threadId_idx"
  ON "BridgeMirrorJob"("threadId");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_sessionId_idx"
  ON "BridgeMirrorJob"("sessionId");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_messageId_idx"
  ON "BridgeMirrorJob"("messageId");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_interactionId_idx"
  ON "BridgeMirrorJob"("interactionId");
CREATE INDEX IF NOT EXISTS "BridgeMirrorJob_createdAt_idx"
  ON "BridgeMirrorJob"("createdAt");

DO $$ BEGIN
  ALTER TABLE "BridgeThread"
    ADD CONSTRAINT "BridgeThread_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeThread"
    ADD CONSTRAINT "BridgeThread_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMessage"
    ADD CONSTRAINT "BridgeMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "BridgeThread"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMirrorLink"
    ADD CONSTRAINT "BridgeMirrorLink_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "BridgeMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMirrorLink"
    ADD CONSTRAINT "BridgeMirrorLink_interactionId_fkey"
    FOREIGN KEY ("interactionId") REFERENCES "SessionInteraction"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMirrorJob"
    ADD CONSTRAINT "BridgeMirrorJob_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "BridgeThread"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMirrorJob"
    ADD CONSTRAINT "BridgeMirrorJob_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMirrorJob"
    ADD CONSTRAINT "BridgeMirrorJob_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "BridgeMessage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeMirrorJob"
    ADD CONSTRAINT "BridgeMirrorJob_interactionId_fkey"
    FOREIGN KEY ("interactionId") REFERENCES "SessionInteraction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
