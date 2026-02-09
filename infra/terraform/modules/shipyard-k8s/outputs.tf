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
