locals {
  postgres_release_name  = "${var.app_name}-postgres"
  database_url           = "postgresql://${var.postgres_user}:${var.postgres_password}@${local.postgres_release_name}-postgresql.${var.namespace}.svc.cluster.local:5432/${var.postgres_db}?schema=public"
  kubeview_chart_archive = "${path.module}/../../../vendor/kubeview/deploy/helm/kubeview-${var.kubeview_chart_version}.tgz"
  kubeview_ingress_host  = trimspace(var.kubeview_ingress_host) != "" ? trimspace(var.kubeview_ingress_host) : "kubeview.${var.namespace}.localhost"
  kubeview_ingress_path  = trimspace(var.kubeview_ingress_path) != "" ? trimspace(var.kubeview_ingress_path) : "/kubeview"
  kubeview_ingress_annotations = merge(
    {
      "nginx.ingress.kubernetes.io/use-regex"      = "true"
      "nginx.ingress.kubernetes.io/rewrite-target" = "/$2"
    },
    var.kubeview_ingress_annotations,
  )

  app_env = merge(
    {
      DATABASE_URL             = local.database_url
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

resource "kubernetes_namespace_v1" "starship" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
    }
  }
}

resource "helm_release" "postgres" {
  name = local.postgres_release_name
  # Bitnami chart index entries for recent PostgreSQL versions are OCI-based.
  # Using the OCI repository directly avoids apply-time chart resolution errors.
  repository = "oci://registry-1.docker.io/bitnamicharts"
  chart      = "postgresql"
  version    = var.postgres_chart_version
  namespace  = kubernetes_namespace_v1.starship.metadata[0].name

  set {
    name  = "auth.username"
    value = var.postgres_user
  }

  set_sensitive {
    name  = "auth.password"
    value = var.postgres_password
  }

  set {
    name  = "auth.database"
    value = var.postgres_db
  }
}

resource "kubernetes_secret_v1" "app_env" {
  metadata {
    name      = "${var.app_name}-env"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
  }

  type = "Opaque"
  data = {
    for key, value in local.app_env : key => value
  }
}

resource "kubernetes_deployment_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = var.app_name
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
    }
  }

  spec {
    replicas = 1

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

  depends_on = [helm_release.postgres]
}

resource "kubernetes_service_v1" "app" {
  metadata {
    name      = var.app_name
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
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

resource "helm_release" "kubeview" {
  count = var.enable_kubeview ? 1 : 0

  name      = "${var.app_name}-kubeview"
  chart     = local.kubeview_chart_archive
  namespace = kubernetes_namespace_v1.starship.metadata[0].name

  set {
    name  = "loadBalancer.enabled"
    value = "false"
  }

  set {
    name  = "nodePort.enabled"
    value = "false"
  }

  set {
    name  = "singleNamespace"
    value = var.kubeview_single_namespace ? "true" : "false"
  }
}

resource "kubernetes_ingress_v1" "kubeview" {
  count = var.enable_kubeview && var.kubeview_ingress_enabled ? 1 : 0

  metadata {
    name        = "${var.app_name}-kubeview-ingress"
    namespace   = kubernetes_namespace_v1.starship.metadata[0].name
    annotations = local.kubeview_ingress_annotations
  }

  spec {
    ingress_class_name = var.kubeview_ingress_class_name

    rule {
      host = local.kubeview_ingress_host

      http {
        path {
          path      = "${trimsuffix(local.kubeview_ingress_path, "/")}(/|$)(.*)"
          path_type = "ImplementationSpecific"

          backend {
            service {
              name = helm_release.kubeview[0].name
              port {
                number = 8000
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.kubeview]
}
