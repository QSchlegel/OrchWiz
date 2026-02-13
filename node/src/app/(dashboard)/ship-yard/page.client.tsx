"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react"
import {
  AppWindow,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Cloud,
  Compass,
  Copy,
  Filter,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  Server,
  Settings2,
  Ship,
  Shield,
  Trash2,
  Users,
} from "lucide-react"
import {
  defaultInfrastructureConfig,
  deriveNodeTypeFromProfile,
  type DeploymentProfile,
  type InfrastructureConfig,
  type NodeType,
  type ProvisioningMode,
} from "@/lib/deployment/profile"
import {
  defaultCloudProviderConfig,
  type CloudProviderConfig,
} from "@/lib/shipyard/cloud/types"
import {
  readShipMonitoringConfig,
  SHIP_MONITORING_DEFAULTS,
} from "@/lib/shipyard/monitoring"
import {
  BRIDGE_CREW_ROLE_ORDER,
  listBridgeCrewTemplates,
  type BridgeCrewRole,
} from "@/lib/shipyard/bridge-crew"
import {
  estimateShipBaseRequirements,
  formatCpuMillicores,
  formatMemoryMiB,
  readBaseRequirementsEstimate,
  type ShipBaseRequirementsEstimate,
} from "@/lib/shipyard/resource-estimation"
import {
  buildShipDeploymentOverview,
  readShipDeploymentOverview,
  type DeploymentOverviewComponent,
  type DeploymentOverviewRequirement,
  type ShipDeploymentOverview,
} from "@/lib/shipyard/deployment-overview"
import { buildReviewLaunchSummary } from "@/lib/shipyard/review-launch-summary"
import type {
  ShipyardSecretFieldKey,
  ShipyardSecretTemplateSummary,
  ShipyardSecretTemplateValues,
  ShipyardSetupSnippets,
} from "@/lib/shipyard/secret-vault"
import {
  buildDefaultN8NDatabaseUrl,
  buildDefaultN8NPublicBaseUrl,
  listMissingRequiredN8NSecrets,
  N8N_REQUIRED_SECRET_FIELDS,
} from "@/lib/shipyard/n8n-bootstrap-defaults"
import {
  summarizeShipDeployments,
  type ShipHealthState,
  type ShipyardClusterSummary,
} from "@/lib/shipyard/cluster-summary"
import {
  SHIP_LATEST_VERSION,
  resolveShipVersion,
  shipVersionNeedsUpgrade,
} from "@/lib/shipyard/versions"
import { useEventStream } from "@/lib/realtime/useEventStream"
import { useShipSelection } from "@/lib/shipyard/useShipSelection"
import { buildUiError, isWalletEnclaveCode, walletEnclaveGuidance } from "@/lib/api-errors"
import { EmptyState, InlineNotice, SurfaceCard } from "@/components/dashboard/PageLayout"
import { CloudUtilityPanel } from "@/components/shipyard/CloudUtilityPanel"
import { ShipToolsPanel } from "@/components/shipyard/ShipToolsPanel"
import { ShipyardApiKeysPanel } from "@/components/shipyard/ShipyardApiKeysPanel"

type InfrastructureKind = InfrastructureConfig["kind"]

type WizardStepId = "mission" | "environment" | "secrets" | "apps" | "crew" | "review"

type MainTab = "build" | "fleet" | "apiKeys" | "ops"

type BootstrapAppId = "n8n" | "dokploy"

type InitialApplicationsSelection = Record<BootstrapAppId, boolean>

interface CrewOverrideInput {
  name: string
  description: string
  content: string
}

interface MonitoringUrlFormInput {
  grafanaUrl: string
  prometheusUrl: string
  kubeviewUrl: string
  langfuseUrl: string
}

interface LaunchFormState {
  name: string
  description: string
  nodeId: string
  nodeUrl: string
  initialApplications: InitialApplicationsSelection
  saneBootstrap: boolean
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  advancedNodeTypeOverride: boolean
  nodeType: NodeType
  infrastructure: InfrastructureConfig
  monitoring: MonitoringUrlFormInput
  cloudProvider: CloudProviderConfig
  crewOverrides: Record<BridgeCrewRole, CrewOverrideInput>
}

interface ShipDeploymentMetadata {
  baseRequirementsEstimate?: ShipBaseRequirementsEstimate
  bridgeCrewRoles?: BridgeCrewRole[]
  deploymentOverview?: ShipDeploymentOverview
  [key: string]: unknown
}

interface ShipDeployment {
  id: string
  name: string
  status: "pending" | "deploying" | "active" | "inactive" | "failed" | "updating"
  nodeId: string
  nodeType: NodeType
  deploymentProfile: DeploymentProfile
  provisioningMode: ProvisioningMode
  config?: Record<string, unknown> | null
  metadata?: ShipDeploymentMetadata | null
  shipVersion: string | null
  shipVersionUpdatedAt: string | null
  deployedAt: string | null
  lastHealthCheck: string | null
  healthStatus: string | null
  updatedAt: string
}

interface ShipDeploymentWithInfrastructure extends ShipDeployment {
  infrastructure: InfrastructureConfig
}

interface BridgeCrewRecord {
  id: string
  deploymentId: string
  role: BridgeCrewRole
  callsign: string
  name: string
  description: string | null
  content: string
  status: "active" | "inactive"
}

interface LaunchMessage {
  type: "success" | "error" | "info"
  text: string
  code?: string | null
  suggestedCommands?: string[]
}

interface RefuelingErrorState {
  text: string
  code: string | null
  suggestedCommands?: string[]
}

interface ShipyardBillingWalletState {
  id: string
  userId: string
  balanceCents: number
  currency: "eur"
}

interface ShipyardBillingQuoteState {
  provider: "hetzner"
  location: string
  currency: "eur"
  hours: number
  convenienceFeePercent: number
  baseCostCents: number
  convenienceFeeCents: number
  totalCents: number
  walletBalanceCents: number
  shortfallCents: number
  canLaunch: boolean
}

interface BridgeConnectionSummary {
  total: number
  enabled: number
  autoRelay: number
  providers: {
    telegram: { total: number; enabled: number }
    discord: { total: number; enabled: number }
    whatsapp: { total: number; enabled: number }
  }
  lastDeliveryAt: string | null
  lastDeliveryStatus: "pending" | "processing" | "completed" | "failed" | null
}

interface RuntimeSnapshotKindCluster {
  name: string
  kubeContext: string
  kubeContextPresent: boolean
  runningNodeCount: number
  totalNodeCount: number
}

interface RuntimeSnapshot {
  checkedAt: string
  kubernetes: {
    available: boolean
    currentContext: string | null
    contexts: string[]
    error?: string
  }
  kind: {
    available: boolean
    clusters: RuntimeSnapshotKindCluster[]
    error?: string
  }
}

interface ShipyardSecretTemplateApiPayload {
  deploymentProfile: DeploymentProfile
  exists: boolean
  template: {
    id: string | null
    updatedAt: string | null
    summary: ShipyardSecretTemplateSummary
    values?: ShipyardSecretTemplateValues
  }
  snippets: ShipyardSetupSnippets
}

interface OwnershipTransferApiResponse {
  success?: boolean
  transferred?: boolean
  ship?: {
    id?: string
    name?: string
    previousOwnerUserId?: string
    newOwnerUserId?: string
  }
  applications?: {
    reassignedCount?: number
  }
  quartermaster?: {
    provisioned?: boolean
  }
  warnings?: unknown
  error?: string
}

const steps: { id: WizardStepId; title: string; subtitle: string; icon: ElementType }[] = [
  { id: "mission", title: "Mission", subtitle: "Ship identity and target", icon: Ship },
  { id: "environment", title: "Environment", subtitle: "Deployment profile setup", icon: Settings2 },
  { id: "secrets", title: "Secrets", subtitle: "Setup templates and snippets", icon: KeyRound },
  { id: "apps", title: "Apps", subtitle: "Bootstrap app selection", icon: AppWindow },
  { id: "crew", title: "Bridge Crew", subtitle: "Bootstrap OpenClaw command", icon: Users },
  { id: "review", title: "Launch", subtitle: "Review and deploy", icon: Rocket },
]

const DEFAULT_INITIAL_APPLICATIONS: InitialApplicationsSelection = {
  n8n: true,
  dokploy: false,
}

const BOOTSTRAP_APPS: Array<{
  id: BootstrapAppId
  label: string
  description: string
  icon: ElementType
}> = [
  {
    id: "n8n",
    label: "n8n",
    description: "Workflow automation + curated tool bridge bootstrap.",
    icon: AppWindow,
  },
  {
    id: "dokploy",
    label: "Dokploy",
    description: "Staging deploy control plane (connect-only for local profile, provisioning later).",
    icon: Server,
  },
]

const deploymentProfileLabels: Record<DeploymentProfile, string> = {
  local_starship_build: "Local Starship Build",
  cloud_shipyard: "Cloud Shipyard",
}

const CLOUD_DEPLOY_ONLY = (process.env.NEXT_PUBLIC_CLOUD_DEPLOY_ONLY || "").trim().toLowerCase() === "true"

const provisioningModeLabels: Record<ProvisioningMode, string> = {
  terraform_ansible: "Terraform + Ansible",
  terraform_only: "Terraform only",
  ansible_only: "Ansible only",
}

const crewRoleLabels: Record<BridgeCrewRole, string> = {
  xo: "Executive Officer",
  ops: "Operations",
  eng: "Engineering",
  sec: "Security",
  med: "Medical",
  cou: "Communications",
}

const REQUIRED_BRIDGE_CREW_ROLES = [...BRIDGE_CREW_ROLE_ORDER] as BridgeCrewRole[]

const requirementStatusClasses: Record<DeploymentOverviewRequirement["status"], string> = {
  ready: "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  warning: "border-amber-400/35 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  auto_generated: "border-cyan-400/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
}

const requirementCategoryLabels: Record<DeploymentOverviewRequirement["category"], string> = {
  infrastructure: "Infrastructure",
  storage: "Storage",
  network: "Network",
  integrations: "Integrations",
  credential: "Credential",
}

const provisioningRealityClasses: Record<DeploymentOverviewComponent["provisioningReality"], string> = {
  currently_provisioned:
    "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  planned_only: "border-cyan-400/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
}

const workloadKindLabels: Record<DeploymentOverviewComponent["workloadKind"], string> = {
  logical: "Logical",
  deployment: "Deployment",
  statefulset: "StatefulSet",
  daemonset: "DaemonSet",
  cron: "Cron",
}

const statusClasses: Record<ShipDeployment["status"], string> = {
  pending: "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  deploying: "border-cyan-400/45 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200",
  active: "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  inactive: "border-slate-400/45 bg-slate-500/10 text-slate-700 dark:text-slate-200",
  failed: "border-rose-400/45 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  updating: "border-orange-400/45 bg-orange-500/10 text-orange-700 dark:text-orange-200",
}

const healthClasses: Record<ShipHealthState, string> = {
  healthy: "border-emerald-400/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  unhealthy: "border-rose-400/45 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  unknown: "border-slate-400/45 bg-slate-500/10 text-slate-700 dark:text-slate-200",
}

type ShipStatusFilter = ShipDeployment["status"] | "all"

const fleetStatusFilterOptions: ShipStatusFilter[] = [
  "all",
  "active",
  "deploying",
  "updating",
  "pending",
  "inactive",
  "failed",
]

const fleetStatusFilterLabels: Record<ShipStatusFilter, string> = {
  all: "All statuses",
  active: "Active",
  deploying: "Deploying",
  updating: "Updating",
  pending: "Pending",
  inactive: "Inactive",
  failed: "Failed",
}

const SHIP_UPGRADE_BLOCKED_STATUSES = new Set<ShipDeployment["status"]>([
  "pending",
  "deploying",
  "updating",
])

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const SHIPYARD_SECRET_FIELDS: ShipyardSecretFieldKey[] = [
  "better_auth_secret",
  "github_client_id",
  "github_client_secret",
  "openai_api_key",
  "openclaw_api_key",
  "n8n_database_url",
  "n8n_basic_auth_user",
  "n8n_basic_auth_password",
  "n8n_encryption_key",
  "n8n_public_base_url",
  "postgres_password",
  "database_url",
]

const PROFILE_SECRET_FIELDS_BY_PROFILE: Record<DeploymentProfile, ShipyardSecretFieldKey[]> = {
  local_starship_build: [
    "better_auth_secret",
    "openai_api_key",
    "openclaw_api_key",
    "github_client_id",
    "github_client_secret",
    "postgres_password",
  ],
  cloud_shipyard: [
    "better_auth_secret",
    "openai_api_key",
    "openclaw_api_key",
    "github_client_id",
    "github_client_secret",
    "database_url",
  ],
}

const LAUNCH_ESSENTIAL_SECRET_FIELDS_BY_PROFILE: Record<DeploymentProfile, ShipyardSecretFieldKey[]> = {
  local_starship_build: ["better_auth_secret", "postgres_password"],
  cloud_shipyard: ["better_auth_secret", "database_url"],
}

const OPTIONAL_INTEGRATION_SECRET_FIELDS_BY_PROFILE: Record<DeploymentProfile, ShipyardSecretFieldKey[]> = {
  local_starship_build: [
    "openai_api_key",
    "openclaw_api_key",
    "github_client_id",
    "github_client_secret",
  ],
  cloud_shipyard: [
    "openai_api_key",
    "openclaw_api_key",
    "github_client_id",
    "github_client_secret",
  ],
}

const EMPTY_SECRET_SNIPPETS: ShipyardSetupSnippets = {
  envSnippet: "# No populated environment values in this Ship Yard secret template yet.",
  terraformTfvarsSnippet: "# No populated terraform.tfvars values in this Ship Yard secret template yet.",
}

const SECRET_FIELD_DESCRIPTORS: Record<
  ShipyardSecretFieldKey,
  {
    label: string
    placeholder: string
    inputType: "text" | "password"
    helper: string
  }
> = {
  better_auth_secret: {
    label: "BETTER_AUTH_SECRET",
    placeholder: "Minimum 32+ chars recommended",
    inputType: "password",
    helper: "Core auth signing secret for app/session security.",
  },
  github_client_id: {
    label: "GITHUB_CLIENT_ID",
    placeholder: "GitHub OAuth client ID",
    inputType: "text",
    helper: "Optional OAuth app client ID for GitHub integrations.",
  },
  github_client_secret: {
    label: "GITHUB_CLIENT_SECRET",
    placeholder: "GitHub OAuth client secret",
    inputType: "password",
    helper: "Optional OAuth app client secret paired with client ID.",
  },
  openai_api_key: {
    label: "OPENAI_API_KEY",
    placeholder: "OpenAI provider key",
    inputType: "password",
    helper: "Optional runtime model fallback key.",
  },
  openclaw_api_key: {
    label: "OPENCLAW_API_KEY",
    placeholder: "OpenClaw gateway key",
    inputType: "password",
    helper: "Optional override; OpenClaw can generate runtime keys automatically.",
  },
  n8n_database_url: {
    label: "N8N_DATABASE_URL",
    placeholder: "postgresql://user:pass@host:5432/n8n?schema=public",
    inputType: "password",
    helper: "Required for initial n8n bootstrap; application-scoped runtime env.",
  },
  n8n_basic_auth_user: {
    label: "N8N_BASIC_AUTH_USER",
    placeholder: "captain",
    inputType: "text",
    helper: "Required n8n basic auth username used for editor access.",
  },
  n8n_basic_auth_password: {
    label: "N8N_BASIC_AUTH_PASSWORD",
    placeholder: "Strong password",
    inputType: "password",
    helper: "Required n8n basic auth password used for editor access.",
  },
  n8n_encryption_key: {
    label: "N8N_ENCRYPTION_KEY",
    placeholder: "32+ character encryption key",
    inputType: "password",
    helper: "Required key for n8n credentials/workflow encryption.",
  },
  n8n_public_base_url: {
    label: "N8N_PUBLIC_BASE_URL",
    placeholder: "https://n8n.example.com",
    inputType: "text",
    helper: "Required public URL used for n8n editor and webhook base.",
  },
  postgres_password: {
    label: "postgres_password",
    placeholder: "Local DB password for terraform.tfvars",
    inputType: "password",
    helper: "Local Starship Terraform variable.",
  },
  database_url: {
    label: "database_url",
    placeholder: "postgresql://user:pass@host:5432/db",
    inputType: "password",
    helper: "Cloud Shipyard Terraform variable.",
  },
}

function createEmptySecretSummary(): ShipyardSecretTemplateSummary {
  const fields = {} as Record<ShipyardSecretFieldKey, { hasValue: boolean; maskedValue: string | null }>
  for (const field of SHIPYARD_SECRET_FIELDS) {
    fields[field] = {
      hasValue: false,
      maskedValue: null,
    }
  }
  return {
    storageMode: "none",
    hasValue: false,
    populatedFieldCount: 0,
    fields,
  }
}

function createInitialSecretValuesByProfile(): Record<DeploymentProfile, ShipyardSecretTemplateValues> {
  return {
    local_starship_build: {},
    cloud_shipyard: {},
  }
}

function createInitialSecretSummaryByProfile(): Record<DeploymentProfile, ShipyardSecretTemplateSummary> {
  return {
    local_starship_build: createEmptySecretSummary(),
    cloud_shipyard: createEmptySecretSummary(),
  }
}

function createInitialSecretSnippetsByProfile(): Record<DeploymentProfile, ShipyardSetupSnippets> {
  return {
    local_starship_build: { ...EMPTY_SECRET_SNIPPETS },
    cloud_shipyard: { ...EMPTY_SECRET_SNIPPETS },
  }
}

function generateRandomSecret(length = 48): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
  const random = new Uint8Array(length)
  globalThis.crypto.getRandomValues(random)
  let result = ""
  for (let index = 0; index < random.length; index += 1) {
    result += alphabet[random[index] % alphabet.length]
  }
  return result
}

