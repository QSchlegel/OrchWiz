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
