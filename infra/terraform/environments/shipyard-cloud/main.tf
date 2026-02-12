module "shipyard_k8s" {
  source = "../../modules/shipyard-k8s"

  namespace                = var.namespace
  app_name                 = var.app_name
  app_image                = var.app_image
  app_port                 = var.app_port
  replicas                 = var.replicas
  database_url             = var.database_url
  database_url_secret_name = var.database_url_secret_name
  better_auth_secret       = var.better_auth_secret
  better_auth_url          = var.better_auth_url
  next_public_app_url      = var.next_public_app_url
  github_client_id         = var.github_client_id
  github_client_secret     = var.github_client_secret
  service_type             = var.service_type
  create_ingress           = var.create_ingress
  ingress_class_name       = var.ingress_class_name
  ingress_host             = var.ingress_host
  ingress_annotations      = var.ingress_annotations
  app_env                  = var.app_env

  enable_kubeview                   = var.enable_kubeview
  kubeview_chart_version            = var.kubeview_chart_version
  kubeview_single_namespace         = var.kubeview_single_namespace
  kubeview_ingress_enabled          = var.kubeview_ingress_enabled
  kubeview_ingress_host             = var.kubeview_ingress_host
  kubeview_ingress_path             = var.kubeview_ingress_path
  kubeview_ingress_class_name       = var.kubeview_ingress_class_name
  kubeview_ingress_annotations      = var.kubeview_ingress_annotations
  kubeview_ingress_auth_required    = var.kubeview_ingress_auth_required
  kubeview_ingress_auth_annotations = var.kubeview_ingress_auth_annotations
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

output "kubeview_enabled" {
  value = module.shipyard_k8s.kubeview_enabled
}

output "kubeview_ingress_enabled" {
  value = module.shipyard_k8s.kubeview_ingress_enabled
}

output "kubeview_url" {
  value = module.shipyard_k8s.kubeview_url
}
