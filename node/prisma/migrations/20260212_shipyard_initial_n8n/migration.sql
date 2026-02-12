DO $$ BEGIN
  ALTER TYPE "ApplicationType" ADD VALUE 'n8n';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