function generateBetterAuthSecret(length = 48): string {
  return generateRandomSecret(length)
}

function generatePostgresPassword(length = 32): string {
  return generateRandomSecret(length)
}

function extractApiErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "error")) {
    return null
  }
  const errorValue = (payload as { error?: unknown }).error
  return typeof errorValue === "string" && errorValue.trim().length > 0 ? errorValue : null
}

function hasNonEmptySecretValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function parseTrailingNumber(value: string): number | null {
  const match = value.match(/(\d+)(?!.*\d)/)
  if (!match) return null
  const parsed = Number.parseInt(match[1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toUnixMs(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatRelativeTimestamp(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return "unknown"
  }

  const diffMs = timestamp - Date.now()
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  const absMs = Math.abs(diffMs)

  if (absMs < minuteMs) {
    return "just now"
  }
  if (absMs < hourMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / minuteMs), "minute")
  }
  if (absMs < dayMs) {
    return relativeTimeFormatter.format(Math.round(diffMs / hourMs), "hour")
  }
  return relativeTimeFormatter.format(Math.round(diffMs / dayMs), "day")
}

function formatEuroCents(value: number): string {
  const normalized = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(normalized / 100)
}

function formatDefaultShipName(index: number): string {
  return `USS-OrchWiz-${String(index).padStart(2, "0")}`
}

function formatDefaultNodeId(index: number): string {
  return `ship-node-${String(index).padStart(3, "0")}`
}

function normalizeHealthStatus(value: string | null | undefined): ShipHealthState {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "unknown"
  }

  return value.trim().toLowerCase() === "healthy" ? "healthy" : "unhealthy"
}

function infrastructureKindLabel(kind: InfrastructureKind): string {
  if (kind === "kind") return "KIND"
  if (kind === "minikube") return "Minikube"
  return "Existing Kubernetes"
}

function kubeContextForKind(kind: InfrastructureKind): string {
  if (kind === "kind") return "kind-orchwiz"
  if (kind === "minikube") return "minikube"
  return "existing-cluster"
}

function createCrewOverrides(): Record<BridgeCrewRole, CrewOverrideInput> {
  const templates = listBridgeCrewTemplates()
  const result = {} as Record<BridgeCrewRole, CrewOverrideInput>
  for (const template of templates) {
    result[template.role] = {
      name: template.name,
      description: template.description,
      content: template.content,
    }
  }
  return result
}

function createInitialFormState(): LaunchFormState {
  const deploymentProfile: DeploymentProfile = CLOUD_DEPLOY_ONLY
    ? "cloud_shipyard"
    : "local_starship_build"
  return {
    name: "",
    description: "",
    nodeId: "",
    nodeUrl: "",
    initialApplications: { ...DEFAULT_INITIAL_APPLICATIONS },
    saneBootstrap: true,
    deploymentProfile,
    provisioningMode: "terraform_ansible",
    advancedNodeTypeOverride: false,
    nodeType: deploymentProfile === "cloud_shipyard" ? "cloud" : "local",
    infrastructure: defaultInfrastructureConfig(deploymentProfile),
    monitoring: {
      grafanaUrl: SHIP_MONITORING_DEFAULTS.grafanaUrl,
      prometheusUrl: SHIP_MONITORING_DEFAULTS.prometheusUrl,
      kubeviewUrl: SHIP_MONITORING_DEFAULTS.kubeviewUrl,
      langfuseUrl: SHIP_MONITORING_DEFAULTS.langfuseUrl,
    },
    cloudProvider: defaultCloudProviderConfig(),
    crewOverrides: createCrewOverrides(),
  }
}

function resolveInfrastructureConfig(
  deploymentProfile: DeploymentProfile,
  configValue: unknown,
): InfrastructureConfig {
  const defaults = defaultInfrastructureConfig(deploymentProfile)
  if (!configValue || typeof configValue !== "object" || Array.isArray(configValue)) {
    return defaults
  }

  const configRecord = configValue as Record<string, unknown>
  const rawInfrastructure = configRecord.infrastructure
  if (!rawInfrastructure || typeof rawInfrastructure !== "object" || Array.isArray(rawInfrastructure)) {
    return defaults
  }

  const infrastructure = rawInfrastructure as Record<string, unknown>
  const asString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null

  return {
    kind: infrastructure.kind === "kind" || infrastructure.kind === "minikube" || infrastructure.kind === "existing_k8s"
      ? infrastructure.kind
      : defaults.kind,
    kubeContext: asString(infrastructure.kubeContext) || defaults.kubeContext,
    namespace: asString(infrastructure.namespace) || defaults.namespace,
    terraformWorkspace: asString(infrastructure.terraformWorkspace) || defaults.terraformWorkspace,
    terraformEnvDir: asString(infrastructure.terraformEnvDir) || defaults.terraformEnvDir,
    ansibleInventory: asString(infrastructure.ansibleInventory) || defaults.ansibleInventory,
    ansiblePlaybook: asString(infrastructure.ansiblePlaybook) || defaults.ansiblePlaybook,
  }
}

interface DeploymentOverviewPanelProps {
  title: string
  subtitle?: string
  overview: ShipDeploymentOverview
  derived?: boolean
}

