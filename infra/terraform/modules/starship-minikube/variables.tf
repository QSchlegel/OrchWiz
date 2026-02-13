variable "namespace" {
  type        = string
  description = "Kubernetes namespace for the local starship deployment"
  default     = "orchwiz-starship"
}

variable "app_name" {
  type        = string
  description = "Application name used for Kubernetes resources"
  default     = "orchwiz"
}

variable "app_image" {
  type        = string
  description = "Container image for the OrchWiz application"
}

variable "app_port" {
  type        = number
  description = "Container and service port"
  default     = 3000
}

variable "service_type" {
  type        = string
  description = "Service type for local access"
  default     = "NodePort"
}

variable "postgres_chart_version" {
  type        = string
  description = "Bitnami PostgreSQL chart version"
  default     = "18.2.6"
}

variable "postgres_user" {
  type        = string
  description = "PostgreSQL username"
  default     = "orchwiz"
}

variable "postgres_password" {
  type        = string
  description = "PostgreSQL password"
  sensitive   = true
  default     = "orchwiz_dev"
}

variable "postgres_db" {
  type        = string
  description = "PostgreSQL database name"
  default     = "orchis"
}

variable "better_auth_secret" {
  type        = string
  description = "BETTER_AUTH_SECRET value"
  sensitive   = true
  default     = "replace-with-32-char-secret"
}

variable "better_auth_url" {
  type        = string
  description = "BETTER_AUTH_URL value"
  default     = "http://localhost:3000"
}

variable "next_public_app_url" {
  type        = string
  description = "NEXT_PUBLIC_APP_URL value"
  default     = "http://localhost:3000"
}

variable "github_client_id" {
  type        = string
  description = "Optional GitHub OAuth client id"
  default     = ""
}

variable "github_client_secret" {
  type        = string
  description = "Optional GitHub OAuth client secret"
  sensitive   = true
  default     = ""
}

variable "app_env" {
  type        = map(string)
  description = "Additional environment variables to inject into the app secret"
  default     = {}
}

variable "openclaw_image" {
  type        = string
  description = "Container image for OpenClaw gateway/control UI instances"
  default     = "ghcr.io/openclaw/openclaw:latest"
}

variable "openclaw_gateway_token" {
  type        = string
  description = "Token seed used to derive per-station OpenClaw gateway tokens when openclaw_gateway_tokens is empty."
  sensitive   = true
  default     = "orchwiz-openclaw-dev-token"
}

variable "openclaw_gateway_tokens" {
  type        = map(string)
  description = "Optional explicit per-station OpenClaw gateway tokens (keys: xo, ops, eng, sec, med, cou). When empty, tokens are derived from openclaw_gateway_token."
  sensitive   = true
  default     = {}
}

variable "enable_kubeview" {
  type        = bool
  description = "Whether to deploy kubeview for cluster visualization"
  default     = true
}

variable "kubeview_chart_version" {
  type        = string
  description = "Bundled kubeview chart version from infra/vendor/kubeview/deploy/helm"
  default     = "2.0.6"
}

variable "kubeview_single_namespace" {
  type        = bool
  description = "Whether kubeview should limit visibility to one namespace"
  default     = false
}

variable "kubeview_ingress_enabled" {
  type        = bool
  description = "Whether to expose kubeview via ingress"
  default     = false
}

variable "kubeview_ingress_host" {
  type        = string
  description = "Ingress host for kubeview; defaults to kubeview.<namespace>.localhost when empty"
  default     = ""
}

variable "kubeview_ingress_path" {
  type        = string
  description = "Ingress path prefix for kubeview"
  default     = "/kubeview"
}

variable "kubeview_ingress_class_name" {
  type        = string
  description = "Ingress class for kubeview ingress"
  default     = "nginx"
}

variable "kubeview_ingress_annotations" {
  type        = map(string)
  description = "Additional ingress annotations for kubeview"
  default     = {}
}

variable "provider_proxy_image" {
  type        = string
  description = "Container image for the provider-proxy service"
  default     = "ghcr.io/qschlegel/orchwiz-provider-proxy:latest"
}

variable "provider_proxy_port" {
  type        = number
  description = "Container/service port for the provider-proxy service"
  default     = 4000
}

variable "provider_proxy_api_key" {
  type        = string
  description = "Shared bearer token for provider-proxy requests"
  sensitive   = true
  default     = "orchwiz-provider-proxy-dev-key"
}

variable "provider_proxy_storage_size" {
  type        = string
  description = "PVC storage size for CODEX_HOME persistence"
  default     = "1Gi"
}

variable "provider_proxy_default_model" {
  type        = string
  description = "Default model string used by OpenClaw when routed through provider-proxy"
  default     = "gpt-5"
}
