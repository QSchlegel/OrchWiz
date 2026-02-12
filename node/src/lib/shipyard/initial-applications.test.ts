import assert from "node:assert/strict"
import test from "node:test"
import type { DeploymentAdapterResult } from "@/lib/deployment/adapter"
import {
  bootstrapInitialApplicationsForShip,
  bootstrapInitialApplicationsForShipFailOpen,
  type ShipBootstrapTarget,
} from "./initial-applications"

function shipTarget(): ShipBootstrapTarget {
  return {
    id: "ship-1",
    name: "USS Test",
    userId: "user-1",
    nodeId: "node-1",
    nodeType: "local",
    nodeUrl: "http://localhost:3000",
    deploymentProfile: "local_starship_build",
    provisioningMode: "terraform_ansible",
    config: {
      infrastructure: {
        kind: "kind",
        kubeContext: "kind-orchwiz",
        namespace: "orchwiz-starship",
        terraformWorkspace: "starship-local",
        terraformEnvDir: "infra/terraform/environments/starship-local",
        ansibleInventory: "infra/ansible/inventory/local.ini",
        ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
      },
    },
  }
}

function n8nSecrets() {
  return {
    n8n_database_url: "postgresql://n8n:n8npass@postgres.default.svc.cluster.local:5432/n8n?schema=public",
    n8n_basic_auth_user: "captain",
    n8n_basic_auth_password: "super-secret",
    n8n_encryption_key: "12345678901234567890123456789012",
    n8n_public_base_url: "https://n8n.ship.local",
  }
}

function makePrismaHarness(options?: {
  existingApplicationId?: string
  storedSecrets?: unknown
}) {
  let applicationRecord: Record<string, unknown> | null =
    options?.existingApplicationId
      ? {
          id: options.existingApplicationId,
          name: "n8n",
          description: "existing",
          applicationType: "n8n",
          image: "docker.n8n.io/n8nio/n8n:latest",
          repository: null,
          branch: null,
          buildCommand: null,
          startCommand: null,
          port: 5678,
          environment: {},
          shipDeploymentId: "ship-1",
          nodeId: "node-1",
          nodeType: "local",
          deploymentProfile: "local_starship_build",
          provisioningMode: "terraform_ansible",
          nodeUrl: "http://localhost:3000",
          status: "pending",
          config: {},
          metadata: {},
          deployedAt: null,
          lastHealthCheck: null,
          healthStatus: null,
          version: null,
          userId: "user-1",
          createdAt: new Date("2026-02-12T12:00:00.000Z"),
          updatedAt: new Date("2026-02-12T12:00:00.000Z"),
        }
      : null

  let createCount = 0
  let updateCount = 0

  const prismaStub = {
    shipyardSecretTemplate: {
      findUnique: async () =>
        options?.storedSecrets === undefined ? null : { secrets: options.storedSecrets },
    },
    applicationDeployment: {
      findFirst: async () => applicationRecord,
      create: async (args: any) => {
        createCount += 1
        applicationRecord = {
          id: "app-n8n-1",
          deployedAt: null,
          lastHealthCheck: null,
          healthStatus: null,
          version: null,
          createdAt: new Date("2026-02-12T12:00:00.000Z"),
          updatedAt: new Date("2026-02-12T12:00:00.000Z"),
          ...(args.data as Record<string, unknown>),
        }
        return applicationRecord
      },
      update: async (args: any) => {
        updateCount += 1
        const data = args.data as Record<string, unknown>
        applicationRecord = {
          ...(applicationRecord || { id: args.where.id }),
          ...data,
          updatedAt: new Date("2026-02-12T12:01:00.000Z"),
        }
        return applicationRecord
      },
    },
  }

  return {
    prismaStub,
    getApplication: () => applicationRecord,
    getCreateCount: () => createCount,
    getUpdateCount: () => updateCount,
  }
}

function adapterResult(status: "active" | "failed", error?: string): DeploymentAdapterResult {
  return {
    status,
    deployedAt: new Date("2026-02-12T12:02:00.000Z"),
    lastHealthCheck: new Date("2026-02-12T12:02:00.000Z"),
    healthStatus: status === "active" ? "healthy" : "unhealthy",
    ...(error ? { error } : {}),
    metadata: {
      mode: "test",
    },
  }
}

