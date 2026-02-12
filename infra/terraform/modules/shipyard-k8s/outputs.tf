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
