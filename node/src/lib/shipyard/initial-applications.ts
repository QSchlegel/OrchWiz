import type {
  ApplicationDeployment,
  DeploymentProfile,
  DeploymentStatus,
  NodeType,
  Prisma,
  ProvisioningMode,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { runDeploymentAdapter, type DeploymentAdapterResult } from "@/lib/deployment/adapter"
import { publishShipApplicationUpdated } from "@/lib/shipyard/events"
import { resolveShipyardSecretTemplateValues } from "@/lib/shipyard/secret-vault"
import { importCuratedToolForUser } from "@/lib/tools/catalog"
import { ensureShipToolGrantForBootstrap } from "@/lib/tools/requests"

const N8N_REQUIRED_SECRET_FIELDS = [
  "n8n_database_url",
  "n8n_basic_auth_user",
  "n8n_basic_auth_password",
  "n8n_encryption_key",
  "n8n_public_base_url",
] as const

export type N8NRequiredSecretField = (typeof N8N_REQUIRED_SECRET_FIELDS)[number]

export type InitialApplicationBootstrapStatus = "ready" | "degraded" | "disabled" | "skipped"
export type InitialApplicationBootstrapStage =
  | "preflight"
  | "application"
  | "tool_import"
  | "tool_grant"

export interface InitialApplicationBootstrapIssue {
  stage: InitialApplicationBootstrapStage
  message: string
  code?: string
  attempt?: number
}

export interface N8NInitialApplicationBootstrap {
  status: InitialApplicationBootstrapStatus
  enabled: boolean
  attempted: boolean
  attempts: number
  maxAttempts: number
  applicationId: string | null
  applicationStatus: DeploymentStatus | null
  toolCatalogEntryId: string | null
  toolGrantId: string | null
  missingSecrets: N8NRequiredSecretField[]
  warnings: string[]
  errors: InitialApplicationBootstrapIssue[]
}

export interface InitialApplicationsBootstrapResult {
  n8n: N8NInitialApplicationBootstrap
}

export interface ShipBootstrapTarget {
  id: string
  name: string
  userId: string
  nodeId: string
  nodeType: NodeType
  nodeUrl: string | null
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  config: Prisma.JsonValue | null
}

interface InitialApplicationsSelection {
  n8n: boolean
  dokploy: boolean
}

interface N8NDbConfig {
  host: string
  port: string
  database: string
  user: string
  password: string
  schema: string
}

interface InitialApplicationDependencies {
  prismaClient?: typeof prisma
  runDeploymentAdapterFn?: typeof runDeploymentAdapter
  publishShipApplicationUpdatedFn?: typeof publishShipApplicationUpdated
  resolveShipyardSecretTemplateValuesFn?: typeof resolveShipyardSecretTemplateValues
  importCuratedToolForUserFn?: typeof importCuratedToolForUser
  ensureShipToolGrantForBootstrapFn?: typeof ensureShipToolGrantForBootstrap
  sleepFn?: (ms: number) => Promise<void>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = asString(process.env[name])
  if (!value) {
    return fallback
  }
  const normalized = value.toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false
  }
  return fallback
}

function envString(name: string, fallback: string): string {
  return asString(process.env[name]) || fallback
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const value = asString(process.env[name])
  if (!value) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, parsed))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readInitialApplicationsSelection(rawConfig: unknown): InitialApplicationsSelection {
  const config = asRecord(rawConfig)
  const initial = asRecord(config.initialApplications)

  const n8nValue = initial.n8n
  const dokployValue = initial.dokploy

  return {
    n8n: typeof n8nValue === "boolean" ? n8nValue : true,
    dokploy: typeof dokployValue === "boolean" ? dokployValue : false,
  }
}

function createN8NBootstrapResult(
  overrides: Partial<N8NInitialApplicationBootstrap> = {},
): N8NInitialApplicationBootstrap {
  return {
    status: "degraded",
    enabled: true,
    attempted: false,
    attempts: 0,
    maxAttempts: 0,
    applicationId: null,
    applicationStatus: null,
    toolCatalogEntryId: null,
    toolGrantId: null,
    missingSecrets: [],
    warnings: [],
    errors: [],
    ...overrides,
  }
}

