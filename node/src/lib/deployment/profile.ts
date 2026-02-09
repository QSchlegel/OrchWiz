export type NodeType = "local" | "cloud" | "hybrid"

export type DeploymentType = "agent" | "ship"
export type DeploymentProfile = "local_starship_build" | "cloud_shipyard"
export type ProvisioningMode = "terraform_ansible" | "terraform_only" | "ansible_only"
export type InfrastructureKind = "kind" | "minikube" | "existing_k8s"

export interface InfrastructureConfig {
  kind: InfrastructureKind
  kubeContext: string
  namespace: string
  terraformWorkspace: string
  terraformEnvDir: string
  ansibleInventory: string
  ansiblePlaybook: string
}

interface NormalizeProfileInput {
  deploymentProfile?: unknown
  provisioningMode?: unknown
  nodeType?: unknown
  advancedNodeTypeOverride?: unknown
  config?: unknown
}

const DEPLOYMENT_PROFILES: DeploymentProfile[] = ["local_starship_build", "cloud_shipyard"]
const PROVISIONING_MODES: ProvisioningMode[] = ["terraform_ansible", "terraform_only", "ansible_only"]
const INFRASTRUCTURE_KINDS: InfrastructureKind[] = ["kind", "minikube", "existing_k8s"]
const DEPLOYMENT_TYPES: DeploymentType[] = ["agent", "ship"]

export const DEFAULT_DEPLOYMENT_TYPE: DeploymentType = "agent"
export const DEFAULT_DEPLOYMENT_PROFILE: DeploymentProfile = "local_starship_build"
export const DEFAULT_PROVISIONING_MODE: ProvisioningMode = "terraform_ansible"

export const DEPLOYMENT_PROFILE_LABELS: Record<DeploymentProfile, string> = {
  local_starship_build: "Local Starship Build",
  cloud_shipyard: "Cloud Shipyard",
}

export const PROVISIONING_MODE_LABELS: Record<ProvisioningMode, string> = {
  terraform_ansible: "Terraform + Ansible",
  terraform_only: "Terraform only",
  ansible_only: "Ansible only",
}

export const INFRASTRUCTURE_KIND_LABELS: Record<InfrastructureKind, string> = {
  kind: "KIND",
  minikube: "Minikube",
  existing_k8s: "Existing Kubernetes",
}

export function parseDeploymentType(value: unknown): DeploymentType {
  if (typeof value === "string" && DEPLOYMENT_TYPES.includes(value as DeploymentType)) {
    return value as DeploymentType
  }
  return DEFAULT_DEPLOYMENT_TYPE
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function parseDeploymentProfile(value: unknown): DeploymentProfile {
  if (typeof value === "string" && DEPLOYMENT_PROFILES.includes(value as DeploymentProfile)) {
    return value as DeploymentProfile
  }
  return DEFAULT_DEPLOYMENT_PROFILE
}

export function parseProvisioningMode(value: unknown): ProvisioningMode {
  if (typeof value === "string" && PROVISIONING_MODES.includes(value as ProvisioningMode)) {
    return value as ProvisioningMode
  }
  return DEFAULT_PROVISIONING_MODE
}

export function defaultInfrastructureConfig(profile: DeploymentProfile): InfrastructureConfig {
  if (profile === "cloud_shipyard") {
    return {
      kind: "existing_k8s",
      kubeContext: "existing-cluster",
      namespace: "orchwiz-shipyard",
      terraformWorkspace: "shipyard-cloud",
      terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
      ansibleInventory: "infra/ansible/inventory/cloud.ini",
      ansiblePlaybook: "infra/ansible/playbooks/shipyard_cloud.yml",
    }
  }

  return {
    kind: "kind",
    kubeContext: "kind-orchwiz",
    namespace: "orchwiz-starship",
    terraformWorkspace: "starship-local",
    terraformEnvDir: "infra/terraform/environments/starship-local",
    ansibleInventory: "infra/ansible/inventory/local.ini",
    ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
  }
}

function parseInfrastructureKind(value: unknown): InfrastructureKind | undefined {
  if (typeof value === "string" && INFRASTRUCTURE_KINDS.includes(value as InfrastructureKind)) {
    return value as InfrastructureKind
  }
  return undefined
}

function inferInfrastructureKind(
  profile: DeploymentProfile,
  incomingKind: InfrastructureKind | undefined,
  kubeContext: string | undefined,
): InfrastructureKind {
  if (profile === "cloud_shipyard") {
    return "existing_k8s"
  }

  if (incomingKind === "kind" || incomingKind === "minikube") {
    return incomingKind
  }

  if (kubeContext?.toLowerCase().includes("minikube")) {
    return "minikube"
  }

  return "kind"
}

function normalizeInfrastructureConfig(
  profile: DeploymentProfile,
  incomingConfig: Record<string, unknown>,
): InfrastructureConfig {
  const defaults = defaultInfrastructureConfig(profile)
  const incomingKubeContext = asString(incomingConfig.kubeContext)
  const kind = inferInfrastructureKind(
    profile,
    parseInfrastructureKind(incomingConfig.kind),
    incomingKubeContext,
  )
  const kubeContextDefault =
    kind === "minikube" ? "minikube" : kind === "kind" ? "kind-orchwiz" : defaults.kubeContext

  return {
    kind,
    kubeContext: incomingKubeContext || kubeContextDefault,
    namespace: asString(incomingConfig.namespace) || defaults.namespace,
    terraformWorkspace: asString(incomingConfig.terraformWorkspace) || defaults.terraformWorkspace,
    terraformEnvDir: asString(incomingConfig.terraformEnvDir) || defaults.terraformEnvDir,
    ansibleInventory: asString(incomingConfig.ansibleInventory) || defaults.ansibleInventory,
    ansiblePlaybook: asString(incomingConfig.ansiblePlaybook) || defaults.ansiblePlaybook,
  }
}

export function normalizeInfrastructureInConfig(
  profile: DeploymentProfile,
  rawConfig: unknown,
): { infrastructure: InfrastructureConfig; config: Record<string, unknown> } {
  const config = asRecord(rawConfig)
  const infrastructure = normalizeInfrastructureConfig(profile, asRecord(config.infrastructure))

  return {
    infrastructure,
    config: {
      ...config,
      infrastructure,
    },
  }
}

function parseNodeType(value: unknown): NodeType | undefined {
  if (value === "local" || value === "cloud" || value === "hybrid") {
    return value
  }
  return undefined
}

export function deriveNodeTypeFromProfile(
  profile: DeploymentProfile,
  requestedNodeType?: NodeType,
  allowHybridOverride = false,
): NodeType {
  if (profile === "local_starship_build") {
    return "local"
  }

  if (allowHybridOverride && requestedNodeType === "hybrid") {
    return "hybrid"
  }

  return "cloud"
}

export function normalizeDeploymentProfileInput(input: NormalizeProfileInput) {
  const deploymentProfile = parseDeploymentProfile(input.deploymentProfile)
  const provisioningMode = parseProvisioningMode(input.provisioningMode)
  const requestedNodeType = parseNodeType(input.nodeType)
  const allowHybridOverride = input.advancedNodeTypeOverride === true

  const nodeType = deriveNodeTypeFromProfile(
    deploymentProfile,
    requestedNodeType,
    allowHybridOverride,
  )

  const { config, infrastructure } = normalizeInfrastructureInConfig(deploymentProfile, input.config)

  return {
    deploymentProfile,
    provisioningMode,
    nodeType,
    infrastructure,
    config: {
      ...config,
      infrastructure,
    } as Record<string, unknown>,
  }
}
