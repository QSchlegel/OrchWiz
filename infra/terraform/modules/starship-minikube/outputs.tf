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
