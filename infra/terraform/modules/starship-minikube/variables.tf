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
  default     = "15.5.25"
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
