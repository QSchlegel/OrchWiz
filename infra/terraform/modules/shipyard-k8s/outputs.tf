output "namespace" {
  value       = kubernetes_namespace_v1.shipyard.metadata[0].name
  description = "Namespace used for the cloud shipyard deployment"
}

output "service_name" {
  value       = kubernetes_service_v1.app.metadata[0].name
  description = "Kubernetes service name for OrchWiz"
}

output "ingress_host" {
  value       = var.create_ingress ? var.ingress_host : null
  description = "Configured ingress host when ingress is enabled"
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
    ? (
      trimspace(var.kubeview_ingress_host) != ""
      ? "https://${trimspace(var.kubeview_ingress_host)}${trimspace(var.kubeview_ingress_path) != "" ? trimspace(var.kubeview_ingress_path) : "/kubeview"}"
      : (
        trimspace(var.ingress_host) != ""
        ? "https://${trimspace(var.ingress_host)}${trimspace(var.kubeview_ingress_path) != "" ? trimspace(var.kubeview_ingress_path) : "/kubeview"}"
        : null
      )
    )
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

output "runtime_ui_openclaw_urls" {
  value = (
    var.create_ingress && var.enable_openclaw && trimspace(var.ingress_host) != ""
    ? {
      for station in local.openclaw_station_keys :
      station => "https://openclaw-${station}.${trimspace(var.ingress_host)}"
    }
    : {}
  )
  description = "Direct OpenClaw runtime UI base URLs (per station) exposed via runtime-edge"
}

output "runtime_ui_kubeview_url" {
  value = (
    var.create_ingress && var.enable_kubeview && trimspace(var.ingress_host) != ""
    ? "https://kubeview.${trimspace(var.ingress_host)}"
    : null
  )
  description = "Direct KubeView runtime UI base URL exposed via runtime-edge"
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
    var.enable_grafana && var.grafana_ingress_enabled && trimspace(local.grafana_ingress_host) != ""
    ? "https://${local.grafana_ingress_host}"
    : null
  )
  description = "Grafana URL when ingress is enabled"
}

output "runtime_ui_grafana_url" {
  value = (
    var.create_ingress && var.enable_grafana && trimspace(var.ingress_host) != ""
    ? "https://grafana.${trimspace(var.ingress_host)}"
    : null
  )
  description = "Direct Grafana runtime UI base URL (when ingress enabled)"
}

output "prometheus_enabled" {
  value       = var.enable_prometheus
  description = "Whether Prometheus is deployed"
}

output "prometheus_url" {
  value = (
    var.enable_prometheus && var.prometheus_ingress_enabled && trimspace(local.prometheus_ingress_host) != ""
    ? "https://${local.prometheus_ingress_host}"
    : null
  )
  description = "Prometheus URL when ingress is enabled"
}

output "runtime_ui_prometheus_url" {
  value = (
    var.create_ingress && var.enable_prometheus && trimspace(var.ingress_host) != ""
    ? "https://prometheus.${trimspace(var.ingress_host)}"
    : null
  )
  description = "Direct Prometheus runtime UI base URL (when ingress enabled)"
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
    ? "https://${trimspace(var.langfuse_ingress_host)}"
    : null
  )
  description = "Langfuse URL when ingress is enabled"
}

output "runtime_ui_langfuse_url" {
  value = (
    var.create_ingress && var.enable_langfuse && trimspace(var.ingress_host) != ""
    ? "https://langfuse.${trimspace(var.ingress_host)}"
    : null
  )
  description = "Direct Langfuse runtime UI base URL (when ingress enabled)"
}

output "langfuse_base_url_in_cluster" {
  value       = var.enable_langfuse ? "http://langfuse.${var.monitoring_namespace}.svc.cluster.local:3000" : null
  description = "In-cluster LANGFUSE_BASE_URL for OrchWiz app (injected into app_env when enabled)"
}

output "extra_ingress_urls" {
  description = "Convenience URLs for extra ingresses."
  value = {
    for name, ingress in var.extra_ingresses :
    name => format(
      "https://%s%s",
      (
        trimspace(coalesce(try(ingress.host, null), "")) != ""
        ? trimspace(coalesce(try(ingress.host, null), ""))
        : format("%s.%s", name, trimspace(var.ingress_host))
      ),
      (
        trimspace(coalesce(try(ingress.path, null), "")) != ""
        ? trimspace(coalesce(try(ingress.path, null), ""))
        : "/"
      )
    )
  }
}
