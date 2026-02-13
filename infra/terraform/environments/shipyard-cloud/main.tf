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

  enable_openclaw         = var.enable_openclaw
  openclaw_image          = var.openclaw_image
  openclaw_gateway_token  = var.openclaw_gateway_token
  openclaw_gateway_tokens = var.openclaw_gateway_tokens

  enable_provider_proxy        = var.enable_provider_proxy
  provider_proxy_image         = var.provider_proxy_image
  provider_proxy_port          = var.provider_proxy_port
  provider_proxy_api_key       = var.provider_proxy_api_key
  provider_proxy_storage_size  = var.provider_proxy_storage_size
  provider_proxy_default_model = var.provider_proxy_default_model

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

output "runtime_ui_openclaw_urls" {
  value = module.shipyard_k8s.runtime_ui_openclaw_urls
}

output "runtime_ui_kubeview_url" {
  value = module.shipyard_k8s.runtime_ui_kubeview_url
}

output "runtime_edge_service_name" {
  value = module.shipyard_k8s.runtime_edge_service_name
}

output "runtime_edge_port" {
  value = module.shipyard_k8s.runtime_edge_port
}
