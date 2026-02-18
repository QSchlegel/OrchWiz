CREATE TABLE IF NOT EXISTS "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "langfuseCloudUrl" TEXT,
    "langfuseCloudProject" TEXT,
    "langfuseCloudPublicKey" TEXT,
    "langfuseCloudSecretKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSetting_userId_key" ON "UserSetting"("userId");
CREATE INDEX IF NOT EXISTS "UserSetting_userId_idx" ON "UserSetting"("userId");

DO $$ BEGIN
  ALTER TABLE "UserSetting"
  ADD CONSTRAINT "UserSetting_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
