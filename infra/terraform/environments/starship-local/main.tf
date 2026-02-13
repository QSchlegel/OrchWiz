locals {
  effective_kube_context = trimspace(var.kube_context) != "" ? var.kube_context : (
    var.infrastructure_kind == "minikube" ? "minikube" : "kind-orchwiz"
  )

  local_access_command = var.infrastructure_kind == "minikube" ? (
    "minikube service -n ${module.starship_minikube.namespace} ${module.starship_minikube.service_name} --url"
    ) : (
    "kubectl -n ${module.starship_minikube.namespace} port-forward svc/${module.starship_minikube.service_name} 3000:3000"
  )
}

module "starship_minikube" {
  source = "../../modules/starship-minikube"

  namespace              = var.namespace
  app_name               = var.app_name
  app_image              = var.app_image
  app_port               = var.app_port
  openclaw_image         = var.openclaw_image
  openclaw_gateway_token = var.openclaw_gateway_token
  openclaw_gateway_tokens = var.openclaw_gateway_tokens
  provider_proxy_image        = var.provider_proxy_image
  provider_proxy_port         = var.provider_proxy_port
  provider_proxy_api_key      = var.provider_proxy_api_key
  provider_proxy_storage_size = var.provider_proxy_storage_size
  provider_proxy_default_model = var.provider_proxy_default_model
  postgres_user          = var.postgres_user
  postgres_password      = var.postgres_password
  postgres_db            = var.postgres_db
  better_auth_secret     = var.better_auth_secret
  better_auth_url        = var.better_auth_url
  next_public_app_url    = var.next_public_app_url
  github_client_id       = var.github_client_id
  github_client_secret   = var.github_client_secret
  app_env                = var.app_env

  enable_kubeview              = var.enable_kubeview
  kubeview_chart_version       = var.kubeview_chart_version
  kubeview_single_namespace    = var.kubeview_single_namespace
  kubeview_ingress_enabled     = var.kubeview_ingress_enabled
  kubeview_ingress_host        = var.kubeview_ingress_host
  kubeview_ingress_path        = var.kubeview_ingress_path
  kubeview_ingress_class_name  = var.kubeview_ingress_class_name
  kubeview_ingress_annotations = var.kubeview_ingress_annotations
}

output "namespace" {
  value = module.starship_minikube.namespace
}

output "service_name" {
  value = module.starship_minikube.service_name
}

output "infrastructure_kind" {
  value = var.infrastructure_kind
}

output "kube_context" {
  value = local.effective_kube_context
}

output "local_access_command" {
  value = local.local_access_command
}

output "minikube_access_command" {
  value = var.infrastructure_kind == "minikube" ? local.local_access_command : null
}

output "kubeview_enabled" {
  value = module.starship_minikube.kubeview_enabled
}

output "kubeview_ingress_enabled" {
  value = module.starship_minikube.kubeview_ingress_enabled
}

output "kubeview_url" {
  value = module.starship_minikube.kubeview_url
}