export function createSkippedInitialApplicationsBootstrap(reason: string): InitialApplicationsBootstrapResult {
  return {
    n8n: createN8NBootstrapResult({
      status: "skipped",
      enabled: envBoolean("SHIPYARD_N8N_INITIAL_APP_ENABLED", true),
      warnings: [reason],
      maxAttempts: envInt("SHIPYARD_N8N_BOOTSTRAP_MAX_ATTEMPTS", 2, 1, 5),
    }),
  }
}

export async function bootstrapInitialApplicationsForShipFailOpen(
  args: {
    ownerUserId: string
    ship: ShipBootstrapTarget
    shipStatus: DeploymentStatus
  },
  dependencies: InitialApplicationDependencies = {},
): Promise<InitialApplicationsBootstrapResult> {
  if (args.shipStatus === "failed") {
    return createSkippedInitialApplicationsBootstrap(
      "Ship launch bootstrap skipped because deployment status is failed.",
    )
  }

  try {
    return await bootstrapInitialApplicationsForShip(
      {
        ownerUserId: args.ownerUserId,
        ship: args.ship,
      },
      dependencies,
    )
  } catch (error) {
    const bootstrap = createSkippedInitialApplicationsBootstrap(
      "n8n bootstrap encountered an unexpected error.",
    )
    bootstrap.n8n.status = "degraded"
    bootstrap.n8n.attempted = true
    bootstrap.n8n.errors.push({
      stage: "application",
      code: "N8N_BOOTSTRAP_UNEXPECTED_ERROR",
      message: (error as Error).message,
    })
    return bootstrap
  }
}

function missingRequiredN8NSecrets(values: Record<string, unknown>): N8NRequiredSecretField[] {
  const missing: N8NRequiredSecretField[] = []
  for (const field of N8N_REQUIRED_SECRET_FIELDS) {
    if (!asString(values[field])) {
      missing.push(field)
    }
  }
  return missing
}

function parseN8NDatabaseUrl(rawValue: string): N8NDbConfig {
  let parsed: URL
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error("n8n_database_url must be a valid PostgreSQL URL.")
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("n8n_database_url must use postgres:// or postgresql://.")
  }

  const host = parsed.hostname.trim()
  const port = parsed.port.trim() || "5432"
  const database = parsed.pathname.replace(/^\/+/u, "").trim()
  const user = decodeURIComponent(parsed.username || "").trim()
  const password = decodeURIComponent(parsed.password || "").trim()
  const schema = parsed.searchParams.get("schema")?.trim() || "public"

  if (!host || !database || !user || !password) {
    throw new Error(
      "n8n_database_url must include host, database, username, and password.",
    )
  }

  return {
    host,
    port,
    database,
    user,
    password,
    schema,
  }
}

function buildN8NEnvironment(values: Record<string, unknown>): Record<string, string> {
  const databaseUrl = asString(values.n8n_database_url)
  const basicAuthUser = asString(values.n8n_basic_auth_user)
  const basicAuthPassword = asString(values.n8n_basic_auth_password)
  const encryptionKey = asString(values.n8n_encryption_key)
  const publicBaseUrl = asString(values.n8n_public_base_url)

  if (!databaseUrl || !basicAuthUser || !basicAuthPassword || !encryptionKey || !publicBaseUrl) {
    throw new Error("Missing required n8n bootstrap secrets.")
  }

  const db = parseN8NDatabaseUrl(databaseUrl)
  let parsedBaseUrl: URL
  try {
    parsedBaseUrl = new URL(publicBaseUrl)
  } catch {
    throw new Error("n8n_public_base_url must be a valid URL.")
  }

  const env: Record<string, string> = {
    DB_TYPE: "postgresdb",
    DB_POSTGRESDB_HOST: db.host,
    DB_POSTGRESDB_PORT: db.port,
    DB_POSTGRESDB_DATABASE: db.database,
    DB_POSTGRESDB_USER: db.user,
    DB_POSTGRESDB_PASSWORD: db.password,
    DB_POSTGRESDB_SCHEMA: db.schema,
    N8N_BASIC_AUTH_ACTIVE: "true",
    N8N_BASIC_AUTH_USER: basicAuthUser,
    N8N_BASIC_AUTH_PASSWORD: basicAuthPassword,
    N8N_ENCRYPTION_KEY: encryptionKey,
    N8N_EDITOR_BASE_URL: publicBaseUrl,
    WEBHOOK_URL: publicBaseUrl,
    N8N_PUBLIC_API_DISABLED: "false",
    N8N_PROTOCOL: parsedBaseUrl.protocol.replace(":", ""),
    N8N_HOST: parsedBaseUrl.host,
  }

  const normalizedPath = parsedBaseUrl.pathname.replace(/\/+$/u, "")
  if (normalizedPath.length > 0 && normalizedPath !== "/") {
    env.N8N_PATH = normalizedPath
  }

  return env
}

