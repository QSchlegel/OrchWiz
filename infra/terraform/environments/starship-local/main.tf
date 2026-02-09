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

  namespace          = var.namespace
  app_name           = var.app_name
  app_image          = var.app_image
  app_port           = var.app_port
  postgres_user      = var.postgres_user
  postgres_password  = var.postgres_password
  postgres_db        = var.postgres_db
  better_auth_secret = var.better_auth_secret
  better_auth_url    = var.better_auth_url
  next_public_app_url = var.next_public_app_url
  github_client_id   = var.github_client_id
  github_client_secret = var.github_client_secret
  app_env            = var.app_env
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
