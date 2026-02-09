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
