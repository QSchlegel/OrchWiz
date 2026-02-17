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

  namespace                    = var.namespace
  app_name                     = var.app_name
  app_image                    = var.app_image
  app_port                     = var.app_port
  openclaw_image               = var.openclaw_image
  openclaw_gateway_token       = var.openclaw_gateway_token
  openclaw_gateway_tokens      = var.openclaw_gateway_tokens
  provider_proxy_image         = var.provider_proxy_image
  provider_proxy_port          = var.provider_proxy_port
  provider_proxy_api_key       = var.provider_proxy_api_key
  provider_proxy_storage_size  = var.provider_proxy_storage_size
  provider_proxy_default_model = var.provider_proxy_default_model
  postgres_user                = var.postgres_user
  postgres_password            = var.postgres_password
  postgres_db                  = var.postgres_db
  better_auth_secret           = var.better_auth_secret
  better_auth_url              = var.better_auth_url
  next_public_app_url          = var.next_public_app_url
  github_client_id             = var.github_client_id
  github_client_secret         = var.github_client_secret
  app_env                      = var.app_env

  enable_security_audit_cron   = var.enable_security_audit_cron
  security_audit_cron_schedule = var.security_audit_cron_schedule
  security_audit_cron_token    = var.security_audit_cron_token
  vault_pvc_enabled            = var.vault_pvc_enabled
  vault_pvc_size               = var.vault_pvc_size

  enable_kubeview              = var.enable_kubeview
  kubeview_chart_version       = var.kubeview_chart_version
  kubeview_single_namespace    = var.kubeview_single_namespace
  kubeview_ingress_enabled     = var.kubeview_ingress_enabled
  kubeview_ingress_host        = var.kubeview_ingress_host
  kubeview_ingress_path        = var.kubeview_ingress_path
  kubeview_ingress_class_name  = var.kubeview_ingress_class_name
  kubeview_ingress_annotations = var.kubeview_ingress_annotations

  monitoring_namespace             = var.monitoring_namespace
  enable_grafana                    = var.enable_grafana
  grafana_chart_version             = var.grafana_chart_version
  grafana_ingress_enabled           = var.grafana_ingress_enabled
  grafana_ingress_host              = var.grafana_ingress_host
  enable_prometheus                 = var.enable_prometheus
  prometheus_chart_version          = var.prometheus_chart_version
  prometheus_ingress_enabled        = var.prometheus_ingress_enabled
  prometheus_ingress_host           = var.prometheus_ingress_host
  enable_loki                       = var.enable_loki
  loki_chart_version                = var.loki_chart_version
  loki_persistence_enabled         = var.loki_persistence_enabled
  loki_storage_size                = var.loki_storage_size
  enable_clickhouse                 = var.enable_clickhouse
  clickhouse_chart_version          = var.clickhouse_chart_version
  clickhouse_persistence_enabled   = var.clickhouse_persistence_enabled
  clickhouse_storage_size           = var.clickhouse_storage_size
  enable_langfuse                   = var.enable_langfuse
  langfuse_chart_version            = var.langfuse_chart_version
  langfuse_ingress_enabled          = var.langfuse_ingress_enabled
  langfuse_ingress_host             = var.langfuse_ingress_host
  langfuse_public_key               = var.langfuse_public_key
  langfuse_secret_key               = var.langfuse_secret_key
  langfuse_salt                     = var.langfuse_salt
  langfuse_nextauth_secret          = var.langfuse_nextauth_secret
  langfuse_encryption_key           = var.langfuse_encryption_key
  langfuse_postgres_password        = var.langfuse_postgres_password
  langfuse_redis_password           = var.langfuse_redis_password
  langfuse_clickhouse_password      = var.langfuse_clickhouse_password
  langfuse_minio_root_password      = var.langfuse_minio_root_password
  monitoring_storage_class          = var.monitoring_storage_class

  extra_helm_releases = var.extra_helm_releases
  extra_ingresses     = var.extra_ingresses
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

output "runtime_ui_openclaw_urls" {
  value = module.starship_minikube.runtime_ui_openclaw_urls
}

output "runtime_ui_kubeview_url" {
  value = module.starship_minikube.runtime_ui_kubeview_url
}

output "runtime_edge_service_name" {
  value = module.starship_minikube.runtime_edge_service_name
}

output "runtime_edge_port" {
  value = module.starship_minikube.runtime_edge_port
}

output "runtime_edge_port_forward_command" {
  value = module.starship_minikube.runtime_edge_port_forward_command
}

output "extra_ingress_urls" {
  value       = module.starship_minikube.extra_ingress_urls
  description = "Convenience URLs for extra ingresses."
}

output "monitoring_namespace" { value = module.starship_minikube.monitoring_namespace }
output "grafana_enabled" { value = module.starship_minikube.grafana_enabled }
output "grafana_url" { value = module.starship_minikube.grafana_url }
output "prometheus_enabled" { value = module.starship_minikube.prometheus_enabled }
output "prometheus_url" { value = module.starship_minikube.prometheus_url }
output "loki_enabled" { value = module.starship_minikube.loki_enabled }
output "clickhouse_enabled" { value = module.starship_minikube.clickhouse_enabled }
output "langfuse_enabled" { value = module.starship_minikube.langfuse_enabled }
output "langfuse_url" { value = module.starship_minikube.langfuse_url }
output "langfuse_base_url_in_cluster" { value = module.starship_minikube.langfuse_base_url_in_cluster }