async function ensureN8NApplication(
  args: {
    prismaClient: typeof prisma
    ship: ShipBootstrapTarget
    image: string
    port: number
    environment: Record<string, string>
  },
): Promise<ApplicationDeployment> {
  const existing = await args.prismaClient.applicationDeployment.findFirst({
    where: {
      userId: args.ship.userId,
      shipDeploymentId: args.ship.id,
      applicationType: "n8n",
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const baseMetadata = {
    ...(asRecord(existing?.metadata || {})),
    managedBy: "shipyard_initial_applications",
    initialApplication: "n8n",
    bootstrapManaged: true,
  }

  if (existing) {
    return args.prismaClient.applicationDeployment.update({
      where: { id: existing.id },
      data: {
        name: "n8n",
        description: "Initial n8n workflow orchestration application for this ship.",
        applicationType: "n8n",
        image: args.image,
        startCommand: null,
        buildCommand: null,
        repository: null,
        branch: null,
        port: args.port,
        environment: args.environment as Prisma.InputJsonValue,
        nodeId: args.ship.nodeId,
        nodeType: args.ship.nodeType,
        nodeUrl: args.ship.nodeUrl,
        deploymentProfile: args.ship.deploymentProfile,
        provisioningMode: args.ship.provisioningMode,
        config: asRecord(args.ship.config || {}) as Prisma.InputJsonValue,
        metadata: baseMetadata as Prisma.InputJsonValue,
      },
    })
  }

  return args.prismaClient.applicationDeployment.create({
    data: {
      name: "n8n",
      description: "Initial n8n workflow orchestration application for this ship.",
      applicationType: "n8n",
      image: args.image,
      repository: null,
      branch: null,
      buildCommand: null,
      startCommand: null,
      port: args.port,
      environment: args.environment as Prisma.InputJsonValue,
      shipDeploymentId: args.ship.id,
      nodeId: args.ship.nodeId,
      nodeType: args.ship.nodeType,
      deploymentProfile: args.ship.deploymentProfile,
      provisioningMode: args.ship.provisioningMode,
      nodeUrl: args.ship.nodeUrl,
      config: asRecord(args.ship.config || {}) as Prisma.InputJsonValue,
      metadata: baseMetadata as Prisma.InputJsonValue,
      userId: args.ship.userId,
      status: "pending",
    },
  })
}

async function deployN8NApplication(args: {
  prismaClient: typeof prisma
  runDeploymentAdapterFn: typeof runDeploymentAdapter
  publishShipApplicationUpdatedFn: typeof publishShipApplicationUpdated
  application: ApplicationDeployment
}): Promise<{
  application: ApplicationDeployment
  adapterResult: DeploymentAdapterResult
}> {
  await args.prismaClient.applicationDeployment.update({
    where: { id: args.application.id },
    data: { status: "deploying" },
  })

  const adapterResult = await args.runDeploymentAdapterFn({
    kind: "application",
    recordId: args.application.id,
    name: args.application.name,
    nodeId: args.application.nodeId,
    nodeType: args.application.nodeType,
    nodeUrl: args.application.nodeUrl,
    deploymentProfile: args.application.deploymentProfile,
    provisioningMode: args.application.provisioningMode,
    config: asRecord(args.application.config || {}),
    infrastructure:
      asRecord(args.application.config || {}).infrastructure as Record<string, unknown> | undefined,
    metadata: asRecord(args.application.metadata || {}),
  })

  const updated = await args.prismaClient.applicationDeployment.update({
    where: { id: args.application.id },
    data: {
      status: adapterResult.status,
      deployedAt: adapterResult.deployedAt || null,
      lastHealthCheck: adapterResult.lastHealthCheck || null,
      healthStatus: adapterResult.healthStatus || null,
      metadata: {
        ...(asRecord(args.application.metadata || {})),
        ...(adapterResult.metadata || {}),
        ...(adapterResult.error ? { deploymentError: adapterResult.error } : {}),
      } as Prisma.InputJsonValue,
    },
  })

  args.publishShipApplicationUpdatedFn({
    applicationId: updated.id,
    status: updated.status,
    nodeId: updated.nodeId,
    shipDeploymentId: updated.shipDeploymentId,
    userId: updated.userId,
  })

  return {
    application: updated,
    adapterResult,
  }
}

export async function bootstrapInitialApplicationsForShip(
  args: {
    ownerUserId: string
    ship: ShipBootstrapTarget
  },
  dependencies: InitialApplicationDependencies = {},
): Promise<InitialApplicationsBootstrapResult> {
  const selection = readInitialApplicationsSelection(args.ship.config)
  if (!selection.n8n) {
    return createSkippedInitialApplicationsBootstrap("n8n bootstrap skipped by app selection.")
  }

  const prismaClient = dependencies.prismaClient || prisma
  const runDeploymentAdapterFn = dependencies.runDeploymentAdapterFn || runDeploymentAdapter
  const publishShipApplicationUpdatedFn =
    dependencies.publishShipApplicationUpdatedFn || publishShipApplicationUpdated
  const resolveShipyardSecretTemplateValuesFn =
    dependencies.resolveShipyardSecretTemplateValuesFn || resolveShipyardSecretTemplateValues
  const importCuratedToolForUserFn = dependencies.importCuratedToolForUserFn || importCuratedToolForUser
  const ensureShipToolGrantForBootstrapFn =
    dependencies.ensureShipToolGrantForBootstrapFn || ensureShipToolGrantForBootstrap
  const sleepFn = dependencies.sleepFn || sleep

  const enabled = envBoolean("SHIPYARD_N8N_INITIAL_APP_ENABLED", true)
  const maxAttempts = envInt("SHIPYARD_N8N_BOOTSTRAP_MAX_ATTEMPTS", 2, 1, 5)
  const image = envString("SHIPYARD_N8N_INITIAL_APP_IMAGE", "docker.n8n.io/n8nio/n8n:latest")
  const port = envInt("SHIPYARD_N8N_INITIAL_APP_PORT", 5678, 1, 65535)

  if (!enabled) {
    return {
      n8n: createN8NBootstrapResult({
        status: "disabled",
        enabled: false,
        attempted: false,
        maxAttempts,
        warnings: ["n8n initial application bootstrap is disabled via SHIPYARD_N8N_INITIAL_APP_ENABLED."],
      }),
    }
  }

  const result = createN8NBootstrapResult({
    status: "degraded",
    enabled: true,
    attempted: true,
    maxAttempts,
  })

  const template = await prismaClient.shipyardSecretTemplate.findUnique({
    where: {
      userId_deploymentProfile: {
        userId: args.ownerUserId,
        deploymentProfile: args.ship.deploymentProfile,
      },
    },
    select: {
      secrets: true,
    },
  })

  const resolvedSecrets = await resolveShipyardSecretTemplateValuesFn({
    userId: args.ownerUserId,
    deploymentProfile: args.ship.deploymentProfile,
    stored: template?.secrets || {},
  })

  const missingSecrets = missingRequiredN8NSecrets(asRecord(resolvedSecrets))
  if (missingSecrets.length > 0) {
    result.missingSecrets = missingSecrets
    result.errors.push({
      stage: "preflight",
      code: "N8N_SECRETS_MISSING",
      message: `Missing required n8n secrets: ${missingSecrets.join(", ")}`,
    })
    result.warnings.push("n8n bootstrap skipped because required secrets are missing.")
    return { n8n: result }
  }

  let n8nEnvironment: Record<string, string>
  try {
    n8nEnvironment = buildN8NEnvironment(asRecord(resolvedSecrets))
  } catch (error) {
    result.errors.push({
      stage: "preflight",
      code: "N8N_ENV_BUILD_FAILED",
      message: (error as Error).message,
    })
    result.warnings.push("n8n bootstrap skipped because secret values are invalid.")
    return { n8n: result }
  }

  let application: ApplicationDeployment
  try {
    application = await ensureN8NApplication({
      prismaClient,
      ship: args.ship,
      image,
      port,
      environment: n8nEnvironment,
    })
    result.applicationId = application.id
  } catch (error) {
    result.errors.push({
      stage: "application",
      code: "N8N_APPLICATION_UPSERT_FAILED",
      message: (error as Error).message,
    })
    result.warnings.push("n8n application record could not be created or updated.")
    return { n8n: result }
  }

  let deploymentSucceeded = false
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result.attempts = attempt
    const deployed = await deployN8NApplication({
      prismaClient,
      runDeploymentAdapterFn,
      publishShipApplicationUpdatedFn,
      application,
    })
    application = deployed.application
    result.applicationStatus = application.status
    result.applicationId = application.id

    if (deployed.adapterResult.status !== "failed") {
      deploymentSucceeded = true
      break
    }

    if (attempt < maxAttempts) {
      result.warnings.push(
        deployed.adapterResult.error
          ? `n8n deployment attempt ${attempt} failed: ${deployed.adapterResult.error}`
          : `n8n deployment attempt ${attempt} failed; retrying.`,
      )
      await sleepFn(500 * attempt)
      continue
    }

    result.errors.push({
      stage: "application",
      code: "N8N_DEPLOYMENT_FAILED",
      attempt,
      message:
        deployed.adapterResult.error || `n8n deployment adapter attempt ${attempt} returned failed status.`,
    })
  }

  if (!deploymentSucceeded) {
    result.warnings.push("n8n deployment failed after retry budget; continuing ship launch.")
  }

  try {
    const importOutcome = await importCuratedToolForUserFn({
      ownerUserId: args.ownerUserId,
      toolSlug: "n8n",
    })

    if (!importOutcome.entry) {
      result.errors.push({
        stage: "tool_import",
        code: "N8N_TOOL_IMPORT_FAILED",
        message: importOutcome.run.errorMessage || "n8n tool import did not produce a catalog entry.",
      })
      result.warnings.push("n8n tool bridge import failed.")
      return { n8n: result }
    }

    result.toolCatalogEntryId = importOutcome.entry.id

    try {
      const grant = await ensureShipToolGrantForBootstrapFn({
        ownerUserId: args.ownerUserId,
        shipDeploymentId: args.ship.id,
        catalogEntryId: importOutcome.entry.id,
        grantedByUserId: args.ownerUserId,
        rationale: "Auto-granted by Ship Yard initial n8n bootstrap.",
        metadata: {
          shipBootstrap: true,
          initialApplication: "n8n",
        },
      })
      result.toolGrantId = grant.id
    } catch (error) {
      result.errors.push({
        stage: "tool_grant",
        code: "N8N_TOOL_GRANT_FAILED",
        message: (error as Error).message,
      })
      result.warnings.push("n8n tool imported, but ship grant failed.")
      return { n8n: result }
    }
  } catch (error) {
    result.errors.push({
      stage: "tool_import",
      code: "N8N_TOOL_IMPORT_FAILED",
      message: (error as Error).message,
    })
    result.warnings.push("n8n tool bridge import failed.")
    return { n8n: result }
  }

  if (deploymentSucceeded) {
    if (result.errors.length === 0) {
      result.status = "ready"
    } else {
      result.status = "degraded"
    }
  } else {
    result.status = "degraded"
  }

  if (deploymentSucceeded && result.errors.length > 0) {
    result.warnings.push("n8n bootstrap completed with degraded components.")
  }

  return { n8n: result }
}
