locals {
  create_database_secret = length(trimspace(var.database_url)) > 0

  app_env = merge(
    {
      BETTER_AUTH_SECRET       = var.better_auth_secret
      BETTER_AUTH_URL          = var.better_auth_url
      NEXT_PUBLIC_APP_URL      = var.next_public_app_url
      GITHUB_CLIENT_ID         = var.github_client_id
      GITHUB_CLIENT_SECRET     = var.github_client_secret
      NODE_ENV                 = "production"
      ENABLE_FORWARDING_INGEST = "true"
      ENABLE_SSE_EVENTS        = "true"
    },
    var.app_env,
  )
}

resource "kubernetes_namespace_v1" "shipyard" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }
}

resource "kubernetes_secret_v1" "database_url" {
  count = local.create_database_secret ? 1 : 0

  metadata {
    name      = var.database_url_secret_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
  }

  type = "Opaque"
  data = {
    DATABASE_URL = var.database_url
  }
}

resource "kubernetes_secret_v1" "app_env" {
  metadata {
    name      = "${var.app_name}-env"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
  }

  type = "Opaque"
  data = {
    for key, value in local.app_env : key => value
  }
}

resource "kubernetes_deployment_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = var.app_name
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = {
        app = var.app_name
      }
    }

    template {
      metadata {
        labels = {
          app = var.app_name
        }
      }

      spec {
        container {
          name  = var.app_name
          image = var.app_image

          port {
            container_port = var.app_port
          }

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.app_env.metadata[0].name
            }
          }

          env {
            name = "DATABASE_URL"
            value_from {
              secret_key_ref {
                name = var.database_url_secret_name
                key  = "DATABASE_URL"
              }
            }
          }

          readiness_probe {
            http_get {
              path = "/"
              port = var.app_port
            }
            initial_delay_seconds = 15
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/"
              port = var.app_port
            }
            initial_delay_seconds = 45
            period_seconds        = 20
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret_v1.database_url]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = var.app_name
    }
  }

  spec {
    selector = {
      app = var.app_name
    }

    port {
      port        = var.app_port
      target_port = var.app_port
      protocol    = "TCP"
    }

    type = var.service_type
  }
}

resource "kubernetes_ingress_v1" "app" {
  count = var.create_ingress ? 1 : 0

  metadata {
    name        = "${var.app_name}-ingress"
    namespace   = kubernetes_namespace_v1.shipyard.metadata[0].name
    annotations = var.ingress_annotations
  }

  spec {
    ingress_class_name = var.ingress_class_name

    rule {
      host = var.ingress_host

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = kubernetes_service_v1.app.metadata[0].name
              port {
                number = var.app_port
              }
            }
          }
        }
      }
    }
  }
}