function DeploymentOverviewPanel({ title, subtitle, overview, derived = false }: DeploymentOverviewPanelProps) {
  const componentsByGroup = overview.topology.groups.map((group) => ({
    group,
    label:
      overview.topology.components.find((component) => component.group === group)?.groupLabel || group,
    components: overview.topology.components.filter((component) => component.group === group),
  }))

  return (
    <div className="rounded-lg border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="readout text-cyan-700 dark:text-cyan-300">{title}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {derived && (
            <span className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-200">
              Derived Fallback
            </span>
          )}
          <span className="rounded-md border border-slate-300/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:border-white/15 dark:text-slate-300">
            {new Date(overview.generatedAt).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Planned Workloads</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{overview.workloads.plannedWorkloads}</p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Planned Pods</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{overview.workloads.plannedPods}</p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Bridge Agent Pods</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{overview.workloads.bridgeAgentPods}</p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Runtime Pods</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{overview.workloads.runtimePods}</p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Observability Pods</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{overview.workloads.observabilityPods}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Baseline</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
            CPU {formatCpuMillicores(overview.resources.baseline.cpuMillicores)}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-200">
            Memory {formatMemoryMiB(overview.resources.baseline.memoryMiB)}
          </p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Crew</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
            CPU {formatCpuMillicores(overview.resources.crew.cpuMillicores)}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-200">
            Memory {formatMemoryMiB(overview.resources.crew.memoryMiB)}
          </p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Runtime</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
            CPU {formatCpuMillicores(overview.resources.runtime.cpuMillicores)}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-200">
            Memory {formatMemoryMiB(overview.resources.runtime.memoryMiB)}
          </p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Observability</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
            CPU {formatCpuMillicores(overview.resources.observability.cpuMillicores)}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-200">
            Memory {formatMemoryMiB(overview.resources.observability.memoryMiB)}
          </p>
        </div>
        <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
            CPU {formatCpuMillicores(overview.resources.totals.cpuMillicores)}
          </p>
          <p className="text-xs text-slate-700 dark:text-slate-200">
            Memory {formatMemoryMiB(overview.resources.totals.memoryMiB)}
          </p>
        </div>
      </div>

      <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-2 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
        <p className="font-medium text-slate-800 dark:text-slate-100">Infrastructure Target</p>
        <p className="mt-1">
          {overview.infrastructureTarget.deploymentProfile} • {overview.infrastructureTarget.provisioningMode} •{" "}
          {overview.infrastructureTarget.nodeType.toUpperCase()}
        </p>
        <p className="mt-1">
          Context {overview.infrastructureTarget.kubeContext} • Namespace {overview.infrastructureTarget.namespace}
        </p>
        <p className="mt-1">
          Terraform {overview.infrastructureTarget.terraformWorkspace} ({overview.infrastructureTarget.terraformEnvDir})
        </p>
        <p className="mt-1">
          Ansible {overview.infrastructureTarget.ansibleInventory} • {overview.infrastructureTarget.ansiblePlaybook}
        </p>
      </div>

      <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-2 py-2 dark:border-white/12 dark:bg-white/[0.03]">
        <p className="text-xs font-medium text-slate-800 dark:text-slate-100">Topology Components</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{overview.topology.provisioningRealityNote}</p>
        <div className="mt-2 space-y-2">
          {componentsByGroup.map((entry) => (
            <div key={entry.group} className="rounded-md border border-slate-300/70 bg-white/70 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {entry.label} • {entry.components.length}
              </p>
              <div className="mt-1 space-y-1">
                {entry.components.map((component) => (
                  <div key={component.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">{component.label}</span>
                      {component.sublabel && (
                        <span className="ml-1 text-slate-500 dark:text-slate-400">({component.sublabel})</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                        {workloadKindLabels[component.workloadKind]}
                      </span>
                      <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                        Replicas {component.replicaCount}
                      </span>
                      {!component.enabled && (
                        <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                          Disabled
                        </span>
                      )}
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${provisioningRealityClasses[component.provisioningReality]}`}>
                        {component.provisioningReality === "currently_provisioned" ? "Provisioned" : "Planned"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 rounded-md border border-slate-300/70 bg-white/70 px-2 py-2 dark:border-white/12 dark:bg-white/[0.03]">
        <p className="text-xs font-medium text-slate-800 dark:text-slate-100">Deployment Requirements</p>
        <div className="mt-2 space-y-1.5">
          {overview.requirements.map((requirement) => (
            <div
              key={requirement.id}
              className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-100">{requirement.title}</p>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${requirementStatusClasses[requirement.status]}`}>
                  {requirement.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{requirement.description}</p>
              {(requirement.value || requirement.secretRef) && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {requirement.value ? `Value: ${requirement.value}` : `Secret Ref: ${requirement.secretRef}`}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch(props: {
  enabled: boolean
  disabled?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  const enabled = props.enabled
  const disabled = props.disabled === true

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={props.label}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        props.onChange(!enabled)
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-950 ${
        enabled
          ? "border-cyan-500/50 bg-cyan-500/20"
          : "border-slate-300/70 bg-slate-200/60 dark:border-white/15 dark:bg-white/[0.04]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform dark:bg-slate-950 dark:ring-white/10 ${
          enabled ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  )
}

export default function ShipYardPage() {
  const { selectedShipDeploymentId, setSelectedShipDeploymentId } = useShipSelection()
  const runtimeRefreshGateRef = useRef(0)
  const wizardFooterRef = useRef<HTMLDivElement | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<LaunchFormState>(() => createInitialFormState())
  const [isLaunchPanelOpen, setIsLaunchPanelOpen] = useState(true)
  const [launchPanelPreferenceLocked, setLaunchPanelPreferenceLocked] = useState(false)
  const [showAdvancedInfrastructure, setShowAdvancedInfrastructure] = useState(false)
  const [isLaunching, setIsLaunching] = useState(false)
  const [message, setMessage] = useState<LaunchMessage | null>(null)
  const [billingWallet, setBillingWallet] = useState<ShipyardBillingWalletState | null>(null)
  const [billingQuote, setBillingQuote] = useState<ShipyardBillingQuoteState | null>(null)
  const [isBillingLoading, setIsBillingLoading] = useState(false)
  const [isRefueling, setIsRefueling] = useState(false)
  const [refuelAmountEur, setRefuelAmountEur] = useState("5")
  const [refuelingError, setRefuelingError] = useState<RefuelingErrorState | null>(null)
  const [ships, setShips] = useState<ShipDeployment[]>([])
  const [isLoadingShips, setIsLoadingShips] = useState(true)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeSnapshot | null>(null)
  const [isLoadingRuntime, setIsLoadingRuntime] = useState(false)
  const [bridgeCrew, setBridgeCrew] = useState<BridgeCrewRecord[]>([])
  const [isLoadingCrew, setIsLoadingCrew] = useState(false)
  const [isLoadingConnectionSummary, setIsLoadingConnectionSummary] = useState(false)
  const [connectionSummary, setConnectionSummary] = useState<BridgeConnectionSummary | null>(null)
  const [monitoringDraft, setMonitoringDraft] = useState<MonitoringUrlFormInput>({
    grafanaUrl: SHIP_MONITORING_DEFAULTS.grafanaUrl,
    prometheusUrl: SHIP_MONITORING_DEFAULTS.prometheusUrl,
    kubeviewUrl: SHIP_MONITORING_DEFAULTS.kubeviewUrl,
    langfuseUrl: SHIP_MONITORING_DEFAULTS.langfuseUrl,
  })
  const [isSavingMonitoring, setIsSavingMonitoring] = useState(false)
  const [crewDrafts, setCrewDrafts] = useState<Record<string, CrewOverrideInput & { status: "active" | "inactive" }>>(
    {},
  )
  const [savingCrewId, setSavingCrewId] = useState<string | null>(null)
  const [transferShipDeploymentId, setTransferShipDeploymentId] = useState("")
  const [transferTargetOwnerEmail, setTransferTargetOwnerEmail] = useState("")
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false)
  const [isUpgradingShip, setIsUpgradingShip] = useState(false)
  const [isScrapRelaunching, setIsScrapRelaunching] = useState(false)
  const [fleetSearchQuery, setFleetSearchQuery] = useState("")
  const [fleetStatusFilter, setFleetStatusFilter] = useState<ShipStatusFilter>("all")
  const [secretValuesByProfile, setSecretValuesByProfile] =
    useState<Record<DeploymentProfile, ShipyardSecretTemplateValues>>(() => createInitialSecretValuesByProfile())
  const [secretSummaryByProfile, setSecretSummaryByProfile] =
    useState<Record<DeploymentProfile, ShipyardSecretTemplateSummary>>(() => createInitialSecretSummaryByProfile())
  const [secretSnippetsByProfile, setSecretSnippetsByProfile] =
    useState<Record<DeploymentProfile, ShipyardSetupSnippets>>(() => createInitialSecretSnippetsByProfile())
  const [secretUpdatedAtByProfile, setSecretUpdatedAtByProfile] =
    useState<Record<DeploymentProfile, string | null>>({
      local_starship_build: null,
      cloud_shipyard: null,
    })
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(false)
  const [isSavingSecrets, setIsSavingSecrets] = useState(false)
  const [isClearingSecrets, setIsClearingSecrets] = useState(false)
  const [cloudSshKeyFingerprint, setCloudSshKeyFingerprint] = useState<string | null>(null)
  type SecretSnippetKind = "env" | "tfvars"
  const [secretSnippetExpanded, setSecretSnippetExpanded] = useState<Record<SecretSnippetKind, boolean>>({
    env: false,
    tfvars: false,
  })
  const [quickLaunchPendingScroll, setQuickLaunchPendingScroll] = useState(false)

  const toggleSecretSnippetExpanded = useCallback((kind: SecretSnippetKind) => {
    setSecretSnippetExpanded((current) => ({ ...current, [kind]: !current[kind] }))
  }, [])

  type N8NFieldKey = (typeof N8N_REQUIRED_SECRET_FIELDS)[number]
  const [n8nFieldExpanded, setN8nFieldExpanded] = useState<Record<N8NFieldKey, boolean>>({
    n8n_database_url: false,
    n8n_basic_auth_user: false,
    n8n_basic_auth_password: false,
    n8n_encryption_key: false,
    n8n_public_base_url: false,
  })

  const toggleN8nFieldExpanded = useCallback((field: N8NFieldKey) => {
    setN8nFieldExpanded((current) => ({ ...current, [field]: !current[field] }))
  }, [])

  const currentStep = steps[stepIndex]
  const [mainTab, setMainTab] = useState<MainTab>("build")
  const requiresRefueling = form.deploymentProfile === "cloud_shipyard"
  const launchBlockedByRefueling =
    requiresRefueling && (!billingQuote || !billingQuote.canLaunch || isBillingLoading)

  const derivedNodeType = useMemo(
    () =>
      deriveNodeTypeFromProfile(
        form.deploymentProfile,
        form.nodeType,
        form.advancedNodeTypeOverride,
      ),
    [form.advancedNodeTypeOverride, form.deploymentProfile, form.nodeType],
  )

  const shipsWithInfrastructure = useMemo<ShipDeploymentWithInfrastructure[]>(
    () =>
      ships.map((ship) => ({
        ...ship,
        infrastructure: resolveInfrastructureConfig(ship.deploymentProfile, ship.config),
      })),
    [ships],
  )

  const selectedShip = useMemo(
    () => shipsWithInfrastructure.find((ship) => ship.id === selectedShipDeploymentId) || null,
    [selectedShipDeploymentId, shipsWithInfrastructure],
  )

  useEffect(() => {
    if (!selectedShip) {
      setMonitoringDraft({
        grafanaUrl: SHIP_MONITORING_DEFAULTS.grafanaUrl,
        prometheusUrl: SHIP_MONITORING_DEFAULTS.prometheusUrl,
        kubeviewUrl: SHIP_MONITORING_DEFAULTS.kubeviewUrl,
        langfuseUrl: SHIP_MONITORING_DEFAULTS.langfuseUrl,
      })
      return
    }

    const monitoring = readShipMonitoringConfig(selectedShip.config || {})
    setMonitoringDraft({
      grafanaUrl: monitoring.grafanaUrl || SHIP_MONITORING_DEFAULTS.grafanaUrl,
      prometheusUrl: monitoring.prometheusUrl || SHIP_MONITORING_DEFAULTS.prometheusUrl,
      kubeviewUrl: monitoring.kubeviewUrl || SHIP_MONITORING_DEFAULTS.kubeviewUrl,
      langfuseUrl: monitoring.langfuseUrl || SHIP_MONITORING_DEFAULTS.langfuseUrl,
    })
  }, [selectedShip?.id, selectedShip?.updatedAt, selectedShip?.config])

  const selectedShipCurrentVersion = useMemo(
    () => resolveShipVersion(selectedShip?.shipVersion),
    [selectedShip?.shipVersion],
  )

  const selectedShipNeedsUpgrade = useMemo(
    () => (selectedShip ? shipVersionNeedsUpgrade(selectedShip.shipVersion) : false),
    [selectedShip],
  )

  const selectedShipUpgradeDisabled = useMemo(
    () =>
      !selectedShip
      || !selectedShipNeedsUpgrade
      || isUpgradingShip
      || SHIP_UPGRADE_BLOCKED_STATUSES.has(selectedShip.status),
    [isUpgradingShip, selectedShip, selectedShipNeedsUpgrade],
  )
  const resolvedTransferShipDeploymentId = useMemo(() => {
    const manualShipId = transferShipDeploymentId.trim()
    if (manualShipId.length > 0) {
      return manualShipId
    }
    return selectedShipDeploymentId || ""
  }, [selectedShipDeploymentId, transferShipDeploymentId])

  const normalizedFleetSearchQuery = useMemo(
    () => fleetSearchQuery.trim().toLowerCase(),
    [fleetSearchQuery],
  )

  const filteredShips = useMemo(() => {
    return shipsWithInfrastructure
      .filter((ship) => (fleetStatusFilter === "all" ? true : ship.status === fleetStatusFilter))
      .filter((ship) => {
        if (!normalizedFleetSearchQuery) return true
        const searchValue = [
          ship.name,
          ship.nodeId,
          ship.deploymentProfile,
          ship.nodeType,
          ship.infrastructure.kubeContext,
          ship.infrastructure.namespace,
        ]
          .join(" ")
          .toLowerCase()
        return searchValue.includes(normalizedFleetSearchQuery)
      })
      .sort((left, right) => toUnixMs(right.updatedAt) - toUnixMs(left.updatedAt))
  }, [fleetStatusFilter, normalizedFleetSearchQuery, shipsWithInfrastructure])

  const hasRosterFilters = fleetStatusFilter !== "all" || normalizedFleetSearchQuery.length > 0

  const clusterSummary = useMemo<ShipyardClusterSummary>(() => {
    return summarizeShipDeployments(ships)
  }, [ships])

  const readyKindClusters = useMemo(() => {
    return (runtimeSnapshot?.kind.clusters || []).filter(
      (cluster) => cluster.kubeContextPresent && cluster.runningNodeCount > 0,
    )
  }, [runtimeSnapshot])

  const selectedRuntimeKindCluster = useMemo(() => {
    const currentContext = runtimeSnapshot?.kubernetes.currentContext
    if (!currentContext) return null
    return (runtimeSnapshot?.kind.clusters || []).find((cluster) => cluster.kubeContext === currentContext) || null
  }, [runtimeSnapshot])

  const nextShipOrdinal = useMemo(() => {
    let maxSeen = 0
    for (const ship of ships) {
      const nameNumber = parseTrailingNumber(ship.name)
      const nodeNumber = parseTrailingNumber(ship.nodeId)
      if (nameNumber && nameNumber > maxSeen) {
        maxSeen = nameNumber
      }
      if (nodeNumber && nodeNumber > maxSeen) {
        maxSeen = nodeNumber
      }
    }
    return maxSeen + 1
  }, [ships])

  const defaultShipName = useMemo(() => formatDefaultShipName(nextShipOrdinal), [nextShipOrdinal])
  const defaultNodeId = useMemo(() => formatDefaultNodeId(nextShipOrdinal), [nextShipOrdinal])
  const resolvedShipName = useMemo(() => form.name.trim() || defaultShipName, [defaultShipName, form.name])
  const resolvedNodeId = useMemo(() => form.nodeId.trim() || defaultNodeId, [defaultNodeId, form.nodeId])

  const reviewBaseRequirementsEstimate = useMemo(
    () =>
      estimateShipBaseRequirements({
        deploymentProfile: form.deploymentProfile,
        crewRoles: REQUIRED_BRIDGE_CREW_ROLES,
      }),
    [form.deploymentProfile],
  )

  const reviewDeploymentOverview = useMemo(
    () =>
      buildShipDeploymentOverview({
        deploymentProfile: form.deploymentProfile,
        provisioningMode: form.provisioningMode,
        nodeType: derivedNodeType,
        infrastructure: form.infrastructure,
        crewRoles: REQUIRED_BRIDGE_CREW_ROLES,
        baseRequirementsEstimate: reviewBaseRequirementsEstimate,
      }),
    [
      derivedNodeType,
      form.deploymentProfile,
      form.infrastructure,
      form.provisioningMode,
      reviewBaseRequirementsEstimate,
    ],
  )

  const reviewLaunchSummary = useMemo(
    () => buildReviewLaunchSummary(reviewDeploymentOverview, reviewBaseRequirementsEstimate),
    [reviewBaseRequirementsEstimate, reviewDeploymentOverview],
  )

  const reviewComponentsByGroup = useMemo(
    () =>
      reviewDeploymentOverview.topology.groups.map((group) => ({
        group,
        label:
          reviewDeploymentOverview.topology.components.find((component) => component.group === group)?.groupLabel ||
          group,
        components: reviewDeploymentOverview.topology.components.filter((component) => component.group === group),
      })),
    [reviewDeploymentOverview],
  )

  const selectedShipBaseRequirementsEstimate = useMemo(() => {
    if (!selectedShip) {
      return null
    }

    const persistedEstimate = readBaseRequirementsEstimate(selectedShip.metadata)
    if (persistedEstimate) {
      return persistedEstimate
    }

    const metadata = selectedShip.metadata
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return estimateShipBaseRequirements({
        deploymentProfile: selectedShip.deploymentProfile,
        crewRoles: REQUIRED_BRIDGE_CREW_ROLES,
      })
    }
    if (!Object.prototype.hasOwnProperty.call(metadata, "bridgeCrewRoles")) {
      return estimateShipBaseRequirements({
        deploymentProfile: selectedShip.deploymentProfile,
        crewRoles: REQUIRED_BRIDGE_CREW_ROLES,
      })
    }

    const metadataCrewRoles = (metadata as Record<string, unknown>).bridgeCrewRoles
    const fallbackCrewRoles =
      Array.isArray(metadataCrewRoles) && metadataCrewRoles.length > 0
        ? metadataCrewRoles
        : REQUIRED_BRIDGE_CREW_ROLES

    return estimateShipBaseRequirements({
      deploymentProfile: selectedShip.deploymentProfile,
      crewRoles: fallbackCrewRoles,
    })
  }, [selectedShip])

  const selectedShipDeploymentOverview = useMemo(() => {
    if (!selectedShip) {
      return null
    }

    const persistedOverview = readShipDeploymentOverview(selectedShip.metadata)
    if (persistedOverview) {
      return persistedOverview
    }

    const metadata = selectedShip.metadata
    const metadataCrewRoles =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).bridgeCrewRoles
        : REQUIRED_BRIDGE_CREW_ROLES
    const fallbackCrewRoles =
      Array.isArray(metadataCrewRoles) && metadataCrewRoles.length > 0
        ? metadataCrewRoles
        : REQUIRED_BRIDGE_CREW_ROLES

    const infrastructure = resolveInfrastructureConfig(selectedShip.deploymentProfile, selectedShip.config)
    const fallbackBaseEstimate =
      selectedShipBaseRequirementsEstimate ||
      estimateShipBaseRequirements({
        deploymentProfile: selectedShip.deploymentProfile,
        crewRoles: fallbackCrewRoles,
      })

    return buildShipDeploymentOverview({
      deploymentProfile: selectedShip.deploymentProfile,
      provisioningMode: selectedShip.provisioningMode,
      nodeType: selectedShip.nodeType,
      infrastructure,
      crewRoles: fallbackCrewRoles,
      baseRequirementsEstimate: fallbackBaseEstimate,
    })
  }, [selectedShip, selectedShipBaseRequirementsEstimate])

  const selectedShipOverviewIsDerived = useMemo(() => {
    if (!selectedShip) {
      return false
    }
    return readShipDeploymentOverview(selectedShip.metadata) === null
  }, [selectedShip])

  const selectedCrewSummary = useMemo(() => {
    const total = bridgeCrew.length
    const active = bridgeCrew.filter((member) => member.status === "active").length
    return {
      total,
      active,
      inactive: total - active,
    }
  }, [bridgeCrew])

  const activeSecretValues = useMemo(
    () => secretValuesByProfile[form.deploymentProfile] || {},
    [form.deploymentProfile, secretValuesByProfile],
  )
  const activeSecretSummary = useMemo(
    () => secretSummaryByProfile[form.deploymentProfile] || createEmptySecretSummary(),
    [form.deploymentProfile, secretSummaryByProfile],
  )
  const activeSecretSnippets = useMemo(
    () => secretSnippetsByProfile[form.deploymentProfile] || EMPTY_SECRET_SNIPPETS,
    [form.deploymentProfile, secretSnippetsByProfile],
  )
  const activeSecretUpdatedAt = useMemo(
    () => secretUpdatedAtByProfile[form.deploymentProfile] || null,
    [form.deploymentProfile, secretUpdatedAtByProfile],
  )
  const visibleSecretFields = useMemo(
    () => PROFILE_SECRET_FIELDS_BY_PROFILE[form.deploymentProfile],
    [form.deploymentProfile],
  )
  const launchEssentialSecretFields = useMemo(
    () => LAUNCH_ESSENTIAL_SECRET_FIELDS_BY_PROFILE[form.deploymentProfile],
    [form.deploymentProfile],
  )
  const optionalIntegrationSecretFields = useMemo(
    () => OPTIONAL_INTEGRATION_SECRET_FIELDS_BY_PROFILE[form.deploymentProfile],
    [form.deploymentProfile],
  )
  const visibleSecretPopulatedFieldCount = useMemo(
    () =>
      visibleSecretFields.filter((field) => activeSecretSummary.fields[field]?.hasValue === true).length,
    [activeSecretSummary.fields, visibleSecretFields],
  )
  const missingLaunchEssentialSecretFields = useMemo(
    () =>
      launchEssentialSecretFields.filter((field) => {
        const value = activeSecretValues[field]
        return !hasNonEmptySecretValue(value)
      }),
    [activeSecretValues, launchEssentialSecretFields],
  )
  const missingRequiredN8NSecretFields = useMemo(
    () => listMissingRequiredN8NSecrets(activeSecretValues),
    [activeSecretValues],
  )
  const n8nSecretPopulatedFieldCount = useMemo(
    () => N8N_REQUIRED_SECRET_FIELDS.filter((field) => hasNonEmptySecretValue(activeSecretValues[field])).length,
    [activeSecretValues],
  )

  const fetchShips = useCallback(async () => {
    setIsLoadingShips(true)
    try {
      const response = await fetch("/api/ships")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      const parsed = Array.isArray(payload) ? (payload as ShipDeployment[]) : []
      setShips(parsed)

      if (parsed.length === 0) {
        setSelectedShipDeploymentId(null)
      } else if (!selectedShipDeploymentId || !parsed.some((ship) => ship.id === selectedShipDeploymentId)) {
        setSelectedShipDeploymentId(parsed[0].id)
      }
    } catch (error) {
      console.error("Failed to load ship deployments:", error)
      setMessage({ type: "error", text: "Unable to load Ship Yard deployments" })
    } finally {
      setIsLoadingShips(false)
    }
  }, [selectedShipDeploymentId, setSelectedShipDeploymentId])

  const handlePanelShipNotFound = useCallback(async () => {
    await fetchShips()
    setMessage({
      type: "info",
      text: "The selected ship is no longer available. Ship selection was refreshed.",
    })
  }, [fetchShips])

  const fetchRuntimeSnapshot = useCallback(async () => {
    setIsLoadingRuntime(true)
    try {
      const response = await fetch("/api/ships/runtime")
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as RuntimeSnapshot
      setRuntimeSnapshot(payload)
    } catch (error) {
      console.error("Failed to load ship runtime snapshot:", error)
      setRuntimeSnapshot(null)
    } finally {
      setIsLoadingRuntime(false)
    }
  }, [])

  const fetchBridgeCrew = useCallback(async () => {
    if (!selectedShipDeploymentId) {
      setBridgeCrew([])
      setCrewDrafts({})
      return
    }

    setIsLoadingCrew(true)
    try {
      const response = await fetch(`/api/bridge-crew?deploymentId=${selectedShipDeploymentId}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      const parsed = Array.isArray(payload) ? (payload as BridgeCrewRecord[]) : []
      setBridgeCrew(parsed)

      const nextDrafts: Record<string, CrewOverrideInput & { status: "active" | "inactive" }> = {}
      for (const record of parsed) {
        nextDrafts[record.id] = {
          name: record.name,
          description: record.description || "",
          content: record.content,
          status: record.status,
        }
      }
      setCrewDrafts(nextDrafts)
    } catch (error) {
      console.error("Failed to load bridge crew:", error)
      setMessage({ type: "error", text: "Unable to load bridge crew records" })
    } finally {
      setIsLoadingCrew(false)
    }
  }, [selectedShipDeploymentId])

  const fetchConnectionSummary = useCallback(async () => {
    if (!selectedShipDeploymentId) {
      setConnectionSummary(null)
      return
    }

    setIsLoadingConnectionSummary(true)
    try {
      const response = await fetch(
        `/api/bridge/connections?deploymentId=${selectedShipDeploymentId}&deliveriesTake=6`,
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      setConnectionSummary((payload?.summary || null) as BridgeConnectionSummary | null)
    } catch (error) {
      console.error("Failed to load bridge connection summary:", error)
      setConnectionSummary(null)
    } finally {
      setIsLoadingConnectionSummary(false)
    }
  }, [selectedShipDeploymentId])

  const refreshFleetView = useCallback(async () => {
    await Promise.all([
      fetchShips(),
      fetchRuntimeSnapshot(),
      fetchBridgeCrew(),
      fetchConnectionSummary(),
    ])
  }, [fetchBridgeCrew, fetchConnectionSummary, fetchRuntimeSnapshot, fetchShips])

  const saveSelectedShipMonitoring = useCallback(async () => {
    if (!selectedShip) {
      return
    }

    setIsSavingMonitoring(true)
    try {
      const existingConfig =
        selectedShip.config && typeof selectedShip.config === "object" && !Array.isArray(selectedShip.config)
          ? (selectedShip.config as Record<string, unknown>)
          : {}

      const response = await fetch(`/api/ships/${selectedShip.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: {
            ...existingConfig,
            monitoring: {
              grafanaUrl: monitoringDraft.grafanaUrl,
              prometheusUrl: monitoringDraft.prometheusUrl,
              kubeviewUrl: monitoringDraft.kubeviewUrl,
              langfuseUrl: monitoringDraft.langfuseUrl,
            },
          },
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : `Unable to save monitoring URLs (${response.status})`,
        )
      }

      setMessage({ type: "success", text: "Monitoring URLs saved for selected ship." })
      await refreshFleetView()
    } catch (error) {
      console.error("Failed to save monitoring URLs:", error)
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save monitoring URLs.",
      })
    } finally {
      setIsSavingMonitoring(false)
    }
  }, [
    monitoringDraft.grafanaUrl,
    monitoringDraft.prometheusUrl,
    monitoringDraft.kubeviewUrl,
    monitoringDraft.langfuseUrl,
    refreshFleetView,
    selectedShip,
  ])

  const refreshRefueling = useCallback(
    async (forceRefresh = false) => {
      if (form.deploymentProfile !== "cloud_shipyard") {
        setBillingWallet(null)
        setBillingQuote(null)
        setRefuelingError(null)
        return
      }

      setIsBillingLoading(true)
      try {
        const [walletResponse, quoteResponse] = await Promise.all([
          fetch("/api/ship-yard/billing/wallet"),
          fetch("/api/ship-yard/billing/quote", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cloudProvider: form.cloudProvider,
              forceRefresh,
            }),
          }),
        ])

        const walletPayload = await walletResponse.json().catch(() => ({}))
        if (walletResponse.ok && walletPayload?.wallet) {
          setBillingWallet(walletPayload.wallet as ShipyardBillingWalletState)
        } else {
          setBillingWallet(null)
        }

        const quotePayload = await quoteResponse.json().catch(() => ({}))
        if (!quoteResponse.ok) {
          const ui = buildUiError(
            quotePayload,
            quoteResponse.status,
            `Unable to load refueling quote (HTTP ${quoteResponse.status})`,
          )
          setRefuelingError({
            text: ui.text,
            code: ui.code,
            ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
              ? { suggestedCommands: ui.suggestedCommands }
              : {}),
          })
          setBillingQuote(null)
          return
        }

        if (quotePayload?.wallet) {
          setBillingWallet(quotePayload.wallet as ShipyardBillingWalletState)
        }
        setBillingQuote((quotePayload?.quote || null) as ShipyardBillingQuoteState | null)
        setRefuelingError(null)
      } catch (error) {
        console.error("Failed to refresh Ship Yard refueling state:", error)
        setBillingQuote(null)
        setRefuelingError({ text: "Unable to load refueling state.", code: null })
      } finally {
        setIsBillingLoading(false)
      }
    },
    [form.cloudProvider, form.deploymentProfile],
  )

  const handleRefuelCredits = useCallback(async () => {
    const amountEur = Number.parseFloat(refuelAmountEur)
    if (!Number.isFinite(amountEur) || amountEur < 5) {
      setMessage({ type: "error", text: "Refuel amount must be at least €5.00." })
      return
    }

    setIsRefueling(true)
    setMessage(null)
    try {
      const response = await fetch("/api/ship-yard/billing/topups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amountEur,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({
          type: "error",
          text: extractApiErrorMessage(payload) || `Refueling failed (HTTP ${response.status})`,
        })
        return
      }

      const checkoutUrl = typeof payload?.checkoutUrl === "string" ? payload.checkoutUrl : null
      if (!checkoutUrl) {
        setMessage({ type: "error", text: "Refueling checkout URL is missing." })
        return
      }

      window.location.assign(checkoutUrl)
    } catch (error) {
      console.error("Refueling checkout failed:", error)
      setMessage({ type: "error", text: "Refueling checkout failed" })
    } finally {
      setIsRefueling(false)
    }
  }, [refuelAmountEur])

  const fetchSecretTemplate = useCallback(
    async (deploymentProfile: DeploymentProfile, includeValues = true) => {
      setIsLoadingSecrets(true)
      try {
        const params = new URLSearchParams({
          deploymentProfile,
          includeValues: includeValues ? "true" : "false",
        })
        const response = await fetch(`/api/ship-yard/secrets?${params.toString()}`)
        const payload = (await response.json().catch(() => null)) as
          | ShipyardSecretTemplateApiPayload
          | { error?: string }
          | null
        if (!response.ok) {
          const ui = buildUiError(payload, response.status, `HTTP ${response.status}`)
          setMessage({
            type: "error",
            text: ui.text,
            code: ui.code,
            ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
              ? { suggestedCommands: ui.suggestedCommands }
              : {}),
          })
          return
        }

        const parsed = payload as ShipyardSecretTemplateApiPayload
        const values = (parsed.template.values || {}) as ShipyardSecretTemplateValues
        setSecretValuesByProfile((current) => ({
          ...current,
          [deploymentProfile]: values,
        }))
        setSecretSummaryByProfile((current) => ({
          ...current,
          [deploymentProfile]: parsed.template.summary || createEmptySecretSummary(),
        }))
        setSecretSnippetsByProfile((current) => ({
          ...current,
          [deploymentProfile]: parsed.snippets || EMPTY_SECRET_SNIPPETS,
        }))
        setSecretUpdatedAtByProfile((current) => ({
          ...current,
          [deploymentProfile]: parsed.template.updatedAt || null,
        }))
      } catch (error) {
        console.error("Failed to load Ship Yard secret template:", error)
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to load Ship Yard secret template.",
        })
      } finally {
        setIsLoadingSecrets(false)
      }
    },
    [],
  )

  const updateSecretField = useCallback(
    (deploymentProfile: DeploymentProfile, field: ShipyardSecretFieldKey, value: string) => {
      setSecretValuesByProfile((current) => ({
        ...current,
        [deploymentProfile]: {
          ...(current[deploymentProfile] || {}),
          [field]: value,
        },
      }))
    },
    [],
  )

  const autoFillN8NSetup = useCallback(() => {
    const deploymentProfile = form.deploymentProfile
    let localDbSkipped = false
    let cloudDbSkipped = false
    let changed = false
    const existingValues = secretValuesByProfile[deploymentProfile] || {}
    const nextValues: ShipyardSecretTemplateValues = {
      ...existingValues,
    }

    const setIfMissing = (
      field: ShipyardSecretFieldKey,
      buildValue: () => string | null,
    ) => {
      if (hasNonEmptySecretValue(nextValues[field])) {
        return
      }
      const candidate = buildValue()
      if (!candidate || candidate.trim().length === 0) {
        if (field === "n8n_database_url" && deploymentProfile === "local_starship_build") {
          localDbSkipped = true
        }
        if (field === "n8n_database_url" && deploymentProfile === "cloud_shipyard") {
          cloudDbSkipped = true
        }
        return
      }
      nextValues[field] = candidate
      changed = true
    }

    setIfMissing("n8n_basic_auth_user", () => "captain")
    setIfMissing("n8n_basic_auth_password", () => generateRandomSecret(32))
    setIfMissing("n8n_encryption_key", () => generateRandomSecret(32))
    setIfMissing("n8n_database_url", () =>
      buildDefaultN8NDatabaseUrl({
        deploymentProfile,
        namespace: form.infrastructure.namespace,
        postgresPassword: nextValues.postgres_password || null,
        databaseUrl: nextValues.database_url || null,
      }),
    )
    setIfMissing("n8n_public_base_url", () =>
      buildDefaultN8NPublicBaseUrl({
        deploymentProfile,
        nodeUrl: form.nodeUrl,
      }),
    )

    if (changed) {
      setSecretValuesByProfile((current) => ({
        ...current,
        [deploymentProfile]: nextValues,
      }))
      setMessage({
        type: "info",
        text: localDbSkipped
          ? "Applied n8n defaults to empty fields. Local DB URL still needs postgres_password to derive automatically."
          : cloudDbSkipped
            ? "Applied n8n defaults to empty fields. Cloud DB URL still needs database_url in Secrets to derive automatically."
          : "Applied n8n defaults to empty fields. Review and save template when ready.",
      })
      return
    }

    setMessage({
      type: "info",
      text: localDbSkipped
        ? "No n8n defaults applied. Add postgres_password first to derive a local N8N_DATABASE_URL."
        : cloudDbSkipped
          ? "No n8n defaults applied. Add database_url in Secrets to derive a cloud N8N_DATABASE_URL."
        : "No n8n defaults applied because required fields are already populated.",
    })
  }, [
    form.deploymentProfile,
    form.infrastructure.namespace,
    form.nodeUrl,
    secretValuesByProfile,
  ])

  const saveSecretTemplate = useCallback(async () => {
    const deploymentProfile = form.deploymentProfile
    const values = secretValuesByProfile[deploymentProfile] || {}

    setIsSavingSecrets(true)
    try {
      const response = await fetch("/api/ship-yard/secrets", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deploymentProfile,
          values,
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | ShipyardSecretTemplateApiPayload
        | { error?: string }
        | null
      if (!response.ok) {
        const ui = buildUiError(payload, response.status, `HTTP ${response.status}`)
        setMessage({
          type: "error",
          text: ui.text,
          code: ui.code,
          ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
            ? { suggestedCommands: ui.suggestedCommands }
            : {}),
        })
        return
      }

      const parsed = payload as ShipyardSecretTemplateApiPayload
      setSecretValuesByProfile((current) => ({
        ...current,
        [deploymentProfile]: (parsed.template.values || {}) as ShipyardSecretTemplateValues,
      }))
      setSecretSummaryByProfile((current) => ({
        ...current,
        [deploymentProfile]: parsed.template.summary || createEmptySecretSummary(),
      }))
      setSecretSnippetsByProfile((current) => ({
        ...current,
        [deploymentProfile]: parsed.snippets || EMPTY_SECRET_SNIPPETS,
      }))
      setSecretUpdatedAtByProfile((current) => ({
        ...current,
        [deploymentProfile]: parsed.template.updatedAt || null,
      }))
      setMessage({
        type: "success",
        text: `Ship Yard secret template saved for ${deploymentProfileLabels[deploymentProfile]}.`,
      })
    } catch (error) {
      console.error("Failed to save Ship Yard secret template:", error)
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to save Ship Yard secret template.",
      })
    } finally {
      setIsSavingSecrets(false)
    }
  }, [form.deploymentProfile, secretValuesByProfile])

  const clearSecretTemplate = useCallback(async () => {
    const deploymentProfile = form.deploymentProfile
    setIsClearingSecrets(true)
    try {
      const params = new URLSearchParams({ deploymentProfile })
      const response = await fetch(`/api/ship-yard/secrets?${params.toString()}`, {
        method: "DELETE",
      })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; deleted?: boolean }
        | null
      if (!response.ok) {
        const ui = buildUiError(payload, response.status, `HTTP ${response.status}`)
        setMessage({
          type: "error",
          text: ui.text,
          code: ui.code,
          ...(ui.suggestedCommands && ui.suggestedCommands.length > 0
            ? { suggestedCommands: ui.suggestedCommands }
            : {}),
        })
        return
      }

      setSecretValuesByProfile((current) => ({
        ...current,
        [deploymentProfile]: {},
      }))
      setSecretSummaryByProfile((current) => ({
        ...current,
        [deploymentProfile]: createEmptySecretSummary(),
      }))
      setSecretSnippetsByProfile((current) => ({
        ...current,
        [deploymentProfile]: { ...EMPTY_SECRET_SNIPPETS },
      }))
      setSecretUpdatedAtByProfile((current) => ({
        ...current,
        [deploymentProfile]: null,
      }))

      setMessage({
        type: "info",
        text: `Ship Yard secret template cleared for ${deploymentProfileLabels[deploymentProfile]}.`,
      })
    } catch (error) {
      console.error("Failed to clear Ship Yard secret template:", error)
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to clear Ship Yard secret template.",
      })
    } finally {
      setIsClearingSecrets(false)
    }
  }, [form.deploymentProfile])

  const copySecretSnippet = useCallback(
    async (snippetKind: "env" | "tfvars") => {
      try {
        const value =
          snippetKind === "env" ? activeSecretSnippets.envSnippet : activeSecretSnippets.terraformTfvarsSnippet
        await navigator.clipboard.writeText(value)
        setMessage({
          type: "success",
          text: snippetKind === "env" ? "Copied .env snippet." : "Copied terraform.tfvars snippet.",
        })
      } catch (error) {
        console.error("Failed to copy snippet:", error)
        setMessage({
          type: "error",
          text: "Clipboard write failed. Copy manually from the snippet preview.",
        })
      }
    },
    [activeSecretSnippets.envSnippet, activeSecretSnippets.terraformTfvarsSnippet],
  )

  const handleRealtimeShipEvent = useCallback(
    (event: { payload: unknown }) => {
      void fetchShips()

      const now = Date.now()
      if (now - runtimeRefreshGateRef.current >= 10_000) {
        runtimeRefreshGateRef.current = now
        void fetchRuntimeSnapshot()
      }

      const payload = event.payload as { shipId?: unknown; deploymentId?: unknown }
      const targetShipId =
        typeof payload?.shipId === "string"
          ? payload.shipId
          : typeof payload?.deploymentId === "string"
            ? payload.deploymentId
            : null

      if (targetShipId && targetShipId === selectedShipDeploymentId) {
        void fetchBridgeCrew()
        void fetchConnectionSummary()
      }
    },
    [
      fetchBridgeCrew,
      fetchConnectionSummary,
      fetchRuntimeSnapshot,
      fetchShips,
      selectedShipDeploymentId,
    ],
  )

  useEventStream({
    enabled: true,
    types: ["ship.updated", "deployment.updated"],
    onEvent: handleRealtimeShipEvent,
  })

  useEffect(() => {
    void fetchShips()
    void fetchRuntimeSnapshot()
  }, [fetchRuntimeSnapshot, fetchShips])

  useEffect(() => {
    void fetchBridgeCrew()
  }, [fetchBridgeCrew])

  useEffect(() => {
    void fetchConnectionSummary()
  }, [fetchConnectionSummary])

  useEffect(() => {
    if (!selectedShipDeploymentId) {
      return
    }
    setTransferShipDeploymentId(selectedShipDeploymentId)
  }, [selectedShipDeploymentId])

  useEffect(() => {
    if (launchPanelPreferenceLocked) {
      return
    }
    setIsLaunchPanelOpen(ships.length === 0)
  }, [launchPanelPreferenceLocked, ships.length])

  useEffect(() => {
    if (currentStep.id !== "secrets" && currentStep.id !== "apps") {
      return
    }
    fetchSecretTemplate(form.deploymentProfile, true)
  }, [currentStep.id, fetchSecretTemplate, form.deploymentProfile])

  useEffect(() => {
    if (currentStep.id !== "review") {
      return
    }
    if (form.deploymentProfile !== "cloud_shipyard") {
      setBillingWallet(null)
      setBillingQuote(null)
      setRefuelingError(null)
      return
    }
    void refreshRefueling(false)
  }, [currentStep.id, form.deploymentProfile, refreshRefueling])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const billingStatus = params.get("billing")
    if (!billingStatus) {
      return
    }

    if (billingStatus === "success") {
      setMessage({ type: "success", text: "Refueling submitted. Waiting for payment confirmation..." })
      void refreshRefueling(true)
      const timers = [1200, 3200, 6200].map((delayMs) =>
        window.setTimeout(() => {
          void refreshRefueling(true)
        }, delayMs),
      )

      const cleaned = new URL(window.location.href)
      cleaned.searchParams.delete("billing")
      window.history.replaceState({}, "", cleaned.toString())

      return () => {
        for (const timer of timers) {
          window.clearTimeout(timer)
        }
      }
    }

    if (billingStatus === "cancel") {
      setMessage({ type: "info", text: "Refueling canceled before payment completion." })
      const cleaned = new URL(window.location.href)
      cleaned.searchParams.delete("billing")
      window.history.replaceState({}, "", cleaned.toString())
    }
  }, [refreshRefueling])

  const canAdvance = useMemo(() => {
    if (currentStep.id === "mission") {
      return resolvedShipName.length > 0 && resolvedNodeId.length > 0
    }
    return true
  }, [currentStep.id, resolvedNodeId, resolvedShipName])

  const handleQuickLaunch = useCallback(() => {
    const launchStepIndex = steps.findIndex((step) => step.id === "review")
    const targetIndex = launchStepIndex >= 0 ? launchStepIndex : steps.length - 1

    if (stepIndex !== targetIndex) {
      setStepIndex(targetIndex)
      setQuickLaunchPendingScroll(true)
      return
    }

    wizardFooterRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [stepIndex])

  useEffect(() => {
    if (!quickLaunchPendingScroll) {
      return
    }

    const launchStepIndex = steps.findIndex((step) => step.id === "review")
    const targetIndex = launchStepIndex >= 0 ? launchStepIndex : steps.length - 1

    if (stepIndex !== targetIndex) {
      return
    }

    setQuickLaunchPendingScroll(false)
    wizardFooterRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [quickLaunchPendingScroll, stepIndex])

  const updateCrewOverride = (role: BridgeCrewRole, patch: Partial<CrewOverrideInput>) => {
    setForm((current) => ({
      ...current,
      crewOverrides: {
        ...current.crewOverrides,
        [role]: {
          ...current.crewOverrides[role],
          ...patch,
        },
      },
    }))
  }

  const handleLaunch = async () => {
    if (launchBlockedByRefueling) {
      setMessage({
        type: "error",
        text: refuelingError?.text || "Refueling required before launch.",
        code: refuelingError?.code ?? null,
        ...(refuelingError?.suggestedCommands && refuelingError.suggestedCommands.length > 0
          ? { suggestedCommands: refuelingError.suggestedCommands }
          : {}),
      })
      return
    }

    setIsLaunching(true)
    setMessage(null)
    try {
      const selectedOverrides = Object.fromEntries(
        REQUIRED_BRIDGE_CREW_ROLES.map((role) => [role, form.crewOverrides[role]]),
      )

      const response = await fetch("/api/ship-yard/launch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: resolvedShipName,
          description: form.description || null,
          nodeId: resolvedNodeId,
          nodeUrl: form.nodeUrl || null,
          saneBootstrap: form.deploymentProfile === "local_starship_build" ? form.saneBootstrap : undefined,
          deploymentProfile: form.deploymentProfile,
          provisioningMode: form.provisioningMode,
          advancedNodeTypeOverride: form.advancedNodeTypeOverride,
          nodeType: form.nodeType,
          config: {
            infrastructure: form.infrastructure,
            monitoring: {
              grafanaUrl: form.monitoring.grafanaUrl,
              prometheusUrl: form.monitoring.prometheusUrl,
              kubeviewUrl: form.monitoring.kubeviewUrl,
              langfuseUrl: form.monitoring.langfuseUrl,
            },
            initialApplications: form.initialApplications,
            ...(form.deploymentProfile === "cloud_shipyard"
              ? {
                  cloudProvider: form.cloudProvider,
                }
              : {}),
          },
          crewRoles: REQUIRED_BRIDGE_CREW_ROLES,
          crewOverrides: selectedOverrides,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        const suggestedCommands = Array.isArray(payload?.details?.suggestedCommands)
          ? payload.details.suggestedCommands.filter(
              (command: unknown): command is string =>
                typeof command === "string" && command.trim().length > 0,
            )
          : []

        if (typeof payload?.deployment?.id === "string") {
          setSelectedShipDeploymentId(payload.deployment.id)
        }

        setMessage({
          type: "error",
          text: typeof payload?.error === "string" ? payload.error : "Ship launch failed",
          ...(suggestedCommands.length > 0 ? { suggestedCommands } : {}),
        })
        if (payload?.code === "INSUFFICIENT_CREDITS") {
          await refreshRefueling(true)
        }
        await refreshFleetView()
        return
      }

      if (typeof payload?.deployment?.id === "string") {
        setSelectedShipDeploymentId(payload.deployment.id)
      }

      const bootstrapN8N = payload?.bootstrap?.n8n
      if (
        bootstrapN8N
        && typeof bootstrapN8N === "object"
        && typeof bootstrapN8N.status === "string"
        && bootstrapN8N.status !== "ready"
        && bootstrapN8N.status !== "skipped"
      ) {
        const warningLines = Array.isArray(bootstrapN8N.warnings)
          ? bootstrapN8N.warnings.filter(
              (warning: unknown): warning is string =>
                typeof warning === "string" && warning.trim().length > 0,
            )
          : []
        const errorLines = Array.isArray(bootstrapN8N.errors)
          ? bootstrapN8N.errors
              .map((entry: unknown) => {
                if (!entry || typeof entry !== "object") {
                  return null
                }
                const messageValue = (entry as { message?: unknown }).message
                return typeof messageValue === "string" && messageValue.trim().length > 0
                  ? messageValue
                  : null
              })
              .filter((value: string | null): value is string => Boolean(value))
          : []

        const suggestedCommands = [...warningLines, ...errorLines].slice(0, 4)

        setMessage({
          type: "info",
          text: `Ship launched. Bridge crew bootstrap complete. n8n bootstrap is ${bootstrapN8N.status}.`,
          ...(suggestedCommands.length > 0 ? { suggestedCommands } : {}),
        })
      } else {
        setMessage({ type: "success", text: "Ship launched. Bridge crew bootstrap complete." })
      }
      setStepIndex(0)
      setForm(createInitialFormState())
      setCloudSshKeyFingerprint(null)
      setMainTab("ops")
      setBillingQuote(null)
      setBillingWallet(null)
      await refreshFleetView()
    } catch (error) {
      console.error("Ship launch failed:", error)
      setMessage({ type: "error", text: "Ship launch failed" })
    } finally {
      setIsLaunching(false)
    }
  }

  const saveCrewDraft = async (crewId: string) => {
    const draft = crewDrafts[crewId]
    if (!draft) return

    setSavingCrewId(crewId)
    try {
      const response = await fetch(`/api/bridge-crew/${crewId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          content: draft.content,
          status: draft.status,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        setMessage({
          type: "error",
          text: typeof payload?.error === "string" ? payload.error : "Failed to save bridge crew update",
        })
        return
      }

      setMessage({ type: "success", text: "Bridge crew profile updated." })
      await fetchBridgeCrew()
    } catch (error) {
      console.error("Bridge crew update failed:", error)
      setMessage({ type: "error", text: "Failed to save bridge crew update" })
    } finally {
      setSavingCrewId(null)
    }
  }

  const handleUpgradeShip = async () => {
    if (!selectedShip) {
      setMessage({
        type: "info",
        text: "Select a ship to run an upgrade.",
      })
      return
    }

    if (!shipVersionNeedsUpgrade(selectedShip.shipVersion)) {
      setMessage({
        type: "info",
        text: `${selectedShip.name} is already on the latest release (${SHIP_LATEST_VERSION}).`,
      })
      return
    }

    if (SHIP_UPGRADE_BLOCKED_STATUSES.has(selectedShip.status)) {
      setMessage({
        type: "error",
        text: `Cannot upgrade while ship status is ${selectedShip.status}. Wait for it to settle.`,
      })
      return
    }

    setIsUpgradingShip(true)
    try {
      const response = await fetch(`/api/ship-yard/ships/${selectedShip.id}/upgrade`, {
        method: "POST",
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({
          type: "error",
          text: extractApiErrorMessage(payload) || `Ship upgrade failed (HTTP ${response.status}).`,
        })
        await refreshFleetView()
        return
      }

      if (payload?.upgraded === false || payload?.code === "ALREADY_LATEST") {
        const latestVersion = resolveShipVersion(
          (payload?.deployment as Record<string, unknown> | undefined)?.shipVersion,
        )
        setMessage({
          type: "info",
          text: `${selectedShip.name} is already on release ${latestVersion}.`,
        })
      } else {
        const fromVersion = resolveShipVersion(payload?.fromVersion)
        const toVersion = resolveShipVersion(payload?.toVersion)
        setMessage({
          type: "success",
          text: `${selectedShip.name} upgraded from ${fromVersion} to ${toVersion}.`,
        })
      }

      await refreshFleetView()
    } catch (error) {
      console.error("Ship upgrade failed:", error)
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ship upgrade failed.",
      })
    } finally {
      setIsUpgradingShip(false)
    }
  }

  const handleScrapAndRelaunch = async () => {
    if (!selectedShip) {
      setMessage({
        type: "info",
        text: "Select a ship to scrap and relaunch.",
      })
      return
    }

    const confirmed = window.confirm(
      `Scrap & relaunch ${selectedShip.name}? This deletes the ship record in OrchWiz (it does not destroy cluster resources).`,
    )
    if (!confirmed) {
      return
    }

    setIsScrapRelaunching(true)
    setMessage(null)
    try {
      const scrapResponse = await fetch(`/api/ships/${selectedShip.id}`, {
        method: "DELETE",
      })

      const scrapPayload = await scrapResponse.json().catch(() => ({}))
      if (!scrapResponse.ok) {
        throw new Error(
          typeof scrapPayload?.error === "string"
            ? scrapPayload.error
            : `Unable to scrap ship (HTTP ${scrapResponse.status})`,
        )
      }

      const existingConfig =
        selectedShip.config && typeof selectedShip.config === "object" && !Array.isArray(selectedShip.config)
          ? (selectedShip.config as Record<string, unknown>)
          : {}

      const existingMonitoring =
        existingConfig.monitoring && typeof existingConfig.monitoring === "object" && !Array.isArray(existingConfig.monitoring)
          ? (existingConfig.monitoring as Record<string, unknown>)
          : {}

      const relaunchConfig = {
        ...existingConfig,
        monitoring: {
          ...existingMonitoring,
          langfuseUrl: Object.prototype.hasOwnProperty.call(existingMonitoring, "langfuseUrl")
            ? existingMonitoring.langfuseUrl
            : SHIP_MONITORING_DEFAULTS.langfuseUrl,
        },
      }

      const response = await fetch("/api/ship-yard/launch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: selectedShip.name,
          nodeId: selectedShip.nodeId,
          saneBootstrap: selectedShip.deploymentProfile === "local_starship_build" ? true : undefined,
          deploymentProfile: selectedShip.deploymentProfile,
          provisioningMode: selectedShip.provisioningMode,
          advancedNodeTypeOverride: selectedShip.nodeType === "hybrid",
          nodeType: selectedShip.nodeType,
          config: relaunchConfig,
          crewRoles: REQUIRED_BRIDGE_CREW_ROLES,
          crewOverrides: {},
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const suggestedCommands = Array.isArray(payload?.details?.suggestedCommands)
          ? payload.details.suggestedCommands.filter(
              (command: unknown): command is string =>
                typeof command === "string" && command.trim().length > 0,
            )
          : []

        if (typeof payload?.deployment?.id === "string") {
          setSelectedShipDeploymentId(payload.deployment.id)
        } else {
          setSelectedShipDeploymentId(null)
        }

        setMessage({
          type: "error",
          text: typeof payload?.error === "string" ? payload.error : "Ship relaunch failed",
          ...(suggestedCommands.length > 0 ? { suggestedCommands } : {}),
        })
        await refreshFleetView()
        return
      }

      if (typeof payload?.deployment?.id === "string") {
        setSelectedShipDeploymentId(payload.deployment.id)
      } else {
        setSelectedShipDeploymentId(null)
      }

      setMessage({
        type: "success",
        text: `Scrapped and relaunched ${selectedShip.name}.`,
      })
      await refreshFleetView()
    } catch (error) {
      console.error("Scrap & relaunch failed:", error)
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Scrap & relaunch failed.",
      })
      await refreshFleetView()
    } finally {
      setIsScrapRelaunching(false)
    }
  }

  const handleOwnershipTransfer = async () => {
    const shipId = resolvedTransferShipDeploymentId
    const targetOwnerEmail = transferTargetOwnerEmail.trim().toLowerCase()

    if (!shipId) {
      setMessage({
        type: "error",
        text: "Provide a ship deployment ID before transferring ownership.",
      })
      return
    }

    if (!targetOwnerEmail) {
      setMessage({
        type: "error",
        text: "Provide a target owner email before transferring ownership.",
      })
      return
    }

    const selectedLabel =
      selectedShip && selectedShip.id === shipId ? `${selectedShip.name} (${shipId})` : shipId
    const confirmed = window.confirm(
      `Transfer ownership of ${selectedLabel} to ${targetOwnerEmail}?`,
    )
    if (!confirmed) {
      return
    }

    setIsTransferringOwnership(true)
    try {
      const response = await fetch("/api/ship-yard/ownership/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shipDeploymentId: shipId,
          targetOwnerEmail,
        }),
      })
      const payload = (await response.json().catch(() => null)) as OwnershipTransferApiResponse | null
      if (!response.ok) {
        throw new Error(extractApiErrorMessage(payload) || `HTTP ${response.status}`)
      }

      const warningMessages = Array.isArray(payload?.warnings)
        ? payload.warnings.filter(
            (entry): entry is string =>
              typeof entry === "string" && entry.trim().length > 0,
          )
        : []
      const reassignedCount =
        typeof payload?.applications?.reassignedCount === "number"
          ? payload.applications.reassignedCount
          : 0

      if (payload?.transferred === false) {
        setMessage({
          type: "info",
          text: "Ship ownership is already assigned to that user.",
        })
      } else if (warningMessages.length > 0) {
        setMessage({
          type: "info",
          text: `Ship ownership transferred and ${reassignedCount} application(s) reassigned. ${warningMessages.join(" ")}`,
        })
      } else {
        setMessage({
          type: "success",
          text: `Ship ownership transferred and ${reassignedCount} application(s) reassigned.`,
        })
      }

      setTransferTargetOwnerEmail("")
      await refreshFleetView()
    } catch (error) {
      console.error("Ship ownership transfer failed:", error)
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ship ownership transfer failed",
      })
    } finally {
      setIsTransferringOwnership(false)
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 p-2.5 dark:from-amber-500/15 dark:to-orange-500/15">
                <Ship className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }}>Ship Yard</h1>
                <div className="mt-0.5 flex items-center gap-3">
                  <span className="readout text-slate-500">{ships.length} SHIPS</span>
                  {clusterSummary.deployedNowCount > 0 && <span className="readout text-emerald-600 dark:text-emerald-400">{clusterSummary.deployedNowCount} DEPLOYED</span>}
                  {clusterSummary.failedCount > 0 && <span className="readout text-rose-600 dark:text-rose-400">{clusterSummary.failedCount} FAILED</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedShip && (
                <button
                  type="button"
                  onClick={() => setMainTab("ops")}
                  className="hidden items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/8 px-3 py-1.5 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-500/15 sm:inline-flex dark:border-cyan-400/25 dark:text-cyan-300"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${selectedShip.status === "active" ? "bg-emerald-500" : selectedShip.status === "failed" ? "bg-rose-500" : "bg-slate-400"}`} />
                  {selectedShip.name}
                </button>
              )}
              <button type="button" onClick={refreshFleetView} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-200 dark:hover:bg-white/[0.08]">
                <RefreshCw className={`h-4 w-4 ${isLoadingShips || isLoadingRuntime ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="mt-5 flex items-center gap-1 border-b border-slate-200/80 dark:border-white/10">
            {([
              { key: "build" as MainTab, label: "Build", icon: Rocket },
              { key: "fleet" as MainTab, label: "Fleet", icon: Compass },
              { key: "apiKeys" as MainTab, label: "Ship Yard API Keys", icon: KeyRound },
              ...(selectedShipDeploymentId ? [{ key: "ops" as MainTab, label: selectedShip?.name || "Ship Ops", icon: Settings2 }] : []),
            ] as { key: MainTab; label: string; icon: typeof Rocket }[]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setMainTab(t.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  mainTab === t.key
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                <span className="max-w-[160px] truncate">{t.label}</span>
                {mainTab === t.key && (
                  <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-amber-500 dark:bg-amber-400" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4">
            <InlineNotice variant={message.type}>
              <div className="space-y-2">
                <p>{message.text}</p>
                {message.code ? (
                  <p className="text-xs">
                    Code: <code>{message.code}</code>
                  </p>
                ) : null}
                {message.code && isWalletEnclaveCode(message.code) ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Next steps</p>
                    <ul className="list-disc space-y-1 pl-5 text-xs">
                      {walletEnclaveGuidance(message.code).steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {message.suggestedCommands && message.suggestedCommands.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs">
                    {message.suggestedCommands.map((command) => (
                      <li key={command}>
                        <code>{command}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </InlineNotice>
          </div>
        )}

        {CLOUD_DEPLOY_ONLY && mainTab === "build" && (
          <div className="mb-4">
            <InlineNotice variant="info">
              Cloud deploy mode is enabled. Local Starship Build launches are disabled.
            </InlineNotice>
          </div>
        )}

        <div className="space-y-4">

        {mainTab === "ops" && !selectedShipDeploymentId && (
          <SurfaceCard>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-2xl bg-slate-100 p-5 dark:bg-white/5">
                <Ship className="h-10 w-10 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-300">No ship selected</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select a ship from the Fleet tab or launch a new one from Build.</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setMainTab("fleet")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
                  View Fleet
                </button>
                <button type="button" onClick={() => setMainTab("build")} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 dark:bg-amber-500/90">
                  Build New Ship
                </button>
              </div>
            </div>
          </SurfaceCard>
        )}

        {mainTab === "fleet" && (<SurfaceCard className="border-slate-300/70 bg-white/80 dark:border-white/12 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="readout text-slate-500 dark:text-slate-400">Cluster Deployment Snapshot</p>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">What is deployed right now</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                See where ships are deployed, which clusters are healthy, and what needs attention.
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/70 bg-white/70 px-3 py-2 text-right text-xs text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
              <p className="readout text-slate-500 dark:text-slate-400">Latest fleet update</p>
              {clusterSummary.newestUpdatedAt ? (
                <>
                  <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                    {formatRelativeTimestamp(clusterSummary.newestUpdatedAt)}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {new Date(clusterSummary.newestUpdatedAt).toLocaleString()}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-slate-500 dark:text-slate-400">No activity yet</p>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-6">
            <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-200">Deployed Now</p>
              <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
                {clusterSummary.deployedNowCount}
              </p>
            </div>
            <div className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-cyan-700 dark:text-cyan-200">Transitioning</p>
              <p className="mt-1 text-lg font-semibold text-cyan-700 dark:text-cyan-200">
                {clusterSummary.transitioningCount}
              </p>
            </div>
            <div className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2">
              <div className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-200">
                <AlertTriangle className="h-3.5 w-3.5" />
                Failed
              </div>
              <p className="mt-1 text-lg font-semibold text-rose-700 dark:text-rose-200">
                {clusterSummary.failedCount}
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Health</p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                Healthy {clusterSummary.healthCounts.healthy}
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-200">
                Unhealthy {clusterSummary.healthCounts.unhealthy}
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Contexts</p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                Targeted {clusterSummary.targetedContexts}
              </p>
            </div>
            <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Namespaces</p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                Targeted {clusterSummary.targetedNamespaces}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-cyan-400/35 bg-cyan-500/8 px-3 py-2 dark:border-cyan-300/35">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Where it is deployed</p>
              <span className="rounded-md border border-slate-300/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:border-white/15 dark:text-slate-300">
                {clusterSummary.groups.length} target{clusterSummary.groups.length === 1 ? "" : "s"}
              </span>
            </div>
            {clusterSummary.groups.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                No ship deployments yet. Launch your first ship to populate cluster targets.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {clusterSummary.groups.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-md border border-cyan-400/30 bg-white/75 px-3 py-2 text-xs dark:bg-white/[0.04]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {infrastructureKindLabel(group.kind)} • {group.kubeContext}
                      </p>
                      <span className="rounded-md border border-slate-300/70 px-2 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                        {group.shipCount} ship{group.shipCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                      Namespace {group.namespace}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="rounded border border-slate-300/70 px-1.5 py-0.5 dark:border-white/15">
                        Active {group.statusCounts.active}
                      </span>
                      <span className="rounded border border-slate-300/70 px-1.5 py-0.5 dark:border-white/15">
                        Transitioning {group.statusCounts.pending + group.statusCounts.deploying}
                      </span>
                      <span className="rounded border border-slate-300/70 px-1.5 py-0.5 dark:border-white/15">
                        Failed {group.statusCounts.failed}
                      </span>
                      <span className="rounded border border-slate-300/70 px-1.5 py-0.5 dark:border-white/15">
                        Healthy {group.healthyCount}
                      </span>
                      {group.newestUpdatedAt && (
                        <span className="text-slate-500 dark:text-slate-400">
                          Updated {formatRelativeTimestamp(group.newestUpdatedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Runtime Signal Strip</p>
              {runtimeSnapshot?.checkedAt && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Checked {formatRelativeTimestamp(runtimeSnapshot.checkedAt)}
                </span>
              )}
            </div>
            {isLoadingRuntime ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Syncing runtime snapshot...
              </div>
            ) : runtimeSnapshot ? (
              <>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/[0.05]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Kubectl Context</p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      {runtimeSnapshot.kubernetes.currentContext || "Unavailable"}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/[0.05]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">KIND Readiness</p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      {readyKindClusters.length} ready / {(runtimeSnapshot.kind.clusters || []).length} detected
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1.5 text-xs dark:border-white/15 dark:bg-white/[0.05]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Current Context Nodes
                    </p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      {selectedRuntimeKindCluster
                        ? `${selectedRuntimeKindCluster.runningNodeCount}/${selectedRuntimeKindCluster.totalNodeCount} running`
                        : "No matching KIND cluster"}
                    </p>
                  </div>
                </div>
                {(runtimeSnapshot.kubernetes.error || runtimeSnapshot.kind.error) && (
                  <div className="mt-2 rounded-md border border-amber-400/35 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-200">
                    {runtimeSnapshot.kubernetes.error || runtimeSnapshot.kind.error}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Runtime snapshot unavailable.</p>
            )}
          </div>
        </SurfaceCard>)}

        {mainTab === "build" && (<SurfaceCard className="border-amber-400/25 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/40 dark:from-amber-500/8 dark:via-white/[0.03] dark:to-orange-500/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="readout text-amber-700 dark:text-amber-400">Launch New Ship</p>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Deployment Wizard</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Configure mission, environment, secrets, apps, and bridge crew for a new deployment.
              </p>
            </div>
          </div>

            <>
              <div className="mt-3 flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 dark:border-white/8 dark:bg-white/[0.02]">
                {steps.map((step, index) => {
                  const Icon = step.icon
                  const isComplete = index < stepIndex
                  const isActive = index === stepIndex
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setStepIndex(index)}
                      className={`relative flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                        isActive
                          ? "bg-white text-amber-700 shadow-sm dark:bg-white/10 dark:text-amber-300"
                          : isComplete
                            ? "text-emerald-600 hover:bg-white/60 dark:text-emerald-400 dark:hover:bg-white/5"
                            : "text-slate-500 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-white/5"
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                          isActive
                            ? "bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-900"
                            : "bg-slate-300/80 text-slate-600 dark:bg-white/15 dark:text-slate-400"
                        }`}>{index + 1}</span>
                      )}
                      <span className="hidden sm:inline">{step.title}</span>
                    </button>
                  )
                })}
              </div>

	          <div className="mt-4 rounded-xl border border-slate-300/70 bg-white/75 p-4 dark:border-white/10 dark:bg-white/[0.03]">
	            <div className="mb-4 flex items-center justify-between">
	              <div>
	                <p className="readout text-cyan-700 dark:text-cyan-300">{currentStep.subtitle}</p>
	                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{currentStep.title}</h2>
	              </div>
	              <div className="flex items-center gap-2">
	                <span className="readout text-slate-500 dark:text-slate-400">
	                  {stepIndex + 1} / {steps.length}
	                </span>
	                <button
	                  type="button"
	                  onClick={handleQuickLaunch}
	                  disabled={isLaunching}
	                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/45 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-40 dark:border-amber-400/30 dark:text-amber-200"
	                >
	                  <Rocket className="h-3.5 w-3.5" />
	                  Quick Launch
	                </button>
	              </div>
	            </div>

            {currentStep.id === "mission" && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Ship Name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    placeholder={defaultShipName}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mission Brief</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                    rows={3}
                    placeholder="Primary mission objective for this ship deployment..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node ID</span>
                  <input
                    type="text"
                    value={form.nodeId}
                    onChange={(e) => setForm((current) => ({ ...current, nodeId: e.target.value }))}
                    placeholder={defaultNodeId}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node URL (optional)</span>
                  <input
                    type="url"
                    value={form.nodeUrl}
                    onChange={(e) => setForm((current) => ({ ...current, nodeUrl: e.target.value }))}
                    placeholder="https://ship.example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Grafana URL (optional)</span>
                  <input
                    type="url"
                    value={form.monitoring.grafanaUrl}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        monitoring: {
                          ...current.monitoring,
                          grafanaUrl: e.target.value,
                        },
                      }))
                    }
                    placeholder="https://grafana.example.com/d/..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Prometheus URL (optional)</span>
                  <input
                    type="url"
                    value={form.monitoring.prometheusUrl}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        monitoring: {
                          ...current.monitoring,
                          prometheusUrl: e.target.value,
                        },
                      }))
                    }
                    placeholder="https://prometheus.example.com/graph"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">KubeView URL (optional)</span>
                  <input
                    type="url"
                    value={form.monitoring.kubeviewUrl}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        monitoring: {
                          ...current.monitoring,
                          kubeviewUrl: e.target.value,
                        },
                      }))
                    }
                    placeholder="/api/bridge/runtime-ui/kubeview"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Langfuse URL (optional)</span>
                  <input
                    type="url"
                    value={form.monitoring.langfuseUrl}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        monitoring: {
                          ...current.monitoring,
                          langfuseUrl: e.target.value,
                        },
                      }))
                    }
                    placeholder="https://langfuse.example.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  />
                </label>

                <div className="md:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Target Profile</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={CLOUD_DEPLOY_ONLY}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          deploymentProfile: "local_starship_build",
                          saneBootstrap: true,
                          nodeType: "local",
                          advancedNodeTypeOverride: false,
                          infrastructure: defaultInfrastructureConfig("local_starship_build"),
                        }))
                      }
                      className={`rounded-lg border p-3 text-left ${
                        CLOUD_DEPLOY_ONLY
                          ? "cursor-not-allowed border-slate-300/70 bg-slate-100/70 opacity-60 dark:border-white/10 dark:bg-white/[0.03]"
                          : form.deploymentProfile === "local_starship_build"
                          ? "border-violet-500/45 bg-violet-500/10"
                          : "border-slate-300/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <Server className="h-4 w-4 text-violet-500" />
                        Local Starship Build
                      </span>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {CLOUD_DEPLOY_ONLY
                          ? "Disabled in cloud deploy mode."
                          : "Local kind/minikube launch profile."}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          deploymentProfile: "cloud_shipyard",
                          nodeType: current.advancedNodeTypeOverride ? current.nodeType : "cloud",
                          infrastructure: defaultInfrastructureConfig("cloud_shipyard"),
                        }))
                      }
                      className={`rounded-lg border p-3 text-left ${
                        form.deploymentProfile === "cloud_shipyard"
                          ? "border-cyan-500/45 bg-cyan-500/10"
                          : "border-slate-300/70 bg-white/70 dark:border-white/10 dark:bg-white/[0.03]"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                        <Cloud className="h-4 w-4 text-cyan-500" />
                        Cloud Shipyard
                      </span>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Existing Kubernetes cloud target.</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentStep.id === "environment" && (
              <div className="space-y-3">
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Provisioning Mode</span>
                  <select
                    value={form.provisioningMode}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        provisioningMode: e.target.value as ProvisioningMode,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                  >
                    <option value="terraform_ansible">Terraform + Ansible</option>
                    <option value="terraform_only" disabled>Terraform only (coming soon)</option>
                    <option value="ansible_only" disabled>Ansible only (coming soon)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {provisioningModeLabels[form.provisioningMode]}
                  </p>
                </label>

                {form.deploymentProfile === "cloud_shipyard" && (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.advancedNodeTypeOverride}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          advancedNodeTypeOverride: e.target.checked,
                          nodeType: e.target.checked ? current.nodeType : "cloud",
                        }))
                      }
                    />
                    Advanced node type override (allow hybrid)
                  </label>
                )}

                {form.deploymentProfile === "cloud_shipyard" && form.advancedNodeTypeOverride && (
                  <label>
                    <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node Type Override</span>
                    <select
                      value={form.nodeType}
                      onChange={(e) => setForm((current) => ({ ...current, nodeType: e.target.value as NodeType }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    >
                      <option value="cloud">Cloud</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>
                )}

                {form.deploymentProfile === "local_starship_build" && (
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.saneBootstrap}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          saneBootstrap: e.target.checked,
                        }))
                      }
                    />
                    Sane Bootstrap (assisted checks/install guidance; no cluster auto-create)
                  </label>
                )}

                <div className="rounded-lg border border-slate-300/70 bg-slate-100/70 px-3 py-2 text-xs text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  <span className="readout text-slate-500 dark:text-slate-400">Derived node type</span>
                  <div className="mt-1">
                    {deploymentProfileLabels[form.deploymentProfile]} {"->"} {derivedNodeType.toUpperCase()}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedInfrastructure((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  <Shield className="h-3.5 w-3.5" />
                  {showAdvancedInfrastructure ? "Hide advanced infrastructure" : "Show advanced infrastructure"}
                </button>

                {showAdvancedInfrastructure && (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Infrastructure Kind</span>
                      <select
                        value={form.infrastructure.kind}
                        disabled={form.deploymentProfile === "cloud_shipyard"}
                        onChange={(e) => {
                          const selectedKind = e.target.value as InfrastructureKind
                          const nextKind =
                            form.deploymentProfile === "cloud_shipyard" ? "existing_k8s" : selectedKind
                          setForm((current) => ({
                            ...current,
                            infrastructure: {
                              ...current.infrastructure,
                              kind: nextKind,
                              kubeContext: kubeContextForKind(nextKind),
                            },
                          }))
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                      >
                        {form.deploymentProfile === "cloud_shipyard" ? (
                          <option value="existing_k8s">Existing Kubernetes</option>
                        ) : (
                          <>
                            <option value="kind">KIND</option>
                            <option value="minikube">Minikube</option>
                          </>
                        )}
                      </select>
                    </label>
                    {(
                      [
                        ["kubeContext", "Kube Context"],
                        ["namespace", "Namespace"],
                        ["terraformWorkspace", "Terraform Workspace"],
                        ["terraformEnvDir", "Terraform Env Dir"],
                        ["ansibleInventory", "Ansible Inventory"],
                        ["ansiblePlaybook", "Ansible Playbook"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
                        <input
                          type="text"
                          value={form.infrastructure[key]}
                          onChange={(e) =>
                            setForm((current) => ({
                              ...current,
                              infrastructure: {
                                ...current.infrastructure,
                                [key]: e.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {form.deploymentProfile === "cloud_shipyard" && (
                  <CloudUtilityPanel
                    value={form.cloudProvider}
                    onChange={(next) =>
                      setForm((current) => ({
                        ...current,
                        cloudProvider: next,
                      }))
                    }
                    onSelectedSshKeyFingerprintChange={setCloudSshKeyFingerprint}
                    disabled={isLaunching}
                  />
                )}
              </div>
            )}

            {currentStep.id === "secrets" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                  <p className="font-medium">Secret Vault templates are per profile and per user.</p>
                  <p className="mt-1">
                    Save once, then reuse for setup prefill and copy-ready snippets. Launch remains available even if this step is partial.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Storage Mode</p>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                      {activeSecretSummary.storageMode}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Populated Fields</p>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                      {visibleSecretPopulatedFieldCount}/{visibleSecretFields.length}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Readiness</p>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                      {missingLaunchEssentialSecretFields.length === 0
                        ? "All launch essentials present"
                        : `${missingLaunchEssentialSecretFields.length} field(s) missing`}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Saved</p>
                    <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                      {activeSecretUpdatedAt ? formatRelativeTimestamp(activeSecretUpdatedAt) : "Not saved yet"}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
                  <p>
                    Launch essentials:{" "}
                    {launchEssentialSecretFields.map((field) => SECRET_FIELD_DESCRIPTORS[field].label).join(", ")}
                  </p>
                  <p className="mt-1">
                    Optional integrations:{" "}
                    {optionalIntegrationSecretFields.map((field) => SECRET_FIELD_DESCRIPTORS[field].label).join(", ")}
                  </p>
                </div>

                {missingLaunchEssentialSecretFields.length > 0 ? (
                  <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                    Missing launch essentials:{" "}
                    {missingLaunchEssentialSecretFields
                      .map((field) => SECRET_FIELD_DESCRIPTORS[field].label)
                      .join(", ")}
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                    Launch essentials for {deploymentProfileLabels[form.deploymentProfile]} are populated.
                    Optional integrations can be set later.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {visibleSecretFields.map((field) => {
                    const descriptor = SECRET_FIELD_DESCRIPTORS[field]
                    const maskedValue = activeSecretSummary.fields[field]?.maskedValue || null
                    const hasSavedValue = activeSecretSummary.fields[field]?.hasValue === true
                    const value = activeSecretValues[field] || ""
                    const optionalField = optionalIntegrationSecretFields.includes(field)
                    return (
                      <label
                        key={field}
                        className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {descriptor.label}
                            </span>
                            {optionalField && (
                              <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:border-white/12 dark:text-slate-300">
                                Optional
                              </span>
                            )}
                          </div>
                          {(field === "better_auth_secret" || field === "postgres_password") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (field === "better_auth_secret") {
                                  updateSecretField(
                                    form.deploymentProfile,
                                    "better_auth_secret",
                                    generateBetterAuthSecret(),
                                  )
                                  return
                                }
                                updateSecretField(
                                  form.deploymentProfile,
                                  "postgres_password",
                                  generatePostgresPassword(),
                                )
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-700 dark:text-cyan-200"
                            >
                              <KeyRound className="h-3 w-3" />
                              Generate
                            </button>
                          )}
                        </div>
                        <input
                          type={descriptor.inputType}
                          autoComplete="off"
                          spellCheck={false}
                          value={value}
                          onChange={(event) =>
                            updateSecretField(form.deploymentProfile, field, event.target.value)
                          }
                          placeholder={descriptor.placeholder}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{descriptor.helper}</p>
                        {hasSavedValue && maskedValue && (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            Saved: {maskedValue}
                          </p>
                        )}
                      </label>
                    )
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={saveSecretTemplate}
                    disabled={isSavingSecrets}
                    className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                  >
                    {isSavingSecrets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                    Save Template
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchSecretTemplate(form.deploymentProfile, true)}
                    disabled={isLoadingSecrets}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                  >
                    {isLoadingSecrets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Reload Template
                  </button>
                  <button
                    type="button"
                    onClick={clearSecretTemplate}
                    disabled={isClearingSecrets}
                    className="inline-flex items-center gap-2 rounded-md border border-rose-500/45 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50 dark:border-rose-300/45 dark:text-rose-200"
                  >
                    {isClearingSecrets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Clear Template
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSecretSnippetExpanded("env")}
                        aria-expanded={secretSnippetExpanded.env}
                        className="group flex-1 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">.env snippet</p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Target: {form.infrastructure.terraformEnvDir}/.env
                            </p>
                          </div>
                          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300/70 bg-white/60 text-slate-700 transition-colors group-hover:bg-white dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:group-hover:bg-white/[0.08]">
                            {secretSnippetExpanded.env ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => copySecretSnippet("env")}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-[11px] text-slate-700 transition-colors hover:bg-white dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    {secretSnippetExpanded.env && (
                      <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-300/70 bg-slate-100/70 p-2 text-[11px] text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
                        {activeSecretSnippets.envSnippet}
                      </pre>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSecretSnippetExpanded("tfvars")}
                        aria-expanded={secretSnippetExpanded.tfvars}
                        className="group flex-1 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                              terraform.tfvars snippet
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                              Target: {form.infrastructure.terraformEnvDir}/terraform.tfvars
                            </p>
                          </div>
                          <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300/70 bg-white/60 text-slate-700 transition-colors group-hover:bg-white dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:group-hover:bg-white/[0.08]">
                            {secretSnippetExpanded.tfvars ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => copySecretSnippet("tfvars")}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-[11px] text-slate-700 transition-colors hover:bg-white dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                    </div>
                    {secretSnippetExpanded.tfvars && (
                      <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-300/70 bg-slate-100/70 p-2 text-[11px] text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
                        {activeSecretSnippets.terraformTfvarsSnippet}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentStep.id === "apps" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                  <p className="font-medium">Bootstrap apps.</p>
                  <p className="mt-1">
                    Toggle which apps Ship Yard should include in this launch. Launch remains fail-open if bootstrap apps degrade.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {BOOTSTRAP_APPS.map((app) => {
                    const enabled = form.initialApplications[app.id]
                    const Icon = app.icon
                    const statusLine =
                      app.id === "n8n"
                        ? missingRequiredN8NSecretFields.length === 0
                          ? "Ready"
                          : `${missingRequiredN8NSecretFields.length} required field(s) missing`
                        : form.deploymentProfile === "local_starship_build"
                          ? "Connect-only (local)"
                          : "Connect-only (for now)"

                    return (
                      <div
                        key={app.id}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          enabled
                            ? "border-cyan-500/35 bg-cyan-500/8"
                            : "border-slate-300/70 bg-white/70 dark:border-white/12 dark:bg-white/[0.03]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                                enabled
                                  ? "border-cyan-500/35 bg-cyan-500/10"
                                  : "border-slate-300/70 bg-white/70 dark:border-white/12 dark:bg-white/[0.04]"
                              }`}
                            >
                              <Icon
                                className={`h-4 w-4 ${
                                  enabled ? "text-cyan-700 dark:text-cyan-200" : "text-slate-500 dark:text-slate-300"
                                }`}
                              />
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{app.label}</p>
                              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                                {app.description}
                              </p>
                            </div>
                          </div>

                          <ToggleSwitch
                            enabled={enabled}
                            disabled={isLaunching}
                            label={`${app.label} toggle`}
                            onChange={(next) =>
                              setForm((current) => ({
                                ...current,
                                initialApplications: {
                                  ...current.initialApplications,
                                  [app.id]: next,
                                },
                              }))
                            }
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={`rounded-md border px-2 py-0.5 ${
                              enabled
                                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                                : "border-slate-300/70 bg-white/70 text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300"
                            }`}
                          >
                            {enabled ? "Included" : "Not included"}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">{statusLine}</span>
                          {app.id === "dokploy" && (
                            <span className="text-slate-500 dark:text-slate-400">• Requires URL + API key</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {form.initialApplications.n8n ? (
                  <>
                    <div className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                      <p className="font-medium">n8n bootstrap setup assistant.</p>
                      <p className="mt-1">
                        Use auto-fill to prepare missing n8n fields, then save the profile template. Launch remains fail-open if n8n bootstrap degrades.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">n8n Readiness</p>
                        <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                          {missingRequiredN8NSecretFields.length === 0
                            ? "Ready"
                            : `${missingRequiredN8NSecretFields.length} required field(s) missing`}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Populated Required Fields</p>
                        <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                          {n8nSecretPopulatedFieldCount}/{N8N_REQUIRED_SECRET_FIELDS.length}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Default Public URL</p>
                        <p className="mt-1 break-all text-xs font-medium text-slate-800 dark:text-slate-100">
                          {buildDefaultN8NPublicBaseUrl({
                            deploymentProfile: form.deploymentProfile,
                            nodeUrl: form.nodeUrl,
                          })}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 dark:border-white/12 dark:bg-white/[0.04]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Saved</p>
                        <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-100">
                          {activeSecretUpdatedAt ? formatRelativeTimestamp(activeSecretUpdatedAt) : "Not saved yet"}
                        </p>
                      </div>
                    </div>

                    {missingRequiredN8NSecretFields.length > 0 ? (
                      <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                        Missing required n8n fields:{" "}
                        {missingRequiredN8NSecretFields.map((field) => SECRET_FIELD_DESCRIPTORS[field].label).join(", ")}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                        n8n bootstrap fields are complete for {deploymentProfileLabels[form.deploymentProfile]}.
                      </div>
                    )}

                    <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
                      <p>
                        Required fields:{" "}
                        {N8N_REQUIRED_SECRET_FIELDS.map((field) => SECRET_FIELD_DESCRIPTORS[field].label).join(", ")}
                      </p>
                      <p className="mt-1">
                        Full ready state also requires server-side curated tool URI (`N8N_TOOL_URI`) for bridge import/grant.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {N8N_REQUIRED_SECRET_FIELDS.map((field) => {
                        const descriptor = SECRET_FIELD_DESCRIPTORS[field]
                        const maskedValue = activeSecretSummary.fields[field]?.maskedValue || null
                        const hasSavedValue = activeSecretSummary.fields[field]?.hasValue === true
                        const value = activeSecretValues[field] || ""
                        const hasDraftValue = hasNonEmptySecretValue(value)
                        const expanded = n8nFieldExpanded[field]

                        const showGenerate =
                          field === "n8n_basic_auth_password" || field === "n8n_encryption_key"

                        return (
                          <div
                            key={field}
                            className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => toggleN8nFieldExpanded(field)}
                                aria-expanded={expanded}
                                className="group flex-1 text-left"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                      {descriptor.label}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                      {hasDraftValue ? "Draft set" : "Not set"}
                                      {hasSavedValue && maskedValue ? ` • Saved: ${maskedValue}` : ""}
                                    </p>
                                  </div>
                                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300/70 bg-white/60 text-slate-700 transition-colors group-hover:bg-white dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200 dark:group-hover:bg-white/[0.08]">
                                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </span>
                                </div>
                              </button>
                              {showGenerate && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSecretField(
                                      form.deploymentProfile,
                                      field,
                                      generateRandomSecret(32),
                                    )
                                  }
                                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-700 transition-colors hover:bg-cyan-500/15 dark:text-cyan-200"
                                >
                                  <KeyRound className="h-3 w-3" />
                                  Generate
                                </button>
                              )}
                            </div>

                            {expanded && (
                              <>
                                <input
                                  type={descriptor.inputType}
                                  autoComplete="off"
                                  spellCheck={false}
                                  value={value}
                                  onChange={(event) =>
                                    updateSecretField(form.deploymentProfile, field, event.target.value)
                                  }
                                  placeholder={descriptor.placeholder}
                                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                                />
                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{descriptor.helper}</p>
                                {field === "n8n_database_url" &&
                                  form.deploymentProfile === "local_starship_build" &&
                                  !hasNonEmptySecretValue(activeSecretValues.postgres_password) && (
                                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                      Set <code>postgres_password</code> in Secrets to auto-derive this URL.
                                    </p>
                                  )}
                                {field === "n8n_database_url" &&
                                  form.deploymentProfile === "cloud_shipyard" &&
                                  !hasNonEmptySecretValue(activeSecretValues.database_url) && (
                                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                                      Set <code>database_url</code> in Secrets to auto-derive this URL.
                                    </p>
                                  )}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={autoFillN8NSetup}
                        className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:border-cyan-300/45 dark:text-cyan-200"
                      >
                        <AppWindow className="h-3.5 w-3.5" />
                        Auto-fill n8n setup
                      </button>
                      <button
                        type="button"
                        onClick={saveSecretTemplate}
                        disabled={isSavingSecrets}
                        className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                      >
                        {isSavingSecrets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                        Save Template
                      </button>
                      <button
                        type="button"
                        onClick={() => fetchSecretTemplate(form.deploymentProfile, true)}
                        disabled={isLoadingSecrets}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                      >
                        {isLoadingSecrets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Reload Template
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
                    <p className="font-medium">n8n is not included in this launch.</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      Toggle n8n on to configure bootstrap secrets and auto-fill defaults.
                    </p>
                  </div>
                )}

                {form.initialApplications.dokploy && (
                  <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                    <p className="font-medium">Dokploy is connect-only for now.</p>
                    <p className="mt-1">
                      Provisioning and Ship Yard-managed credentials will land next. Planned keys:{" "}
                      <code>DOKPLOY_BASE_URL</code>, <code>DOKPLOY_API_KEY</code>.
                    </p>
                  </div>
                )}
              </div>
            )}

            {currentStep.id === "crew" && (
              <div className="space-y-3">
                <div className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-700 dark:text-cyan-200">
                  Crew policy is fixed for Ship Yard launch: XO, OPS, ENG, SEC, MED, and COU are all required and mapped to six dedicated agent pods.
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {REQUIRED_BRIDGE_CREW_ROLES.map((role) => {
                    const template = form.crewOverrides[role]
                    return (
                      <div
                        key={role}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/8 p-2.5"
                      >
                        <p className="font-[family-name:var(--font-mono)] text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {role.toUpperCase()} • {crewRoleLabels[role]}
                        </p>
                        <div className="mt-2 grid grid-cols-1 gap-1.5">
                          <input
                            type="text"
                            value={template.name}
                            onChange={(e) => updateCrewOverride(role, { name: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            placeholder="Crew name"
                          />
                          <input
                            type="text"
                            value={template.description}
                            onChange={(e) => updateCrewOverride(role, { description: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            placeholder="Crew description"
                          />
                          <textarea
                            value={template.content}
                            onChange={(e) => updateCrewOverride(role, { content: e.target.value })}
                            rows={2}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                            placeholder="Crew runtime prompt content"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {currentStep.id === "review" && (
              <div className="space-y-3">
                <div
                  className={`rounded-lg border p-3 ${
                    reviewLaunchSummary.readiness === "ready"
                      ? "border-emerald-400/35 bg-emerald-500/10"
                      : "border-amber-400/35 bg-amber-500/10"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="readout text-slate-500 dark:text-slate-400">Launch Readiness</p>
                      <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {reviewLaunchSummary.readiness === "ready" ? "Ready to launch" : "Ready with warnings"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Warnings are advisory and do not block launch.
                      </p>
                    </div>
                    <span className="rounded-md border border-slate-300/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:border-white/15 dark:text-slate-300">
                      {new Date(reviewDeploymentOverview.generatedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded border border-slate-300/70 px-1.5 py-0.5 text-slate-700 dark:border-white/15 dark:text-slate-200">
                      Warnings {reviewLaunchSummary.requirementCounts.warning}
                    </span>
                    <span className="rounded border border-slate-300/70 px-1.5 py-0.5 text-slate-700 dark:border-white/15 dark:text-slate-200">
                      Auto-generated {reviewLaunchSummary.requirementCounts.autoGenerated}
                    </span>
                    <span className="rounded border border-slate-300/70 px-1.5 py-0.5 text-slate-700 dark:border-white/15 dark:text-slate-200">
                      Ready checks {reviewLaunchSummary.requirementCounts.ready}
                    </span>
                    <span className="rounded border border-slate-300/70 px-1.5 py-0.5 text-slate-700 dark:border-white/15 dark:text-slate-200">
                      Planned workloads {reviewLaunchSummary.workloads.plannedWorkloads}
                    </span>
                    <span className="rounded border border-slate-300/70 px-1.5 py-0.5 text-slate-700 dark:border-white/15 dark:text-slate-200">
                      Planned pods {reviewLaunchSummary.workloads.plannedPods}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="readout text-slate-500 dark:text-slate-400">Ship + Target Snapshot</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">{resolvedShipName}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {deploymentProfileLabels[form.deploymentProfile]} • {provisioningModeLabels[form.provisioningMode]}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Node {resolvedNodeId} • {derivedNodeType.toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Bridge crew roles required: {REQUIRED_BRIDGE_CREW_ROLES.length}
                  </p>
                  {form.deploymentProfile === "local_starship_build" && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Sane Bootstrap: {form.saneBootstrap ? "Enabled" : "Disabled"}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    {infrastructureKindLabel(form.infrastructure.kind)} • Context {form.infrastructure.kubeContext} •
                    Namespace {form.infrastructure.namespace}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Terraform {form.infrastructure.terraformWorkspace} ({form.infrastructure.terraformEnvDir})
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Ansible {form.infrastructure.ansibleInventory} • {form.infrastructure.ansiblePlaybook}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Grafana {form.monitoring.grafanaUrl.trim() || "not set"} • Prometheus{" "}
                    {form.monitoring.prometheusUrl.trim() || "not set"} • KubeView{" "}
                    {form.monitoring.kubeviewUrl.trim() || "not set"} • Langfuse{" "}
                    {form.monitoring.langfuseUrl.trim() || "not set"}
                  </p>
                  {form.deploymentProfile === "cloud_shipyard" && (
                    <>
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        Provider {form.cloudProvider.provider} • Stack Mode{" "}
                        {form.cloudProvider.stackMode.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Cluster {form.cloudProvider.cluster.clusterName} • {form.cloudProvider.cluster.location} •
                        {` ${form.cloudProvider.cluster.controlPlane.machineType} x${form.cloudProvider.cluster.controlPlane.count}`}{" "}
                        control-plane •
                        {` ${form.cloudProvider.cluster.workers.machineType} x${form.cloudProvider.cluster.workers.count}`}{" "}
                        workers
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        SSH key fingerprint: {cloudSshKeyFingerprint || "Not selected"}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Tunnel policy: {form.cloudProvider.tunnelPolicy.manage ? "Managed" : "Manual"}{" "}
                        Kubernetes API {"->"} 127.0.0.1:{form.cloudProvider.tunnelPolicy.localPort}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        Full-stack intent: cluster + bridge crew + runtime + observability support systems.
                      </p>
                    </>
                  )}
                </div>

                {form.initialApplications.n8n ? (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      missingRequiredN8NSecretFields.length === 0
                        ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                        : "border-amber-400/35 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                    }`}
                  >
                    <p className="font-medium">n8n bootstrap preparation</p>
                    {missingRequiredN8NSecretFields.length === 0 ? (
                      <p className="mt-1">
                        Required n8n fields are configured for this launch profile.
                      </p>
                    ) : (
                      <p className="mt-1">
                        Missing n8n fields:{" "}
                        {missingRequiredN8NSecretFields.map((field) => SECRET_FIELD_DESCRIPTORS[field].label).join(", ")}.
                      </p>
                    )}
                    <p className="mt-1">
                      Launch remains fail-open. If n8n setup degrades, ship launch still succeeds with warnings.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-300/70 bg-white/75 px-3 py-2 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.03] dark:text-slate-200">
                    <p className="font-medium">n8n bootstrap</p>
                    <p className="mt-1">n8n is not included in this launch.</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      Launch remains fail-open. Toggle n8n on in Apps if you want it included.
                    </p>
                  </div>
                )}

                {form.deploymentProfile === "cloud_shipyard" && (
                  <div className="rounded-lg border border-amber-400/35 bg-amber-500/10 p-3 dark:border-amber-300/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="readout text-amber-700 dark:text-amber-300">Refueling Control</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Cloud launch charges 30-day estimated provider cost plus a 10% convenience fee.
                        </p>
                      </div>
                      <span className="rounded-md border border-amber-500/35 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        Min refuel €5
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md border border-amber-500/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Credits Balance</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {formatEuroCents(billingQuote?.walletBalanceCents ?? billingWallet?.balanceCents ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-amber-500/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Provider Cost (30d)</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {formatEuroCents(billingQuote?.baseCostCents ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-amber-500/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Convenience Fee (10%)</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {formatEuroCents(billingQuote?.convenienceFeeCents ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-md border border-amber-500/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Launch Debit</p>
                        <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {formatEuroCents(billingQuote?.totalCents ?? 0)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 rounded-md border border-amber-500/30 bg-white/70 px-2 py-1.5 text-xs dark:bg-white/[0.03]">
                      {isBillingLoading ? (
                        <p className="text-slate-600 dark:text-slate-300">Loading refueling quote...</p>
                      ) : refuelingError ? (
                        <div className="space-y-2">
                          <p className="text-rose-700 dark:text-rose-300">{refuelingError.text}</p>
                          {refuelingError.code ? (
                            <p className="text-[11px] text-rose-700 dark:text-rose-300">
                              Code: <code>{refuelingError.code}</code>
                            </p>
                          ) : null}
                          {refuelingError.code && isWalletEnclaveCode(refuelingError.code) ? (
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium text-rose-700 dark:text-rose-200">Next steps</p>
                              <ul className="list-disc space-y-1 pl-5 text-[11px] text-rose-700 dark:text-rose-300">
                                {walletEnclaveGuidance(refuelingError.code).steps.map((step) => (
                                  <li key={step}>{step}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {refuelingError.suggestedCommands && refuelingError.suggestedCommands.length > 0 ? (
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium text-rose-700 dark:text-rose-200">
                                Suggested commands
                              </p>
                              <ul className="list-disc space-y-1 pl-5 text-[11px] text-rose-700 dark:text-rose-300">
                                {refuelingError.suggestedCommands.map((command) => (
                                  <li key={command}>
                                    <code>{command}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : billingQuote ? (
                        billingQuote.canLaunch ? (
                          <p className="text-emerald-700 dark:text-emerald-300">Refueling complete. Launch can proceed.</p>
                        ) : (
                          <p className="text-amber-700 dark:text-amber-300">
                            Refueling required. Shortfall: {formatEuroCents(billingQuote.shortfallCents)}.
                          </p>
                        )
                      ) : (
                        <p className="text-slate-600 dark:text-slate-300">Refueling quote unavailable.</p>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="text-xs text-slate-600 dark:text-slate-300">
                        Refuel Amount (EUR)
                      </label>
                      <input
                        type="number"
                        min={5}
                        step={0.01}
                        value={refuelAmountEur}
                        onChange={(event) => setRefuelAmountEur(event.target.value)}
                        className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleRefuelCredits}
                        disabled={isRefueling}
                        className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 disabled:opacity-50 dark:text-amber-300"
                      >
                        {isRefueling ? "Redirecting..." : "Refuel Credits"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshRefueling(true)}
                        disabled={isBillingLoading}
                        className="rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                      >
                        Refresh Quote
                      </button>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35">
                  <p className="readout text-cyan-700 dark:text-cyan-300">Resource Footprint</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Planned</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(reviewLaunchSummary.resources.totalPlanned.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(reviewLaunchSummary.resources.totalPlanned.memoryMiB)}
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Baseline</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(reviewLaunchSummary.resources.baseline.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(reviewLaunchSummary.resources.baseline.memoryMiB)}
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Crew Add-on</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(reviewLaunchSummary.resources.crewAddOn.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(reviewLaunchSummary.resources.crewAddOn.memoryMiB)}
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Runtime + Observability
                      </p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(reviewLaunchSummary.resources.runtimeAndObservability.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(reviewLaunchSummary.resources.runtimeAndObservability.memoryMiB)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-300/70 bg-white/75 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="readout text-slate-500 dark:text-slate-400">Needs Attention</p>
                  {reviewLaunchSummary.prioritizedWarnings.length === 0 ? (
                    <div className="mt-2 rounded-md border border-emerald-400/35 bg-emerald-500/10 px-2 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                      No blocking or advisory warnings detected for this launch profile.
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {reviewLaunchSummary.prioritizedWarnings.slice(0, 3).map((warning) => (
                        <div
                          key={warning.id}
                          className="rounded-md border border-amber-400/35 bg-amber-500/10 px-2 py-1.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-100">{warning.title}</p>
                            <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                              {requirementCategoryLabels[warning.category]}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{warning.description}</p>
                          {warning.hint && (
                            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">Next: {warning.hint}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <details className="rounded-lg border border-slate-300/70 bg-white/75 dark:border-white/10 dark:bg-white/[0.03]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    <span>Deployment Requirements (details)</span>
                    <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                      {reviewDeploymentOverview.requirements.length} checks
                    </span>
                  </summary>
                  <div className="space-y-1.5 px-3 pb-3">
                    {reviewDeploymentOverview.requirements.map((requirement) => (
                      <div
                        key={requirement.id}
                        className="rounded-md border border-slate-300/70 bg-white/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-slate-800 dark:text-slate-100">{requirement.title}</p>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${requirementStatusClasses[requirement.status]}`}
                          >
                            {requirement.status.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{requirement.description}</p>
                        {(requirement.value || requirement.secretRef) && (
                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {requirement.value ? `Value: ${requirement.value}` : `Secret Ref: ${requirement.secretRef}`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>

                <details className="rounded-lg border border-slate-300/70 bg-white/75 dark:border-white/10 dark:bg-white/[0.03]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    <span>Topology Inventory (details)</span>
                    <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                      {reviewDeploymentOverview.topology.components.length} components
                    </span>
                  </summary>
                  <div className="space-y-2 px-3 pb-3">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {reviewDeploymentOverview.topology.provisioningRealityNote}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="rounded border border-slate-300/70 px-1.5 py-0.5 dark:border-white/15">
                        Provisioned {reviewLaunchSummary.provisioningRealityCounts.currentlyProvisioned}
                      </span>
                      <span className="rounded border border-slate-300/70 px-1.5 py-0.5 dark:border-white/15">
                        Planned {reviewLaunchSummary.provisioningRealityCounts.plannedOnly}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {reviewComponentsByGroup.map((entry) => (
                        <div
                          key={entry.group}
                          className="rounded-md border border-slate-300/70 bg-white/70 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]"
                        >
                          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {entry.label} • {entry.components.length}
                          </p>
                          <div className="mt-1 space-y-1">
                            {entry.components.map((component) => (
                              <div key={component.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div>
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">{component.label}</span>
                                  {component.sublabel && (
                                    <span className="ml-1 text-slate-500 dark:text-slate-400">({component.sublabel})</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                                    {workloadKindLabels[component.workloadKind]}
                                  </span>
                                  <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                                    Replicas {component.replicaCount}
                                  </span>
                                  {!component.enabled && (
                                    <span className="rounded-md border border-slate-300/70 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-white/15 dark:text-slate-300">
                                      Disabled
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-md border px-1.5 py-0.5 text-[10px] ${provisioningRealityClasses[component.provisioningReality]}`}
                                  >
                                    {component.provisioningReality === "currently_provisioned" ? "Provisioned" : "Planned"}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>

                <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200">
                  Launch creates the ship deployment and bootstraps all six bridge crew agent pods.
                </div>
              </div>
            )}

            {currentStep.id === "review" && (
              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                Warnings are advisory. Cloud launches require sufficient refueled credits.
              </p>
            )}

	            <div ref={wizardFooterRef} className="mt-4 flex items-center justify-between">
	              <button
	                type="button"
	                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
	                disabled={stepIndex === 0}
	                className="rounded-md border border-slate-300/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
              >
                Back
              </button>

              {stepIndex < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
                  disabled={!canAdvance}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 disabled:opacity-40 dark:border-amber-400/30 dark:text-amber-300"
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleLaunch}
                  disabled={isLaunching || !canAdvance || launchBlockedByRefueling}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all hover:shadow-xl hover:shadow-amber-500/30 hover:brightness-110 disabled:opacity-40 active:scale-[0.98] dark:from-amber-500/90 dark:to-orange-500/90"
                >
                  {isLaunching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  Launch Ship
                </button>
              )}
            </div>
          </div>
            </>
        </SurfaceCard>)}

        {mainTab === "apiKeys" && (
          <ShipyardApiKeysPanel />
        )}

        {mainTab === "fleet" && (<SurfaceCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Ship Roster</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {selectedShip && (
                <span className="readout text-slate-500 dark:text-slate-400">
                  Active selection: {selectedShip.name}
                </span>
              )}
              {ships.length > 0 && (
                <span className="rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
                  Showing {filteredShips.length} of {ships.length}
                </span>
              )}
            </div>
          </div>

          {ships.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="search"
                  value={fleetSearchQuery}
                  onChange={(event) => setFleetSearchQuery(event.target.value)}
                  placeholder="Search ship, node, profile, context, namespace"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                  <Filter className="h-3.5 w-3.5" />
                  Status
                </span>
                <select
                  value={fleetStatusFilter}
                  onChange={(event) => setFleetStatusFilter(event.target.value as ShipStatusFilter)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                >
                  {fleetStatusFilterOptions.map((option) => (
                    <option key={option} value={option}>
                      {fleetStatusFilterLabels[option]}
                    </option>
                  ))}
                </select>
                {hasRosterFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setFleetSearchQuery("")
                      setFleetStatusFilter("all")
                    }}
                    className="rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1.5 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {isLoadingShips ? (
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ship deployments...
            </div>
          ) : ships.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No ships launched yet"
                description="Run the Ship Yard wizard to create your first ship deployment and bridge crew."
              />
            </div>
          ) : filteredShips.length === 0 ? (
            <div className="mt-3 rounded-lg border border-slate-300/70 bg-white/70 px-3 py-3 text-sm text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
              No ships match the current filter set.
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredShips.map((ship) => {
                const healthState = normalizeHealthStatus(ship.healthStatus)
                const shipCurrentVersion = resolveShipVersion(ship.shipVersion)
                const shipNeedsUpgrade = shipVersionNeedsUpgrade(ship.shipVersion)
                return (
                  <button
                    key={ship.id}
                    type="button"
                    onClick={() => { setSelectedShipDeploymentId(ship.id); setMainTab("ops") }}
                    className={`rounded-xl border p-3 text-left transition ${
                      ship.id === selectedShipDeploymentId
                        ? "border-cyan-500/45 bg-cyan-500/10"
                        : "border-slate-300/70 bg-white/70 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ship.name}</p>
                      <div className="flex items-center gap-1.5">
                        {ship.id === selectedShipDeploymentId && (
                          <span className="rounded-md border border-cyan-400/35 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-700 dark:text-cyan-200">
                            Selected
                          </span>
                        )}
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClasses[ship.status]}`}>
                          {ship.status}
                        </span>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${healthClasses[healthState]}`}>
                          {healthState}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            shipNeedsUpgrade
                              ? "border-amber-400/45 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                              : "border-slate-300/70 bg-white/70 text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300"
                          }`}
                        >
                          {shipNeedsUpgrade ? `Upgrade ${shipCurrentVersion} -> ${SHIP_LATEST_VERSION}` : `Version ${shipCurrentVersion}`}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {ship.nodeType.toUpperCase()} • {deploymentProfileLabels[ship.deploymentProfile]}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Node: {ship.nodeId}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {infrastructureKindLabel(ship.infrastructure.kind)} • Context {ship.infrastructure.kubeContext} • Namespace{" "}
                      {ship.infrastructure.namespace}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {provisioningModeLabels[ship.provisioningMode]}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Release {shipCurrentVersion}
                      {shipNeedsUpgrade ? ` • Upgrade available (${SHIP_LATEST_VERSION})` : " • Latest"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Updated {formatRelativeTimestamp(ship.updatedAt)} ({new Date(ship.updatedAt).toLocaleString()})
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Deployed {ship.deployedAt ? formatRelativeTimestamp(ship.deployedAt) : "not yet"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Last health check {ship.lastHealthCheck ? formatRelativeTimestamp(ship.lastHealthCheck) : "unknown"}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </SurfaceCard>)}

        {mainTab === "ops" && selectedShipDeploymentId && (
          <SurfaceCard>
            {selectedShip && (
              <div className="mb-4 rounded-xl border border-slate-300/70 bg-gradient-to-r from-white/80 via-cyan-50/50 to-white/80 p-3 dark:border-white/12 dark:from-white/[0.03] dark:via-cyan-500/10 dark:to-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="readout text-slate-500 dark:text-slate-400">Command Snapshot</p>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedShip.name}
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Node {selectedShip.nodeId} • {selectedShip.nodeType.toUpperCase()} •{" "}
                      {deploymentProfileLabels[selectedShip.deploymentProfile]}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {infrastructureKindLabel(selectedShip.infrastructure.kind)} • Context{" "}
                      {selectedShip.infrastructure.kubeContext} • Namespace {selectedShip.infrastructure.namespace}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusClasses[selectedShip.status]}`}>
                      {selectedShip.status}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        healthClasses[normalizeHealthStatus(selectedShip.healthStatus)]
                      }`}
                    >
                      {normalizeHealthStatus(selectedShip.healthStatus)}
                    </span>
                    <span className="rounded-md border border-slate-300/70 bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300">
                      Version {selectedShipCurrentVersion}
                    </span>
                    {selectedShipNeedsUpgrade && (
                      <span className="rounded-md border border-amber-400/45 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-200">
                        Upgrade available
                      </span>
                    )}
                    {process.env.NODE_ENV !== "production" && (
                      <button
                        type="button"
                        title="Debug: delete ship record and immediately relaunch a fresh deployment (does not destroy cluster resources)."
                        onClick={() => void handleScrapAndRelaunch()}
                        disabled={isScrapRelaunching || isLaunching || isUpgradingShip}
                        className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/45 bg-rose-500/12 px-2.5 py-1 text-xs font-medium text-rose-700 disabled:opacity-50 dark:border-rose-300/45 dark:text-rose-200"
                      >
                        {isScrapRelaunching ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Scrap &amp; Relaunch
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <div className="rounded-md border border-slate-300/70 bg-white/75 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Provisioning</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                      {provisioningModeLabels[selectedShip.provisioningMode]}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-white/75 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Release</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                      {selectedShipCurrentVersion}
                      {selectedShipNeedsUpgrade ? ` -> ${SHIP_LATEST_VERSION}` : " (latest)"}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Updated {selectedShip.shipVersionUpdatedAt ? formatRelativeTimestamp(selectedShip.shipVersionUpdatedAt) : "unknown"}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-white/75 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Bridge Crew</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                      Active {selectedCrewSummary.active}/{selectedCrewSummary.total}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Inactive {selectedCrewSummary.inactive}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-white/75 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Bridge Links</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                      {isLoadingConnectionSummary
                        ? "Syncing status..."
                        : connectionSummary
                          ? `Enabled ${connectionSummary.enabled}/${connectionSummary.total}`
                          : "No connection data"}
                    </p>
                    {connectionSummary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Auto relay {connectionSummary.autoRelay}
                      </p>
                    )}
                  </div>
                  <div className="rounded-md border border-slate-300/70 bg-white/75 px-2 py-1.5 dark:border-white/12 dark:bg-white/[0.04]">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Update</p>
                    <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                      {formatRelativeTimestamp(selectedShip.updatedAt)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(selectedShip.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedShip && (
              <div className="mb-4 rounded-xl border border-indigo-400/35 bg-indigo-500/8 p-3 dark:border-indigo-300/35">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
                      Ship Release Upgrade
                    </p>
                    <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                      Current {selectedShipCurrentVersion} {selectedShipNeedsUpgrade ? `-> Latest ${SHIP_LATEST_VERSION}` : "(latest)"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {selectedShip.shipVersionUpdatedAt
                        ? `Last version change ${new Date(selectedShip.shipVersionUpdatedAt).toLocaleString()}`
                        : "No recorded version change timestamp yet."}
                    </p>
                    {SHIP_UPGRADE_BLOCKED_STATUSES.has(selectedShip.status) && selectedShipNeedsUpgrade && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                        Upgrade is blocked while status is {selectedShip.status}.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleUpgradeShip}
                    disabled={selectedShipUpgradeDisabled}
                    className="inline-flex items-center gap-2 rounded-md border border-indigo-500/45 bg-indigo-500/12 px-3 py-1.5 text-xs font-medium text-indigo-700 disabled:opacity-50 dark:border-indigo-300/45 dark:text-indigo-200"
                  >
                    {isUpgradingShip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {selectedShipNeedsUpgrade ? "Upgrade to latest" : "Already latest"}
                  </button>
                </div>
              </div>
            )}

            {selectedShip && (
              <div className="mb-4 rounded-xl border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Base Compute & Memory Estimate
                  </h2>
                  <span className="readout text-slate-500 dark:text-slate-400">
                    {deploymentProfileLabels[selectedShip.deploymentProfile]}
                  </span>
                </div>
                {selectedShipBaseRequirementsEstimate ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(selectedShipBaseRequirementsEstimate.totals.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(selectedShipBaseRequirementsEstimate.totals.memoryMiB)}
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Baseline</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(selectedShipBaseRequirementsEstimate.baseline.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(selectedShipBaseRequirementsEstimate.baseline.memoryMiB)}
                      </p>
                    </div>
                    <div className="rounded-md border border-cyan-400/30 bg-white/70 px-2 py-1.5 dark:bg-white/[0.03]">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Crew Add-on</p>
                      <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                        CPU {formatCpuMillicores(selectedShipBaseRequirementsEstimate.crew.totals.cpuMillicores)}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-200">
                        Memory {formatMemoryMiB(selectedShipBaseRequirementsEstimate.crew.totals.memoryMiB)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Base requirements estimate unavailable for this ship.
                  </p>
                )}
              </div>
            )}

            {selectedShipDeploymentOverview && (
              <div className="mb-4">
                <DeploymentOverviewPanel
                  title="Deployment Overview (Persisted)"
                  subtitle="Topology component coverage, requirement posture, and provisioning-reality markers."
                  overview={selectedShipDeploymentOverview}
                  derived={selectedShipOverviewIsDerived}
                />
              </div>
            )}

            {selectedShip && (
              <div className="mb-4 rounded-xl border border-cyan-400/35 bg-cyan-500/8 p-3 dark:border-cyan-300/35">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Monitoring URLs
                    </h2>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Per-ship Grafana, Prometheus, KubeView, and Langfuse links used by Bridge quick actions and telemetry.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveSelectedShipMonitoring()}
                    disabled={isSavingMonitoring}
                    className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-3 py-1.5 text-xs font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                  >
                    {isSavingMonitoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Save Monitoring
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Grafana URL</span>
                    <input
                      type="url"
                      value={monitoringDraft.grafanaUrl}
                      onChange={(event) =>
                        setMonitoringDraft((current) => ({
                          ...current,
                          grafanaUrl: event.target.value,
                        }))
                      }
                      placeholder="https://grafana.example.com/d/..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Prometheus URL</span>
                    <input
                      type="url"
                      value={monitoringDraft.prometheusUrl}
                      onChange={(event) =>
                        setMonitoringDraft((current) => ({
                          ...current,
                          prometheusUrl: event.target.value,
                        }))
                      }
                      placeholder="https://prometheus.example.com/graph"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">KubeView URL</span>
                    <input
                      type="url"
                      value={monitoringDraft.kubeviewUrl}
                      onChange={(event) =>
                        setMonitoringDraft((current) => ({
                          ...current,
                          kubeviewUrl: event.target.value,
                        }))
                      }
                      placeholder="/api/bridge/runtime-ui/kubeview"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Langfuse URL</span>
                    <input
                      type="url"
                      value={monitoringDraft.langfuseUrl}
                      onChange={(event) =>
                        setMonitoringDraft((current) => ({
                          ...current,
                          langfuseUrl: event.target.value,
                        }))
                      }
                      placeholder="https://langfuse.example.com"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                    />
                  </label>
                </div>
              </div>
            )}

            <div className="mb-4 rounded-xl border border-slate-300/70 bg-white/75 p-3 dark:border-white/12 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Bridge Connections
                </h2>
                <Link
                  href={`/bridge-connections?shipDeploymentId=${selectedShipDeploymentId}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-700 dark:text-cyan-200"
                >
                  Open Connections
                </Link>
              </div>

              {isLoadingConnectionSummary ? (
                <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading connection status...
                </div>
              ) : connectionSummary ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    Total {connectionSummary.total}
                  </span>
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    Enabled {connectionSummary.enabled}
                  </span>
                  <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                    Auto Relay {connectionSummary.autoRelay}
                  </span>
                  {connectionSummary.lastDeliveryStatus && (
                    <span className="rounded-md border border-slate-300/70 px-2 py-1 dark:border-white/15">
                      Last {connectionSummary.lastDeliveryStatus}
                    </span>
                  )}
                  {connectionSummary.lastDeliveryAt && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {new Date(connectionSummary.lastDeliveryAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  No connection data available for this ship yet.
                </p>
              )}
            </div>

            <div className="mb-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Self-Healing Control Plane
                    </p>
                    <span className="rounded-md border border-amber-400/45 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">
                      BETA
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                    Self-healing APIs are in beta. Contracts and automated behaviors may evolve before GA.
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Endpoints: <code>/api/ship-yard/self-heal/preferences</code>, <code>/api/ship-yard/self-heal/run</code>, <code>/api/ship-yard/self-heal/runs</code>, <code>/api/ship-yard/self-heal/cron</code>.
                  </p>
                </div>
              </div>
            </div>

            <ShipToolsPanel
              shipDeploymentId={selectedShipDeploymentId}
              shipName={selectedShip?.name || undefined}
              className="mb-4"
              onShipNotFound={handlePanelShipNotFound}
            />

            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Bridge Crew Editor</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchConnectionSummary}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sync Connections
                </button>
                <button
                  type="button"
                  onClick={fetchBridgeCrew}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-white/70 px-2.5 py-1 text-xs text-slate-700 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-200"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Sync Crew
                </button>
              </div>
            </div>

            {isLoadingCrew ? (
              <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading bridge crew...
              </div>
            ) : bridgeCrew.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  title="No bridge crew found"
                  description="This ship has no active bridge crew records."
                />
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {bridgeCrew.map((member) => {
                  const draft = crewDrafts[member.id]
                  if (!draft) return null
                  return (
                    <div key={member.id} className="rounded-lg border border-slate-300/70 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-center justify-between">
                        <p className="font-[family-name:var(--font-mono)] text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {member.callsign} • {crewRoleLabels[member.role]}
                        </p>
                        <select
                          value={draft.status}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: {
                                ...current[member.id],
                                status: e.target.value as "active" | "inactive",
                              },
                            }))
                          }
                          className="rounded-md border border-slate-300/70 bg-white px-2 py-1 text-[11px] text-slate-900 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-100"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>

                      <div className="mt-1.5 grid grid-cols-1 gap-1.5">
                        <input
                          type="text"
                          value={draft.name}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], name: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                        <input
                          type="text"
                          value={draft.description}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], description: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                        <textarea
                          value={draft.content}
                          onChange={(e) =>
                            setCrewDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], content: e.target.value },
                            }))
                          }
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                        />
                      </div>

                      <div className="mt-1.5 flex justify-end">
                        <button
                          type="button"
                          onClick={() => saveCrewDraft(member.id)}
                          disabled={savingCrewId === member.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/45 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-medium text-cyan-700 disabled:opacity-50 dark:border-cyan-300/45 dark:text-cyan-200"
                        >
                          {savingCrewId === member.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Save Crew Profile
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SurfaceCard>
        )}

        {mainTab === "ops" && selectedShipDeploymentId && (<SurfaceCard className="border-slate-300/70 bg-white/80 dark:border-white/12 dark:bg-white/[0.03]">
          <div className="rounded-xl border border-rose-400/35 bg-rose-500/8 p-3 dark:border-rose-300/35">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    Ownership Transfer Utility
                  </p>
                  <span className="rounded-md border border-rose-400/45 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-200">
                    Ship + Apps
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800 dark:text-slate-100">
                  Transfer a ship and linked applications into another user&apos;s fleet.
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Owners can transfer their own ships. Admins can transfer any ship by deployment ID.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-300/70 bg-white/70 px-2 py-1 text-[11px] text-slate-600 dark:border-white/12 dark:bg-white/[0.04] dark:text-slate-300">
                <Shield className="h-3.5 w-3.5" />
                {selectedShip
                  ? `Selected: ${selectedShip.name}`
                  : "No ship selected (manual ID transfer available)"}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Ship Deployment ID
                </span>
                <input
                  type="text"
                  value={transferShipDeploymentId}
                  onChange={(event) => setTransferShipDeploymentId(event.target.value)}
                  placeholder="cmlgpdu7w0000r2zt2r81rbar"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Target Owner Email
                </span>
                <input
                  type="email"
                  value={transferTargetOwnerEmail}
                  onChange={(event) => setTransferTargetOwnerEmail(event.target.value)}
                  placeholder="captain@fleet.example"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-white/15 dark:bg-white/[0.05] dark:text-slate-100"
                />
              </label>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Quartermaster provisioning runs after transfer and reports warnings if reprovision fails.
              </p>
              <button
                type="button"
                onClick={handleOwnershipTransfer}
                disabled={
                  isTransferringOwnership ||
                  transferTargetOwnerEmail.trim().length === 0 ||
                  resolvedTransferShipDeploymentId.length === 0
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/45 bg-rose-500/12 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-50 dark:border-rose-300/45 dark:text-rose-200"
              >
                {isTransferringOwnership ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Users className="h-3.5 w-3.5" />
                )}
                Transfer Ownership
              </button>
            </div>
          </div>
        </SurfaceCard>)}
      </div>
    </div>
  </div>
  )
}
