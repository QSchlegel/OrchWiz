CREATE TABLE IF NOT EXISTS "SecurityLockdownConfig" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityLockdownConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityLockdownConfig_ownerUserId_key" ON "SecurityLockdownConfig"("ownerUserId");
CREATE INDEX IF NOT EXISTS "SecurityLockdownConfig_ownerUserId_idx" ON "SecurityLockdownConfig"("ownerUserId");
CREATE INDEX IF NOT EXISTS "SecurityLockdownConfig_enabled_idx" ON "SecurityLockdownConfig"("enabled");

DO $$ BEGIN
  ALTER TABLE "SecurityLockdownConfig"
    ADD CONSTRAINT "SecurityLockdownConfig_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

