ALTER TABLE "RuntimePerformanceSample"
  ADD COLUMN IF NOT EXISTS "executionKind" TEXT,
  ADD COLUMN IF NOT EXISTS "intelligenceTier" TEXT,
  ADD COLUMN IF NOT EXISTS "intelligenceDecision" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedModel" TEXT,
  ADD COLUMN IF NOT EXISTS "classifierModel" TEXT,
  ADD COLUMN IF NOT EXISTS "classifierConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "thresholdBefore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "thresholdAfter" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rewardScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedPromptTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedCompletionTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedTotalTokens" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedCostUsd" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedCostEur" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "baselineMaxCostUsd" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "baselineMaxCostEur" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedSavingsUsd" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedSavingsEur" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "currencyFxUsdToEur" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "economicsEstimated" BOOLEAN;

CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_executionKind_createdAt_idx"
  ON "RuntimePerformanceSample"("executionKind", "createdAt");

CREATE INDEX IF NOT EXISTS "RuntimePerformanceSample_intelligenceTier_createdAt_idx"
  ON "RuntimePerformanceSample"("intelligenceTier", "createdAt");

CREATE TABLE IF NOT EXISTS "RuntimeIntelligencePolicyState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "threshold" DOUBLE PRECISION NOT NULL,
  "explorationRate" DOUBLE PRECISION NOT NULL,
  "learningRate" DOUBLE PRECISION NOT NULL,
  "targetReward" DOUBLE PRECISION NOT NULL,
  "emaReward" DOUBLE PRECISION NOT NULL,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  "lastConsolidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RuntimeIntelligencePolicyState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RuntimeIntelligencePolicyState_userId_key"
  ON "RuntimeIntelligencePolicyState"("userId");

CREATE INDEX IF NOT EXISTS "RuntimeIntelligencePolicyState_updatedAt_idx"
  ON "RuntimeIntelligencePolicyState"("updatedAt");

DO $$ BEGIN
  ALTER TABLE "RuntimeIntelligencePolicyState"
    ADD CONSTRAINT "RuntimeIntelligencePolicyState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
