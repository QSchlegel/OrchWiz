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
  description = "Optional DATABASE_URL value. Leave empty to use an existing secret."
  sensitive   = true
  default     = ""
}

variable "database_url_secret_name" {
  type        = string
  description = "Secret name containing DATABASE_URL"
  default     = "orchwiz-db-url"
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
