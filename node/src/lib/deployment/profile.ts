export type NodeType = "local" | "cloud" | "hybrid"

export type DeploymentProfile = "local_starship_build" | "cloud_shipyard"
export type ProvisioningMode = "terraform_ansible" | "terraform_only" | "ansible_only"

export interface InfrastructureConfig {
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
      kubeContext: "existing-cluster",
      namespace: "orchwiz-shipyard",
      terraformWorkspace: "shipyard-cloud",
      terraformEnvDir: "infra/terraform/environments/shipyard-cloud",
      ansibleInventory: "infra/ansible/inventory/cloud.ini",
      ansiblePlaybook: "infra/ansible/playbooks/shipyard_cloud.yml",
    }
  }

  return {
    kubeContext: "minikube",
    namespace: "orchwiz-starship",
    terraformWorkspace: "starship-local",
    terraformEnvDir: "infra/terraform/environments/starship-local",
    ansibleInventory: "infra/ansible/inventory/local.ini",
    ansiblePlaybook: "infra/ansible/playbooks/starship_local.yml",
  }
}

function normalizeInfrastructureConfig(
  profile: DeploymentProfile,
  incomingConfig: Record<string, unknown>,
): InfrastructureConfig {
  const defaults = defaultInfrastructureConfig(profile)

  return {
    kubeContext: asString(incomingConfig.kubeContext) || defaults.kubeContext,
    namespace: asString(incomingConfig.namespace) || defaults.namespace,
    terraformWorkspace: asString(incomingConfig.terraformWorkspace) || defaults.terraformWorkspace,
    terraformEnvDir: asString(incomingConfig.terraformEnvDir) || defaults.terraformEnvDir,
    ansibleInventory: asString(incomingConfig.ansibleInventory) || defaults.ansibleInventory,
    ansiblePlaybook: asString(incomingConfig.ansiblePlaybook) || defaults.ansiblePlaybook,
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

  const config = asRecord(input.config)
  const infrastructure = normalizeInfrastructureConfig(
    deploymentProfile,
    asRecord(config.infrastructure),
  )

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
