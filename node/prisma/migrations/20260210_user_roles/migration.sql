DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('captain', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" "UserRole" NOT NULL DEFAULT 'captain';
