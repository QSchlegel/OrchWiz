output "namespace" {
  value       = kubernetes_namespace_v1.starship.metadata[0].name
  description = "Namespace used for the local starship deployment"
}

output "service_name" {
  value       = kubernetes_service_v1.app.metadata[0].name
  description = "Kubernetes service name for OrchWiz"
}

output "minikube_access_command" {
  value       = "minikube service -n ${kubernetes_namespace_v1.starship.metadata[0].name} ${kubernetes_service_v1.app.metadata[0].name} --url"
  description = "Command to resolve a local access URL"
}

output "kubeview_enabled" {
  value       = var.enable_kubeview
  description = "Whether kubeview deployment is enabled"
}

output "kubeview_ingress_enabled" {
  value       = var.enable_kubeview && var.kubeview_ingress_enabled
  description = "Whether kubeview ingress is enabled"
}

output "kubeview_url" {
  value = (
    var.enable_kubeview && var.kubeview_ingress_enabled
    ? "http://${trimspace(var.kubeview_ingress_host) != "" ? trimspace(var.kubeview_ingress_host) : "kubeview.${var.namespace}.localhost"}${trimspace(var.kubeview_ingress_path) != "" ? trimspace(var.kubeview_ingress_path) : "/kubeview"}"
    : null
  )
  description = "kubeview URL when ingress is enabled"
}

output "runtime_edge_port" {
  value       = var.runtime_edge_port
  description = "runtime-edge service port"
}

output "runtime_edge_service_name" {
  value       = kubernetes_service_v1.runtime_edge.metadata[0].name
  description = "Kubernetes service name for runtime-edge"
}

output "runtime_edge_port_forward_command" {
  value       = "kubectl -n ${kubernetes_namespace_v1.starship.metadata[0].name} port-forward svc/${kubernetes_service_v1.runtime_edge.metadata[0].name} ${var.runtime_edge_port}:${var.runtime_edge_port}"
  description = "Command to port-forward runtime-edge for direct runtime UI access"
}

output "runtime_ui_openclaw_urls" {
  value = {
    for station in local.openclaw_station_keys :
    station => "http://localhost:${var.runtime_edge_port}/openclaw/${station}"
  }
  description = "Direct OpenClaw runtime UI base URLs (per station) exposed via runtime-edge (requires port-forward)"
}

output "runtime_ui_kubeview_url" {
  value       = var.enable_kubeview ? "http://localhost:${var.runtime_edge_port}/kubeview" : null
  description = "Direct KubeView runtime UI base URL exposed via runtime-edge (requires port-forward)"
}

output "monitoring_namespace" {
  value       = local.enable_monitoring_namespace ? var.monitoring_namespace : null
  description = "Namespace used for monitoring stack when enabled"
}

output "grafana_enabled" {
  value       = var.enable_grafana
  description = "Whether Grafana is deployed"
}

output "grafana_url" {
  value = (
    var.enable_grafana && var.grafana_ingress_enabled
    ? "http://${local.grafana_ingress_host}"
    : null
  )
  description = "Grafana URL when ingress is enabled"
}

output "runtime_ui_grafana_url" {
  value       = var.enable_grafana ? "http://localhost:${var.runtime_edge_port}/grafana" : null
  description = "Grafana URL via runtime-edge port-forward (when app on host); use in-cluster when app in cluster"
}

output "prometheus_enabled" {
  value       = var.enable_prometheus
  description = "Whether Prometheus is deployed"
}

output "prometheus_url" {
  value = (
    var.enable_prometheus && var.prometheus_ingress_enabled
    ? "http://${local.prometheus_ingress_host}"
    : null
  )
  description = "Prometheus URL when ingress is enabled"
}

output "runtime_ui_prometheus_url" {
  value       = var.enable_prometheus ? "http://localhost:${var.runtime_edge_port}/prometheus" : null
  description = "Prometheus URL via port-forward (when app on host); use in-cluster when app in cluster"
}

output "loki_enabled" {
  value       = var.enable_loki
  description = "Whether Loki is deployed"
}

output "clickhouse_enabled" {
  value       = var.enable_clickhouse
  description = "Whether ClickHouse is deployed"
}

output "langfuse_enabled" {
  value       = var.enable_langfuse
  description = "Whether Langfuse is deployed"
}

output "langfuse_url" {
  value = (
    var.enable_langfuse && var.langfuse_ingress_enabled && trimspace(var.langfuse_ingress_host) != ""
    ? "http://${trimspace(var.langfuse_ingress_host)}"
    : null
  )
  description = "Langfuse URL when ingress is enabled"
}

output "langfuse_base_url_in_cluster" {
  value       = var.enable_langfuse ? "http://langfuse.${var.monitoring_namespace}.svc.cluster.local:3000" : null
  description = "In-cluster LANGFUSE_BASE_URL (injected into app_env when enabled)"
}

output "extra_ingress_urls" {
  description = "Convenience URLs for extra ingresses."
  value = {
    for name, ingress in var.extra_ingresses :
    name => format(
      "http://%s%s",
      (
        trimspace(coalesce(try(ingress.host, null), "")) != ""
        ? trimspace(coalesce(try(ingress.host, null), ""))
        : format("%s.%s.localhost", name, kubernetes_namespace_v1.starship.metadata[0].name)
      ),
      (
        trimspace(coalesce(try(ingress.path, null), "")) != ""
        ? trimspace(coalesce(try(ingress.path, null), ""))
        : "/"
      )
    )
  }
}
