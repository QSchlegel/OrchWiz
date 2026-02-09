ALTER TABLE "BridgeCrew"
  ADD COLUMN IF NOT EXISTS "walletEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "walletAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "walletKeyRef" TEXT,
  ADD COLUMN IF NOT EXISTS "walletEnclaveUrl" TEXT;

CREATE INDEX IF NOT EXISTS "BridgeCrew_walletEnabled_idx"
  ON "BridgeCrew"("walletEnabled");

CREATE INDEX IF NOT EXISTS "BridgeCrew_walletKeyRef_idx"
  ON "BridgeCrew"("walletKeyRef");
