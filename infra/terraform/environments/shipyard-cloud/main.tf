module "shipyard_k8s" {
  source = "../../modules/shipyard-k8s"

  namespace               = var.namespace
  app_name                = var.app_name
  app_image               = var.app_image
  app_port                = var.app_port
  replicas                = var.replicas
  database_url            = var.database_url
  database_url_secret_name = var.database_url_secret_name
  better_auth_secret      = var.better_auth_secret
  better_auth_url         = var.better_auth_url
  next_public_app_url     = var.next_public_app_url
  github_client_id        = var.github_client_id
  github_client_secret    = var.github_client_secret
  service_type            = var.service_type
  create_ingress          = var.create_ingress
  ingress_class_name      = var.ingress_class_name
  ingress_host            = var.ingress_host
  ingress_annotations     = var.ingress_annotations
  app_env                 = var.app_env
}

output "namespace" {
  value = module.shipyard_k8s.namespace
}

output "service_name" {
  value = module.shipyard_k8s.service_name
}

output "ingress_host" {
  value = module.shipyard_k8s.ingress_host
}
