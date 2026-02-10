CREATE TABLE IF NOT EXISTS "ShipyardSecretTemplate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deploymentProfile" "DeploymentProfile" NOT NULL,
  "secrets" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShipyardSecretTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShipyardSecretTemplate_userId_deploymentProfile_key"
  ON "ShipyardSecretTemplate"("userId", "deploymentProfile");

CREATE INDEX IF NOT EXISTS "ShipyardSecretTemplate_userId_idx"
  ON "ShipyardSecretTemplate"("userId");

DO $$ BEGIN
  ALTER TABLE "ShipyardSecretTemplate"
    ADD CONSTRAINT "ShipyardSecretTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
