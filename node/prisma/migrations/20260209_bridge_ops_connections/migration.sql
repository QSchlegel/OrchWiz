DO $$ BEGIN
  CREATE TYPE "BridgeConnectionProvider" AS ENUM (
    'telegram',
    'discord',
    'whatsapp'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeDispatchSource" AS ENUM (
    'cou_auto',
    'manual',
    'test'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeDispatchStatus" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BridgeConnection" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "provider" "BridgeConnectionProvider" NOT NULL,
  "name" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "autoRelay" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "credentials" JSONB NOT NULL,
  "lastDeliveryAt" TIMESTAMP(3),
  "lastDeliveryStatus" "BridgeDispatchStatus",
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeConnection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BridgeConnection_deploymentId_idx" ON "BridgeConnection"("deploymentId");
CREATE INDEX IF NOT EXISTS "BridgeConnection_deploymentId_enabled_idx" ON "BridgeConnection"("deploymentId", "enabled");
CREATE INDEX IF NOT EXISTS "BridgeConnection_provider_idx" ON "BridgeConnection"("provider");
CREATE INDEX IF NOT EXISTS "BridgeConnection_updatedAt_idx" ON "BridgeConnection"("updatedAt");

CREATE TABLE IF NOT EXISTS "BridgeDispatchDelivery" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "source" "BridgeDispatchSource" NOT NULL,
  "status" "BridgeDispatchStatus" NOT NULL DEFAULT 'pending',
  "dedupeKey" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "result" JSONB,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BridgeDispatchDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BridgeDispatchDelivery_dedupeKey_key" ON "BridgeDispatchDelivery"("dedupeKey");
CREATE INDEX IF NOT EXISTS "BridgeDispatchDelivery_deploymentId_createdAt_idx" ON "BridgeDispatchDelivery"("deploymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeDispatchDelivery_connectionId_createdAt_idx" ON "BridgeDispatchDelivery"("connectionId", "createdAt");
CREATE INDEX IF NOT EXISTS "BridgeDispatchDelivery_status_nextAttemptAt_idx" ON "BridgeDispatchDelivery"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "BridgeDispatchDelivery_source_createdAt_idx" ON "BridgeDispatchDelivery"("source", "createdAt");

DO $$ BEGIN
  ALTER TABLE "BridgeConnection"
    ADD CONSTRAINT "BridgeConnection_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeDispatchDelivery"
    ADD CONSTRAINT "BridgeDispatchDelivery_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BridgeDispatchDelivery"
    ADD CONSTRAINT "BridgeDispatchDelivery_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "BridgeConnection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
