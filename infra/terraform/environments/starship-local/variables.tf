variable "kubeconfig_path" {
  type        = string
  description = "Path to kubeconfig"
  default     = "~/.kube/config"
}

variable "infrastructure_kind" {
  type        = string
  description = "Local Kubernetes target kind (kind|minikube)"
  default     = "kind"

  validation {
    condition     = contains(["kind", "minikube"], var.infrastructure_kind)
    error_message = "infrastructure_kind must be one of: kind, minikube."
  }
}

variable "kube_context" {
  type        = string
  description = "Kube context override. If empty, defaults to kind-orchwiz for kind and minikube for minikube."
  default     = ""
}

variable "namespace" {
  type        = string
  description = "Namespace for OrchWiz local starship"
  default     = "orchwiz-starship"
}

variable "app_name" {
  type        = string
  description = "Kubernetes app resource name"
  default     = "orchwiz"
}

variable "app_image" {
  type        = string
  description = "Container image for OrchWiz"
}

variable "app_port" {
  type        = number
  description = "Container/service port"
  default     = 3000
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
}

variable "postgres_db" {
  type        = string
  description = "PostgreSQL database"
  default     = "orchis"
}

variable "better_auth_secret" {
  type        = string
  description = "BETTER_AUTH_SECRET"
  sensitive   = true
}

variable "runtime_jwt_secret" {
  type        = string
  description = "ORCHWIZ_RUNTIME_JWT_SECRET value (defaults to better_auth_secret when empty)"
  sensitive   = true
  default     = ""
}

variable "better_auth_url" {
  type        = string
  description = "BETTER_AUTH_URL"
  default     = "http://localhost:3000"
}

variable "next_public_app_url" {
  type        = string
  description = "NEXT_PUBLIC_APP_URL"
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
  description = "Additional app environment variables"
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

variable "openclaw_station_count" {
  type        = number
  description = "Number of OpenClaw stations to deploy locally (1-6)."
  default     = 6

  validation {
    condition     = var.openclaw_station_count >= 1 && var.openclaw_station_count <= 6 && floor(var.openclaw_station_count) == var.openclaw_station_count
    error_message = "openclaw_station_count must be an integer between 1 and 6."
  }
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
  description = "Container image for Spacebot runtime connector"
  default     = "ghcr.io/qschlegel/orchwiz-spacebot:latest"
}

variable "spacebot_api_port" {
  type        = number
  description = "Service port for Spacebot API/UI"
  default     = 19898
}

variable "spacebot_webhook_port" {
  type        = number
  description = "Service port for Spacebot webhook adapter"
  default     = 18789
}

variable "spacebot_storage_size" {
  type        = string
  description = "PVC size for Spacebot data persistence"
  default     = "2Gi"
}

variable "spacebot_env" {
  type        = map(string)
  description = "Additional Spacebot environment variables"
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
  description = "Whether to expose kubeview via ingress for local profile"
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

# Monitoring stack (Grafana, Prometheus, Loki, ClickHouse, Langfuse)
variable "monitoring_namespace" {
  type    = string
  default = "monitoring"
}
variable "enable_grafana" {
  type    = bool
  default = false
}
variable "grafana_chart_version" {
  type    = string
  default = "7.3.0"
}
variable "grafana_ingress_enabled" {
  type    = bool
  default = false
}
variable "grafana_ingress_host" {
  type    = string
  default = ""
}
variable "enable_prometheus" {
  type    = bool
  default = false
}
variable "prometheus_chart_version" {
  type    = string
  default = "28.9.1"
}
variable "prometheus_ingress_enabled" {
  type    = bool
  default = false
}
variable "prometheus_ingress_host" {
  type    = string
  default = ""
}
variable "enable_loki" {
  type    = bool
  default = false
}
variable "loki_chart_version" {
  type    = string
  default = "6.6.0"
}
variable "loki_persistence_enabled" {
  type    = bool
  default = true
}
variable "loki_storage_size" {
  type    = string
  default = "10Gi"
}
variable "enable_clickhouse" {
  type    = bool
  default = false
}
variable "clickhouse_chart_version" {
  type    = string
  default = "4.5.0"
}
variable "clickhouse_persistence_enabled" {
  type    = bool
  default = true
}
variable "clickhouse_storage_size" {
  type    = string
  default = "10Gi"
}
variable "enable_langfuse" {
  type    = bool
  default = false
}
variable "langfuse_chart_version" {
  type    = string
  default = "1.5.19"
}
variable "langfuse_ingress_enabled" {
  type    = bool
  default = false
}
variable "langfuse_ingress_host" {
  type    = string
  default = ""
}
variable "langfuse_public_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_secret_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_salt" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_nextauth_secret" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_encryption_key" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_postgres_password" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_redis_password" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_clickhouse_password" {
  type      = string
  sensitive = true
  default   = ""
}
variable "langfuse_minio_root_password" {
  type      = string
  sensitive = true
  default   = ""
}
variable "monitoring_storage_class" {
  type    = string
  default = ""
}

variable "provider_proxy_image" {
  type        = string
  description = "Container image for provider-proxy"
  default     = "ghcr.io/qschlegel/orchwiz-provider-proxy:latest"
}

variable "provider_proxy_port" {
  type        = number
  description = "Service port for provider-proxy"
  default     = 4000
}

variable "provider_proxy_api_key" {
  type        = string
  description = "Shared bearer token for provider-proxy"
  sensitive   = true
  default     = "orchwiz-provider-proxy-dev-key"
}

variable "provider_proxy_storage_size" {
  type        = string
  description = "PVC size for provider-proxy CODEX_HOME"
  default     = "1Gi"
}

variable "provider_proxy_default_model" {
  type        = string
  description = "Default model used via provider-proxy"
  default     = "gpt-5"
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
