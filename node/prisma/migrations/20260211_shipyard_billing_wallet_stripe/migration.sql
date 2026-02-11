DO $$ BEGIN
  CREATE TYPE "ShipyardBillingCurrency" AS ENUM ('eur');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShipyardBillingTopupStatus" AS ENUM ('pending', 'completed', 'expired', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ShipyardBillingLedgerType" AS ENUM ('topup_credit', 'launch_debit', 'launch_refund', 'manual_adjustment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ShipyardBillingWallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currency" "ShipyardBillingCurrency" NOT NULL DEFAULT 'eur',
  "balanceCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipyardBillingWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShipyardBillingTopup" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT NOT NULL,
  "stripePaymentIntentId" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" "ShipyardBillingCurrency" NOT NULL DEFAULT 'eur',
  "status" "ShipyardBillingTopupStatus" NOT NULL DEFAULT 'pending',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "ShipyardBillingTopup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShipyardBillingLedgerEntry" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ShipyardBillingLedgerType" NOT NULL,
  "deltaCents" INTEGER NOT NULL,
  "balanceAfterCents" INTEGER NOT NULL,
  "currency" "ShipyardBillingCurrency" NOT NULL DEFAULT 'eur',
  "referenceType" TEXT,
  "referenceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipyardBillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipyardBillingWallet_userId_key" ON "ShipyardBillingWallet"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ShipyardBillingTopup_stripeCheckoutSessionId_key" ON "ShipyardBillingTopup"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ShipyardBillingLedgerEntry_type_referenceType_referenceId_key"
  ON "ShipyardBillingLedgerEntry"("type", "referenceType", "referenceId");

CREATE INDEX IF NOT EXISTS "ShipyardBillingTopup_walletId_createdAt_idx" ON "ShipyardBillingTopup"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipyardBillingTopup_userId_createdAt_idx" ON "ShipyardBillingTopup"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipyardBillingTopup_status_createdAt_idx" ON "ShipyardBillingTopup"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "ShipyardBillingLedgerEntry_walletId_createdAt_idx" ON "ShipyardBillingLedgerEntry"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipyardBillingLedgerEntry_userId_createdAt_idx" ON "ShipyardBillingLedgerEntry"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipyardBillingLedgerEntry_type_createdAt_idx" ON "ShipyardBillingLedgerEntry"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipyardBillingLedgerEntry_referenceType_referenceId_idx" ON "ShipyardBillingLedgerEntry"("referenceType", "referenceId");

DO $$ BEGIN
  ALTER TABLE "ShipyardBillingWallet"
    ADD CONSTRAINT "ShipyardBillingWallet_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipyardBillingTopup"
    ADD CONSTRAINT "ShipyardBillingTopup_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "ShipyardBillingWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipyardBillingTopup"
    ADD CONSTRAINT "ShipyardBillingTopup_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipyardBillingLedgerEntry"
    ADD CONSTRAINT "ShipyardBillingLedgerEntry_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "ShipyardBillingWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ShipyardBillingLedgerEntry"
    ADD CONSTRAINT "ShipyardBillingLedgerEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
