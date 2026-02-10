ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isAnonymous" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  CREATE TYPE "NewsletterSubscriptionStatus" AS ENUM ('subscribed', 'unsubscribed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "NewsletterSubscription" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "source" TEXT NOT NULL,
  "status" "NewsletterSubscriptionStatus" NOT NULL DEFAULT 'subscribed',
  "metadata" JSONB,
  "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unsubscribedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NewsletterSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscription_email_key" ON "NewsletterSubscription"("email");
CREATE INDEX IF NOT EXISTS "NewsletterSubscription_userId_createdAt_idx" ON "NewsletterSubscription"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NewsletterSubscription_status_createdAt_idx" ON "NewsletterSubscription"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "NewsletterSubscription"
    ADD CONSTRAINT "NewsletterSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
