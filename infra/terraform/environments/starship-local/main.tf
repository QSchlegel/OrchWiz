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

output "minikube_access_command" {
  value = module.starship_minikube.minikube_access_command
}
