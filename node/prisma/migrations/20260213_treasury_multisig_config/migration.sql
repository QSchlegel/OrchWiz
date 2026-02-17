DO $$ BEGIN
  CREATE TYPE "TreasuryBackend" AS ENUM (
    'mesh_multisig'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TreasuryNetwork" AS ENUM (
    'preview',
    'preprod',
    'mainnet'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TreasuryConfig" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "backend" "TreasuryBackend" NOT NULL DEFAULT 'mesh_multisig',
  "network" "TreasuryNetwork" NOT NULL DEFAULT 'preprod',
  "meshBaseUrl" TEXT NOT NULL,
  "meshWalletId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreasuryConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TreasuryConfig_key_key" ON "TreasuryConfig"("key");
CREATE INDEX IF NOT EXISTS "TreasuryConfig_updatedAt_idx" ON "TreasuryConfig"("updatedAt" DESC);

DO $$ BEGIN
  ALTER TABLE "TreasuryConfig"
    ADD CONSTRAINT "TreasuryConfig_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
