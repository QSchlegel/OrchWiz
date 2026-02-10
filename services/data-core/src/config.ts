import { asBoolean, asPositiveInt } from "./util.js"

export type DataCoreRole = "ship" | "fleet"

export interface DataCoreConfig {
  host: string
  port: number
  databaseUrl: string
  apiKey: string | null
  syncSharedSecret: string | null
  coreId: string
  role: DataCoreRole
  clusterId: string
  shipDeploymentId: string | null
  fleetHubUrl: string | null
  autoMigrate: boolean
  maxSyncBatch: number
  queryCandidateLimit: number
  queryTopKDefault: number
  enableMergeWorker: boolean
}

function required(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function optional(name: string): string | null {
  const value = process.env[name]
  if (!value || !value.trim()) return null
  return value.trim()
}

export function loadConfig(): DataCoreConfig {
  const roleRaw = (process.env.DATA_CORE_ROLE || "ship").trim().toLowerCase()
  const role: DataCoreRole = roleRaw === "fleet" ? "fleet" : "ship"

  return {
    host: process.env.DATA_CORE_HOST?.trim() || "127.0.0.1",
    port: asPositiveInt(process.env.DATA_CORE_PORT, 3390),
    databaseUrl: required("DATA_CORE_DATABASE_URL"),
    apiKey: optional("DATA_CORE_API_KEY"),
    syncSharedSecret: optional("DATA_CORE_SYNC_SHARED_SECRET"),
    coreId: process.env.DATA_CORE_CORE_ID?.trim() || `core-${Math.random().toString(36).slice(2, 10)}`,
    role,
    clusterId: process.env.DATA_CORE_CLUSTER_ID?.trim() || "local",
    shipDeploymentId: optional("DATA_CORE_SHIP_DEPLOYMENT_ID"),
    fleetHubUrl: optional("DATA_CORE_FLEET_HUB_URL"),
    autoMigrate: asBoolean(process.env.DATA_CORE_AUTO_MIGRATE, true),
    maxSyncBatch: asPositiveInt(process.env.DATA_CORE_MAX_SYNC_BATCH, 200),
    queryCandidateLimit: asPositiveInt(process.env.DATA_CORE_QUERY_CANDIDATE_LIMIT, 2500),
    queryTopKDefault: asPositiveInt(process.env.DATA_CORE_QUERY_TOP_K, 12),
    enableMergeWorker: asBoolean(process.env.DATA_CORE_ENABLE_MERGE_WORKER, true),
  }
}