test("bootstrapInitialApplicationsForShip returns degraded when required n8n secrets are missing", async () => {
  const harness = makePrismaHarness({
    storedSecrets: {},
  })

  let adapterCalls = 0
  const result = await bootstrapInitialApplicationsForShip(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
    },
    {
      prismaClient: harness.prismaStub as any,
      runDeploymentAdapterFn: async () => {
        adapterCalls += 1
        return adapterResult("active")
      },
      resolveShipyardSecretTemplateValuesFn: async () => ({}),
      importCuratedToolForUserFn: async () => {
        throw new Error("should not import")
      },
      ensureShipToolGrantForBootstrapFn: async () => {
        throw new Error("should not grant")
      },
    },
  )

  assert.equal(result.n8n.status, "degraded")
  assert.deepEqual(result.n8n.missingSecrets, [
    "n8n_database_url",
    "n8n_basic_auth_user",
    "n8n_basic_auth_password",
    "n8n_encryption_key",
    "n8n_public_base_url",
  ])
  assert.equal(result.n8n.applicationId, null)
  assert.equal(adapterCalls, 0)
})

test("bootstrapInitialApplicationsForShip deploys n8n and grants tool when everything succeeds", async () => {
  const harness = makePrismaHarness({
    storedSecrets: n8nSecrets(),
  })

  const published: string[] = []
  const result = await bootstrapInitialApplicationsForShip(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
    },
    {
      prismaClient: harness.prismaStub as any,
      runDeploymentAdapterFn: async () => adapterResult("active"),
      publishShipApplicationUpdatedFn: (input) => {
        published.push(input.applicationId)
      },
      resolveShipyardSecretTemplateValuesFn: async () => n8nSecrets(),
      importCuratedToolForUserFn: async () => ({
        run: {
          id: "run-1",
          ownerUserId: "user-1",
          catalogEntryId: "tool-n8n",
          mode: "curated",
          source: "curated",
          toolSlug: "n8n",
          repo: "example/n8n-tool",
          sourcePath: ".",
          sourceRef: "main",
          sourceUrl: "https://github.com/example/n8n-tool",
          status: "succeeded",
          exitCode: 0,
          stdout: "",
          stderr: "",
          errorMessage: null,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        entry: {
          id: "tool-n8n",
          slug: "n8n",
          name: "n8n Connector",
          description: null,
          source: "curated",
          sourceKey: "curated|example/n8n-tool|.|main|n8n",
          repo: "example/n8n-tool",
          sourcePath: ".",
          sourceRef: "main",
          sourceUrl: "https://github.com/example/n8n-tool",
          isInstalled: true,
          isSystem: false,
          installedPath: "/tmp/tools/n8n",
          activationStatus: "approved",
          activationRationale: null,
          activatedAt: null,
          activatedByUserId: null,
          activatedByBridgeCrewId: null,
          activationSecurityReportId: null,
          metadata: null,
          ownerUserId: "user-1",
          lastSyncedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
      ensureShipToolGrantForBootstrapFn: async () =>
        ({
          id: "grant-n8n",
        } as any),
    },
  )

  assert.equal(result.n8n.status, "ready")
  assert.equal(result.n8n.applicationId, "app-n8n-1")
  assert.equal(result.n8n.toolCatalogEntryId, "tool-n8n")
  assert.equal(result.n8n.toolGrantId, "grant-n8n")
  assert.equal(result.n8n.attempts, 1)
  assert.equal(published.length, 1)
})

test("bootstrapInitialApplicationsForShip retries once and succeeds on second adapter attempt", async () => {
  const harness = makePrismaHarness({
    storedSecrets: n8nSecrets(),
  })

  let attempts = 0
  const result = await bootstrapInitialApplicationsForShip(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
    },
    {
      prismaClient: harness.prismaStub as any,
      runDeploymentAdapterFn: async () => {
        attempts += 1
        if (attempts === 1) {
          return adapterResult("failed", "first failure")
        }
        return adapterResult("active")
      },
      resolveShipyardSecretTemplateValuesFn: async () => n8nSecrets(),
      importCuratedToolForUserFn: async () =>
        ({
          run: {
            id: "run-1",
            ownerUserId: "user-1",
            catalogEntryId: "tool-n8n",
            mode: "curated",
            source: "curated",
            toolSlug: "n8n",
            repo: "example/n8n-tool",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: "https://github.com/example/n8n-tool",
            status: "succeeded",
            exitCode: 0,
            stdout: "",
            stderr: "",
            errorMessage: null,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          entry: {
            id: "tool-n8n",
          },
        } as any),
      ensureShipToolGrantForBootstrapFn: async () =>
        ({
          id: "grant-n8n",
        } as any),
      sleepFn: async () => {},
    },
  )

  assert.equal(result.n8n.status, "ready")
  assert.equal(result.n8n.attempts, 2)
  assert.equal(result.n8n.errors.length, 0)
  assert.ok(result.n8n.warnings.some((message) => message.includes("attempt 1 failed")))
})

test("bootstrapInitialApplicationsForShip degrades after exhausting adapter retries", async () => {
  const harness = makePrismaHarness({
    storedSecrets: n8nSecrets(),
  })

  let attempts = 0
  const result = await bootstrapInitialApplicationsForShip(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
    },
    {
      prismaClient: harness.prismaStub as any,
      runDeploymentAdapterFn: async () => {
        attempts += 1
        return adapterResult("failed", `failure-${attempts}`)
      },
      resolveShipyardSecretTemplateValuesFn: async () => n8nSecrets(),
      importCuratedToolForUserFn: async () =>
        ({
          run: {
            id: "run-1",
            ownerUserId: "user-1",
            catalogEntryId: "tool-n8n",
            mode: "curated",
            source: "curated",
            toolSlug: "n8n",
            repo: "example/n8n-tool",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: "https://github.com/example/n8n-tool",
            status: "succeeded",
            exitCode: 0,
            stdout: "",
            stderr: "",
            errorMessage: null,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          entry: {
            id: "tool-n8n",
          },
        } as any),
      ensureShipToolGrantForBootstrapFn: async () =>
        ({
          id: "grant-n8n",
        } as any),
      sleepFn: async () => {},
    },
  )

  assert.equal(result.n8n.status, "degraded")
  assert.equal(result.n8n.attempts, 2)
  assert.ok(result.n8n.errors.some((error) => error.code === "N8N_DEPLOYMENT_FAILED"))
  assert.ok(result.n8n.warnings.some((message) => message.includes("failed after retry budget")))
})

test("bootstrapInitialApplicationsForShip marks degraded when tool import fails", async () => {
  const harness = makePrismaHarness({
    storedSecrets: n8nSecrets(),
  })

  const result = await bootstrapInitialApplicationsForShip(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
    },
    {
      prismaClient: harness.prismaStub as any,
      runDeploymentAdapterFn: async () => adapterResult("active"),
      resolveShipyardSecretTemplateValuesFn: async () => n8nSecrets(),
      importCuratedToolForUserFn: async () => {
        throw new Error("import failed")
      },
      ensureShipToolGrantForBootstrapFn: async () =>
        ({
          id: "grant-n8n",
        } as any),
    },
  )

  assert.equal(result.n8n.status, "degraded")
  assert.equal(result.n8n.applicationStatus, "active")
  assert.equal(result.n8n.toolCatalogEntryId, null)
  assert.ok(result.n8n.errors.some((error) => error.code === "N8N_TOOL_IMPORT_FAILED"))
})

test("bootstrapInitialApplicationsForShip reuses existing n8n application record idempotently", async () => {
  const harness = makePrismaHarness({
    existingApplicationId: "existing-n8n",
    storedSecrets: n8nSecrets(),
  })

  const result = await bootstrapInitialApplicationsForShip(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
    },
    {
      prismaClient: harness.prismaStub as any,
      runDeploymentAdapterFn: async () => adapterResult("active"),
      resolveShipyardSecretTemplateValuesFn: async () => n8nSecrets(),
      importCuratedToolForUserFn: async () =>
        ({
          run: {
            id: "run-1",
            ownerUserId: "user-1",
            catalogEntryId: "tool-n8n",
            mode: "curated",
            source: "curated",
            toolSlug: "n8n",
            repo: "example/n8n-tool",
            sourcePath: ".",
            sourceRef: "main",
            sourceUrl: "https://github.com/example/n8n-tool",
            status: "succeeded",
            exitCode: 0,
            stdout: "",
            stderr: "",
            errorMessage: null,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          entry: {
            id: "tool-n8n",
          },
        } as any),
      ensureShipToolGrantForBootstrapFn: async () =>
        ({
          id: "grant-n8n",
        } as any),
    },
  )

  assert.equal(result.n8n.status, "ready")
  assert.equal(result.n8n.applicationId, "existing-n8n")
  assert.equal(harness.getCreateCount(), 0)
  assert.ok(harness.getUpdateCount() > 0)
})

test("bootstrapInitialApplicationsForShipFailOpen skips bootstrap when ship status is failed", async () => {
  const result = await bootstrapInitialApplicationsForShipFailOpen({
    ownerUserId: "user-1",
    ship: shipTarget(),
    shipStatus: "failed",
  })

  assert.equal(result.n8n.status, "skipped")
  assert.equal(result.n8n.attempted, false)
  assert.ok(result.n8n.warnings.some((warning) => warning.includes("deployment status is failed")))
})

test("bootstrapInitialApplicationsForShipFailOpen returns degraded result when bootstrap throws", async () => {
  const result = await bootstrapInitialApplicationsForShipFailOpen(
    {
      ownerUserId: "user-1",
      ship: shipTarget(),
      shipStatus: "active",
    },
    {
      prismaClient: {
        shipyardSecretTemplate: {
          findUnique: async () => {
            throw new Error("boom")
          },
        },
      } as any,
    },
  )

  assert.equal(result.n8n.status, "degraded")
  assert.equal(result.n8n.attempted, true)
  assert.ok(result.n8n.errors.some((error) => error.code === "N8N_BOOTSTRAP_UNEXPECTED_ERROR"))
})
