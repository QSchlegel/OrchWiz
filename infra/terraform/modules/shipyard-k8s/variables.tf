variable "namespace" {
  type        = string
  description = "Kubernetes namespace for cloud shipyard deployments"
  default     = "orchwiz-shipyard"
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

variable "replicas" {
  type        = number
  description = "Replica count for the application deployment"
  default     = 2
}

variable "database_url" {
  type        = string
  description = "Optional DATABASE_URL value. Leave empty to use an existing secret or in-cluster Postgres when enable_in_cluster_postgres is true."
  sensitive   = true
  default     = ""
}

variable "database_url_secret_name" {
  type        = string
  description = "Secret name containing DATABASE_URL"
  default     = "orchwiz-db-url"
}

variable "enable_in_cluster_postgres" {
  type        = bool
  description = "When true, provision a PostgreSQL Helm release in the namespace and set DATABASE_URL from it. Overrides database_url when set."
  default     = false
}

variable "postgres_user" {
  type        = string
  description = "PostgreSQL username when enable_in_cluster_postgres is true"
  default     = "orchwiz"
}

variable "postgres_password" {
  type        = string
  description = "PostgreSQL password when enable_in_cluster_postgres is true"
  sensitive   = true
  default     = ""
}

variable "postgres_db" {
  type        = string
  description = "PostgreSQL database name when enable_in_cluster_postgres is true"
  default     = "orchis"
}

variable "postgres_chart_version" {
  type        = string
  description = "Bitnami PostgreSQL Helm chart version when enable_in_cluster_postgres is true"
  default     = "15.3.5"
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
}

variable "next_public_app_url" {
  type        = string
  description = "NEXT_PUBLIC_APP_URL value"
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

variable "service_type" {
  type        = string
  description = "Service exposure type"
  default     = "ClusterIP"
}

variable "create_ingress" {
  type        = bool
  description = "Whether to create an ingress for the app service"
  default     = false
}

variable "ingress_class_name" {
  type        = string
  description = "Ingress class name when create_ingress is true"
  default     = "nginx"
}

variable "ingress_host" {
  type        = string
  description = "Ingress host name when create_ingress is true"
  default     = ""
}

variable "ingress_annotations" {
  type        = map(string)
  description = "Optional ingress annotations"
  default     = {}
}

variable "app_env" {
  type        = map(string)
  description = "Additional environment variables to inject"
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

variable "enable_openclaw" {
  type        = bool
  description = "Whether to deploy OpenClaw gateway/control UI instances (one per bridge station)"
  default     = true
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

variable "enable_provider_proxy" {
  type        = bool
  description = "Whether to deploy provider-proxy (Codex runtime proxy) inside the shipyard namespace"
  default     = true
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
  default     = true
}

variable "kubeview_ingress_host" {
  type        = string
  description = "Ingress host for kubeview; defaults to app ingress_host when empty"
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

variable "kubeview_ingress_auth_required" {
  type        = bool
  description = "Whether kubeview ingress requires explicit auth annotations"
  default     = true
}

variable "kubeview_ingress_auth_annotations" {
  type        = map(string)
  description = "Auth-related annotations merged into kubeview ingress"
  default     = {}
}

# -----------------------------------------------------------------------------
# Monitoring namespace and observability (Grafana, Prometheus, Loki, ClickHouse, Langfuse)
# -----------------------------------------------------------------------------
variable "monitoring_namespace" {
  type        = string
  description = "Kubernetes namespace for monitoring stack (Grafana, Prometheus, Loki, ClickHouse, Langfuse)"
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
  description = "Ingress host for Grafana; when empty the module uses grafana.<ingress_host>"
  default     = ""
}

variable "enable_prometheus" {
  type        = bool
  description = "Whether to deploy Prometheus in the monitoring namespace"
  default     = false
}

variable "prometheus_chart_version" {
  type        = string
  description = "Prometheus Helm chart version (prometheus-community/prometheus)"
  default     = "31.0.0"
}

variable "prometheus_ingress_enabled" {
  type        = bool
  description = "Whether to expose Prometheus via ingress"
  default     = false
}

variable "prometheus_ingress_host" {
  type        = string
  description = "Ingress host for Prometheus; when empty the module uses prometheus.<ingress_host>"
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
  description = "Langfuse Helm chart version (langfuse/langfuse)"
  default     = "1.5.19"
}

variable "langfuse_ingress_enabled" {
  type        = bool
  description = "Whether to expose Langfuse via ingress (for browser access)"
  default     = false
}

variable "langfuse_ingress_host" {
  type        = string
  description = "Ingress host for Langfuse; when empty the module uses langfuse.<ingress_host>"
  default     = ""
}

variable "langfuse_public_key" {
  type        = string
  description = "LANGFUSE_PUBLIC_KEY for OrchWiz app (create project in Langfuse UI, then paste)"
  sensitive   = true
  default     = ""
}

variable "langfuse_secret_key" {
  type        = string
  description = "LANGFUSE_SECRET_KEY for OrchWiz app (create project in Langfuse UI, then paste)"
  sensitive   = true
  default     = ""
}

variable "langfuse_salt" {
  type        = string
  description = "Langfuse salt for hashing API keys (openssl rand -base64 32)"
  sensitive   = true
  default     = ""
}

variable "langfuse_nextauth_secret" {
  type        = string
  description = "NextAuth secret for Langfuse JWT (openssl rand -hex 32)"
  sensitive   = true
  default     = ""
}

variable "langfuse_encryption_key" {
  type        = string
  description = "Langfuse encryption key 256 bits hex (openssl rand -hex 32)"
  sensitive   = true
  default     = ""
}

variable "langfuse_postgres_password" {
  type        = string
  description = "PostgreSQL password for Langfuse (when using bundled Postgres)"
  sensitive   = true
  default     = ""
}

variable "langfuse_redis_password" {
  type        = string
  description = "Redis/Valkey password for Langfuse (when using bundled Redis)"
  sensitive   = true
  default     = ""
}

variable "langfuse_clickhouse_password" {
  type        = string
  description = "ClickHouse password for Langfuse (when using bundled ClickHouse)"
  sensitive   = true
  default     = ""
}

variable "langfuse_minio_root_password" {
  type        = string
  description = "MinIO root password for Langfuse (when using bundled MinIO)"
  sensitive   = true
  default     = ""
}

variable "monitoring_storage_class" {
  type        = string
  description = "StorageClass for monitoring PVCs (Loki, ClickHouse); empty = cluster default"
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
    host               = optional(string) # if empty: computed default (NAME.<ingress_host>)
    namespace          = optional(string) # default: ship namespace
    path               = optional(string) # default: "/"
    path_type          = optional(string) # default: "Prefix"
    service_name       = string
    service_port       = number
    ingress_class_name = optional(string) # default: var.ingress_class_name
    annotations        = optional(map(string))
  }))
  default = {}
}
