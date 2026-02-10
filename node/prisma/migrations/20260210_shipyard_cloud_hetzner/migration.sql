DO $$ BEGIN
  CREATE TYPE "CloudProvider" AS ENUM ('hetzner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShipyardTunnelStatus" AS ENUM ('stopped', 'starting', 'running', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ShipyardCloudCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "CloudProvider" NOT NULL,
  "tokenEnvelope" JSONB NOT NULL,
  "metadata" JSONB,
  "lastValidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipyardCloudCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipyardCloudCredential_userId_provider_key"
  ON "ShipyardCloudCredential"("userId", "provider");

CREATE INDEX IF NOT EXISTS "ShipyardCloudCredential_userId_idx"
  ON "ShipyardCloudCredential"("userId");

CREATE INDEX IF NOT EXISTS "ShipyardCloudCredential_provider_idx"
  ON "ShipyardCloudCredential"("provider");

DO $$ BEGIN
  ALTER TABLE "ShipyardCloudCredential"
    ADD CONSTRAINT "ShipyardCloudCredential_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ShipyardCloudSshKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "CloudProvider" NOT NULL,
  "name" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "privateKeyEnvelope" JSONB NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipyardCloudSshKey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShipyardCloudSshKey_userId_provider_idx"
  ON "ShipyardCloudSshKey"("userId", "provider");

CREATE INDEX IF NOT EXISTS "ShipyardCloudSshKey_fingerprint_idx"
  ON "ShipyardCloudSshKey"("fingerprint");

CREATE INDEX IF NOT EXISTS "ShipyardCloudSshKey_name_idx"
  ON "ShipyardCloudSshKey"("name");

DO $$ BEGIN
  ALTER TABLE "ShipyardCloudSshKey"
    ADD CONSTRAINT "ShipyardCloudSshKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ShipyardSshTunnel" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentId" TEXT,
  "provider" "CloudProvider" NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ShipyardTunnelStatus" NOT NULL DEFAULT 'stopped',
  "localHost" TEXT NOT NULL DEFAULT '127.0.0.1',
  "localPort" INTEGER NOT NULL,
  "remoteHost" TEXT NOT NULL,
  "remotePort" INTEGER NOT NULL,
  "sshHost" TEXT NOT NULL,
  "sshPort" INTEGER NOT NULL DEFAULT 22,
  "sshUser" TEXT NOT NULL DEFAULT 'root',
  "sshKeyId" TEXT,
  "pid" INTEGER,
  "pidFile" TEXT,
  "controlSocket" TEXT,
  "keyFilePath" TEXT,
  "lastHealthCheck" TIMESTAMP(3),
  "lastError" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipyardSshTunnel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShipyardSshTunnel_userId_provider_idx"
  ON "ShipyardSshTunnel"("userId", "provider");

CREATE INDEX IF NOT EXISTS "ShipyardSshTunnel_deploymentId_idx"
  ON "ShipyardSshTunnel"("deploymentId");

CREATE INDEX IF NOT EXISTS "ShipyardSshTunnel_status_idx"
  ON "ShipyardSshTunnel"("status");

CREATE INDEX IF NOT EXISTS "ShipyardSshTunnel_sshKeyId_idx"
  ON "ShipyardSshTunnel"("sshKeyId");

DO $$ BEGIN
  ALTER TABLE "ShipyardSshTunnel"
    ADD CONSTRAINT "ShipyardSshTunnel_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipyardSshTunnel"
    ADD CONSTRAINT "ShipyardSshTunnel_deploymentId_fkey"
    FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipyardSshTunnel"
    ADD CONSTRAINT "ShipyardSshTunnel_sshKeyId_fkey"
    FOREIGN KEY ("sshKeyId") REFERENCES "ShipyardCloudSshKey"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
