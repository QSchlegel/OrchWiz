CREATE TABLE IF NOT EXISTS "ShipyardApiKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT,
  "keyId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipyardApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipyardApiKey_keyId_key" ON "ShipyardApiKey"("keyId");
CREATE INDEX IF NOT EXISTS "ShipyardApiKey_userId_revokedAt_createdAt_idx" ON "ShipyardApiKey"("userId", "revokedAt", "createdAt");
CREATE INDEX IF NOT EXISTS "ShipyardApiKey_userId_idx" ON "ShipyardApiKey"("userId");

DO $$ BEGIN
  ALTER TABLE "ShipyardApiKey"
    ADD CONSTRAINT "ShipyardApiKey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
