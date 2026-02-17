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

variable "runtime_jwt_secret" {
  type        = string
  description = "ORCHWIZ_RUNTIME_JWT_SECRET value (defaults to better_auth_secret when empty)"
  sensitive   = true
  default     = ""
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

variable "enable_security_audit_cron" {
  type        = bool
  description = "Whether to run automated security audits via a Kubernetes CronJob"
  default     = false
}

variable "security_audit_cron_schedule" {
  type        = string
  description = "Cron schedule for automated security audits"
  default     = "0 * * * *"
}

variable "security_audit_cron_token" {
  type        = string
  description = "Bearer token required for /api/security/audits/nightly requests"
  sensitive   = true
  default     = ""
}

variable "vault_pvc_enabled" {
  type        = bool
  description = "Whether to mount a PVC at /app/OWZ-Vault/00-Inbox for audit trail persistence"
  default     = false
}

variable "vault_pvc_size" {
  type        = string
  description = "PVC storage size for Vault inbox persistence"
  default     = "1Gi"
}

variable "runtime_edge_port" {
  type        = number
  description = "Port for the ship-side runtime-edge service"
  default     = 3100
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

variable "enable_spacebot" {
  type        = bool
  description = "Whether to deploy Spacebot runtime connector service"
  default     = false
}

variable "spacebot_image" {
  type        = string
  description = "Container image for Spacebot runtime connector service"
  default     = "ghcr.io/qschlegel/orchwiz-spacebot:latest"
}

variable "spacebot_api_port" {
  type        = number
  description = "Spacebot API/UI service port"
  default     = 19898
}

variable "spacebot_webhook_port" {
  type        = number
  description = "Spacebot webhook adapter service port"
  default     = 18789
}

variable "spacebot_storage_size" {
  type        = string
  description = "PVC storage size for Spacebot data"
  default     = "2Gi"
}

variable "spacebot_env" {
  type        = map(string)
  description = "Additional environment variables for Spacebot deployment"
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

# -----------------------------------------------------------------------------
# Monitoring namespace and observability (Grafana, Prometheus, Loki, ClickHouse, Langfuse)
# -----------------------------------------------------------------------------
variable "monitoring_namespace" {
  type        = string
  description = "Kubernetes namespace for monitoring stack"
  default     = "monitoring"
}

variable "enable_grafana" {
  type        = bool
  description = "Whether to deploy Grafana in the monitoring namespace"
  default     = false
}

variable "grafana_chart_version" {
  type        = string
  description = "Grafana Helm chart version"
  default     = "7.3.0"
}

variable "grafana_ingress_enabled" {
  type        = bool
  description = "Whether to expose Grafana via ingress"
  default     = false
}

variable "grafana_ingress_host" {
  type        = string
  description = "Ingress host for Grafana; when empty the module uses grafana.<namespace>.localhost"
  default     = ""
}

variable "enable_prometheus" {
  type        = bool
  description = "Whether to deploy Prometheus in the monitoring namespace"
  default     = false
}

variable "prometheus_chart_version" {
  type        = string
  description = "Prometheus Helm chart version"
  default     = "31.0.0"
}

variable "prometheus_ingress_enabled" {
  type        = bool
  description = "Whether to expose Prometheus via ingress"
  default     = false
}

variable "prometheus_ingress_host" {
  type        = string
  description = "Ingress host for Prometheus; when empty the module uses prometheus.<namespace>.localhost"
  default     = ""
}

variable "enable_loki" {
  type        = bool
  description = "Whether to deploy Loki in the monitoring namespace"
  default     = false
}

variable "loki_chart_version" {
  type        = string
  description = "Loki Helm chart version"
  default     = "6.6.0"
}

variable "loki_persistence_enabled" {
  type        = bool
  description = "Whether to enable persistent storage for Loki"
  default     = true
}

variable "loki_storage_size" {
  type        = string
  description = "PVC storage size for Loki"
  default     = "10Gi"
}

variable "enable_clickhouse" {
  type        = bool
  description = "Whether to deploy ClickHouse in the monitoring namespace"
  default     = false
}

variable "clickhouse_chart_version" {
  type        = string
  description = "ClickHouse Helm chart version"
  default     = "4.5.0"
}

variable "clickhouse_persistence_enabled" {
  type        = bool
  description = "Whether to enable persistent storage for ClickHouse"
  default     = true
}

variable "clickhouse_storage_size" {
  type        = string
  description = "PVC storage size for ClickHouse"
  default     = "10Gi"
}

variable "enable_langfuse" {
  type        = bool
  description = "Whether to deploy Langfuse in the monitoring namespace"
  default     = false
}

variable "langfuse_chart_version" {
  type        = string
  description = "Langfuse Helm chart version"
  default     = "1.5.19"
}

variable "langfuse_ingress_enabled" {
  type        = bool
  description = "Whether to expose Langfuse via ingress"
  default     = false
}

variable "langfuse_ingress_host" {
  type        = string
  description = "Ingress host for Langfuse; when empty the module uses langfuse.<namespace>.localhost"
  default     = ""
}

variable "langfuse_public_key" {
  type        = string
  description = "LANGFUSE_PUBLIC_KEY for OrchWiz app"
  sensitive   = true
  default     = ""
}

variable "langfuse_secret_key" {
  type        = string
  description = "LANGFUSE_SECRET_KEY for OrchWiz app"
  sensitive   = true
  default     = ""
}

variable "langfuse_salt" {
  type        = string
  description = "Langfuse salt (openssl rand -base64 32)"
  sensitive   = true
  default     = ""
}

variable "langfuse_nextauth_secret" {
  type        = string
  description = "NextAuth secret for Langfuse (openssl rand -hex 32)"
  sensitive   = true
  default     = ""
}

variable "langfuse_encryption_key" {
  type        = string
  description = "Langfuse encryption key (openssl rand -hex 32)"
  sensitive   = true
  default     = ""
}

variable "langfuse_postgres_password" {
  type        = string
  description = "PostgreSQL password for Langfuse"
  sensitive   = true
  default     = ""
}

variable "langfuse_redis_password" {
  type        = string
  description = "Redis password for Langfuse"
  sensitive   = true
  default     = ""
}

variable "langfuse_clickhouse_password" {
  type        = string
  description = "ClickHouse password for Langfuse"
  sensitive   = true
  default     = ""
}

variable "langfuse_minio_root_password" {
  type        = string
  description = "MinIO root password for Langfuse"
  sensitive   = true
  default     = ""
}

variable "monitoring_storage_class" {
  type        = string
  description = "StorageClass for monitoring PVCs; empty = cluster default"
  default     = ""
}

variable "extra_helm_releases" {
  description = "Additional Helm releases to install (OCI or non-OCI). Key is the Helm release name."
  type = map(object({
    chart             = string
    repository        = optional(string) # e.g. "oci://ghcr.io/carverauto/charts"
    version           = optional(string)
    namespace         = optional(string) # default: ship namespace
    create_namespace  = optional(bool)   # default: false
    values_yaml       = optional(string) # raw YAML string; optional
    set               = optional(map(string))
    set_sensitive     = optional(map(string))
    timeout_seconds   = optional(number) # default: 600
    atomic            = optional(bool)   # default: false
    cleanup_on_fail   = optional(bool)   # default: true
    dependency_update = optional(bool)   # default: false
  }))
  default = {}
}

variable "extra_ingresses" {
  description = "Optional extra ingresses for exposing add-ons (key is an identifier, often matching the addon name)."
  type = map(object({
    host               = optional(string) # if empty: computed default (NAME.<namespace>.localhost)
    namespace          = optional(string) # default: ship namespace
    path               = optional(string) # default: "/"
    path_type          = optional(string) # default: "Prefix"
    service_name       = string
    service_port       = number
    ingress_class_name = optional(string) # default: nginx
    annotations        = optional(map(string))
  }))
  default = {}
}
