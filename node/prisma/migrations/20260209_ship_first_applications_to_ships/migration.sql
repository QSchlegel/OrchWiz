ALTER TABLE "ApplicationDeployment"
  ADD COLUMN IF NOT EXISTS "shipDeploymentId" TEXT;

-- First pass: map applications to existing ships by userId + nodeId.
WITH best_ship AS (
  SELECT
    app."id" AS app_id,
    ship."id" AS ship_id
  FROM "ApplicationDeployment" app
  LEFT JOIN LATERAL (
    SELECT s."id"
    FROM "AgentDeployment" s
    WHERE s."userId" = app."userId"
      AND s."nodeId" = app."nodeId"
      AND s."deploymentType" = 'ship'
    ORDER BY
      CASE
        WHEN s."status" = 'active' THEN 0
        WHEN s."status" = 'deploying' THEN 1
        WHEN s."status" = 'updating' THEN 2
        ELSE 3
      END,
      s."updatedAt" DESC,
      s."createdAt" DESC
    LIMIT 1
  ) ship ON true
  WHERE app."shipDeploymentId" IS NULL
)
UPDATE "ApplicationDeployment" app
SET "shipDeploymentId" = best_ship.ship_id
FROM best_ship
WHERE app."id" = best_ship.app_id
  AND best_ship.ship_id IS NOT NULL;

-- Create inferred ships for remaining applications that still have no ship link.
WITH unmatched AS (
  SELECT DISTINCT ON (app."userId", app."nodeId")
    app."userId",
    app."nodeId",
    app."nodeType",
    app."deploymentProfile",
    app."provisioningMode",
    app."nodeUrl",
    app."config"
  FROM "ApplicationDeployment" app
  WHERE app."shipDeploymentId" IS NULL
  ORDER BY app."userId", app."nodeId", app."createdAt" DESC
)
INSERT INTO "AgentDeployment" (
  "id",
  "name",
  "description",
  "subagentId",
  "nodeId",
  "nodeType",
  "deploymentType",
  "deploymentProfile",
  "provisioningMode",
  "nodeUrl",
  "status",
  "config",
  "metadata",
  "deployedAt",
  "lastHealthCheck",
  "healthStatus",
  "userId",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('ship_inferred_', SUBSTRING(MD5(unmatched."userId" || ':' || unmatched."nodeId") FROM 1 FOR 20)) AS "id",
  CONCAT('Inferred Ship ', unmatched."nodeId") AS "name",
  'Inferred during ship-first application migration' AS "description",
  NULL AS "subagentId",
  unmatched."nodeId",
  unmatched."nodeType",
  'ship'::"DeploymentType" AS "deploymentType",
  unmatched."deploymentProfile",
  unmatched."provisioningMode",
  unmatched."nodeUrl",
  'active'::"DeploymentStatus" AS "status",
  COALESCE(unmatched."config", '{}'::jsonb) AS "config",
  jsonb_build_object(
    'inferred', true,
    'inferredFrom', 'application_ship_link_migration',
    'inferredAt', NOW()
  ) AS "metadata",
  NOW() AS "deployedAt",
  NOW() AS "lastHealthCheck",
  'healthy' AS "healthStatus",
  unmatched."userId",
  NOW() AS "createdAt",
  NOW() AS "updatedAt"
FROM unmatched
WHERE NOT EXISTS (
  SELECT 1
  FROM "AgentDeployment" ship
  WHERE ship."userId" = unmatched."userId"
    AND ship."nodeId" = unmatched."nodeId"
    AND ship."deploymentType" = 'ship'
)
ON CONFLICT ("id") DO NOTHING;

-- Second pass: map any remaining applications to newly created inferred ships.
WITH best_ship AS (
  SELECT
    app."id" AS app_id,
    ship."id" AS ship_id
  FROM "ApplicationDeployment" app
  LEFT JOIN LATERAL (
    SELECT s."id"
    FROM "AgentDeployment" s
    WHERE s."userId" = app."userId"
      AND s."nodeId" = app."nodeId"
      AND s."deploymentType" = 'ship'
    ORDER BY
      CASE
        WHEN s."status" = 'active' THEN 0
        WHEN s."status" = 'deploying' THEN 1
        WHEN s."status" = 'updating' THEN 2
        ELSE 3
      END,
      s."updatedAt" DESC,
      s."createdAt" DESC
    LIMIT 1
  ) ship ON true
  WHERE app."shipDeploymentId" IS NULL
)
UPDATE "ApplicationDeployment" app
SET "shipDeploymentId" = best_ship.ship_id
FROM best_ship
WHERE app."id" = best_ship.app_id
  AND best_ship.ship_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ApplicationDeployment_shipDeploymentId_idx"
  ON "ApplicationDeployment"("shipDeploymentId");

DO $$ BEGIN
  ALTER TABLE "ApplicationDeployment"
    ADD CONSTRAINT "ApplicationDeployment_shipDeploymentId_fkey"
    FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ApplicationDeployment"
  ALTER COLUMN "shipDeploymentId" SET NOT NULL;
