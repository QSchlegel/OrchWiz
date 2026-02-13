locals {
  create_database_secret = length(trimspace(var.database_url)) > 0
  kubeview_chart_archive = "${path.module}/../../../vendor/kubeview/deploy/helm/kubeview-${var.kubeview_chart_version}.tgz"
  openclaw_station_keys  = ["xo", "ops", "eng", "sec", "med", "cou"]
  runtime_edge_name      = "${var.app_name}-runtime-edge"
  runtime_jwt_secret     = trimspace(var.runtime_jwt_secret) != "" ? var.runtime_jwt_secret : var.better_auth_secret
  openclaw_gateway_tokens = merge(
    { for station in local.openclaw_station_keys : station => "${var.openclaw_gateway_token}-${station}" },
    { for station, token in var.openclaw_gateway_tokens : station => token if contains(local.openclaw_station_keys, station) },
  )
  provider_proxy_name     = "${var.app_name}-provider-proxy"
  provider_proxy_base_url = "http://${local.provider_proxy_name}:${var.provider_proxy_port}"
  kubeview_ingress_host = (
    trimspace(var.kubeview_ingress_host) != ""
    ? trimspace(var.kubeview_ingress_host)
    : trimspace(var.ingress_host)
  )
  kubeview_ingress_path = trimspace(var.kubeview_ingress_path) != "" ? trimspace(var.kubeview_ingress_path) : "/kubeview"
  kubeview_ingress_annotations = merge(
    {
      "nginx.ingress.kubernetes.io/use-regex"      = "true"
      "nginx.ingress.kubernetes.io/rewrite-target" = "/$2"
    },
    var.kubeview_ingress_annotations,
    var.kubeview_ingress_auth_required ? var.kubeview_ingress_auth_annotations : {},
  )
  runtime_edge_ingress_annotations = merge(
    {
      "nginx.ingress.kubernetes.io/proxy-read-timeout"  = "3600"
      "nginx.ingress.kubernetes.io/proxy-send-timeout"  = "3600"
      "nginx.ingress.kubernetes.io/proxy-buffering"     = "off"
    },
    var.ingress_annotations,
  )

  app_env = merge(
    {
      BETTER_AUTH_SECRET       = var.better_auth_secret
      BETTER_AUTH_URL          = var.better_auth_url
      NEXT_PUBLIC_APP_URL      = var.next_public_app_url
      ORCHWIZ_APP_NAME         = var.app_name
      ORCHWIZ_RUNTIME_JWT_SECRET = local.runtime_jwt_secret
      ORCHWIZ_RUNTIME_JWT_TTL_SECONDS = "600"
      ORCHWIZ_RUNTIME_JWT_ISSUER       = "orchwiz"
      ORCHWIZ_RUNTIME_JWT_AUDIENCE     = "orchwiz-runtime-edge"
      ORCHWIZ_RUNTIME_JWT_COOKIE_DOMAIN = (
        var.create_ingress && trimspace(var.ingress_host) != ""
        ? ".${trimspace(var.ingress_host)}"
        : ""
      )
      GITHUB_CLIENT_ID         = var.github_client_id
      GITHUB_CLIENT_SECRET     = var.github_client_secret
      NODE_ENV                 = "production"
      ENABLE_FORWARDING_INGEST = "true"
      ENABLE_SSE_EVENTS        = "true"
    },
    var.enable_openclaw ? {
      # Prefer per-station routing (xo/ops/eng/sec/med/cou) when OpenClaw is deployed as 6 services.
      OPENCLAW_GATEWAY_URL_TEMPLATE = "http://openclaw-{stationKey}:18789"
      OPENCLAW_GATEWAY_URL          = "http://openclaw-xo:18789"
      # Provide per-station gateway tokens to the OrchWiz app so the embedded OpenClaw Control UI can auto-auth.
      OPENCLAW_GATEWAY_TOKENS = jsonencode(local.openclaw_gateway_tokens)
    } : {},
    var.enable_provider_proxy ? {
      CODEX_PROVIDER_PROXY_URL     = local.provider_proxy_base_url
      CODEX_PROVIDER_PROXY_API_KEY = var.provider_proxy_api_key
    } : {},
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

resource "kubernetes_secret_v1" "openclaw_env" {
  count = var.enable_openclaw ? 1 : 0

  metadata {
    name      = "openclaw-env"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "openclaw"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  type = "Opaque"
  data = merge(
    {
      OPENCLAW_GATEWAY_TOKENS = jsonencode(local.openclaw_gateway_tokens)
    },
    {
      for station, token in local.openclaw_gateway_tokens :
      "OPENCLAW_GATEWAY_TOKEN_${upper(station)}" => token
    },
  )
}

resource "kubernetes_secret_v1" "provider_proxy_env" {
  count = var.enable_provider_proxy ? 1 : 0

  metadata {
    name      = "${local.provider_proxy_name}-env"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "provider-proxy"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  type = "Opaque"
  data = {
    PROVIDER_PROXY_API_KEY   = var.provider_proxy_api_key
    PROVIDER_PROXY_HOST      = "0.0.0.0"
    PROVIDER_PROXY_PORT      = tostring(var.provider_proxy_port)
    CODEX_HOME               = "/data/codex-home"
    CODEX_RUNTIME_WORKDIR    = "/workspace"
    CODEX_RUNTIME_TIMEOUT_MS = "120000"
    CODEX_RUNTIME_MODEL      = var.provider_proxy_default_model
  }
}

resource "kubernetes_persistent_volume_claim_v1" "provider_proxy_codex_home" {
  count = var.enable_provider_proxy ? 1 : 0

  # Most clusters use a StorageClass with `WaitForFirstConsumer`, which can deadlock if
  # Terraform blocks on PVC binding before creating the Deployment. Let the PVC bind
  # asynchronously once the provider-proxy Pod is scheduled.
  wait_until_bound = false

  metadata {
    name      = "${local.provider_proxy_name}-codex-home"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "provider-proxy"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    resources {
      requests = {
        storage = var.provider_proxy_storage_size
      }
    }
  }
}

resource "kubernetes_deployment_v1" "provider_proxy" {
  count = var.enable_provider_proxy ? 1 : 0

  # If the image cannot be pulled (e.g. offline dev environment), we still want Terraform
  # to apply the rest of the shipyard resources (notably OpenClaw + app updates).
  wait_for_rollout = false

  metadata {
    name      = local.provider_proxy_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "provider-proxy"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = local.provider_proxy_name
      }
    }

    template {
      metadata {
        labels = {
          app                      = local.provider_proxy_name
          "orchwiz/profile"        = "cloud_shipyard"
          "app.kubernetes.io/name" = "provider-proxy"
        }
      }

      spec {
        container {
          name              = "provider-proxy"
          image             = var.provider_proxy_image
          image_pull_policy = "IfNotPresent"

          port {
            container_port = var.provider_proxy_port
          }

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.provider_proxy_env[0].metadata[0].name
            }
          }

          volume_mount {
            name       = "codex-home"
            mount_path = "/data/codex-home"
          }

          volume_mount {
            name       = "workspace"
            mount_path = "/workspace"
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = var.provider_proxy_port
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 2
            failure_threshold     = 12
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = var.provider_proxy_port
            }
            initial_delay_seconds = 30
            period_seconds        = 20
            timeout_seconds       = 2
            failure_threshold     = 6
          }
        }

        volume {
          name = "codex-home"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.provider_proxy_codex_home[0].metadata[0].name
          }
        }

        volume {
          name = "workspace"
          empty_dir {}
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "provider_proxy" {
  count = var.enable_provider_proxy ? 1 : 0

  metadata {
    name      = local.provider_proxy_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "provider-proxy"
    }
  }

  spec {
    selector = {
      app = local.provider_proxy_name
    }

    port {
      port        = var.provider_proxy_port
      target_port = var.provider_proxy_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }
}

resource "kubernetes_deployment_v1" "openclaw" {
  for_each = toset(var.enable_openclaw ? local.openclaw_station_keys : [])

  metadata {
    name      = "openclaw-${each.key}"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "openclaw"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
      "orchwiz/station"           = each.key
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "openclaw-${each.key}"
      }
    }

    template {
      metadata {
        labels = {
          app                      = "openclaw-${each.key}"
          "orchwiz/station"        = each.key
          "orchwiz/profile"        = "cloud_shipyard"
          "app.kubernetes.io/name" = "openclaw"
        }
      }

      spec {
        container {
          name  = "openclaw"
          image = var.openclaw_image
          # `:latest` defaults to Always and breaks clusters when the registry is unreachable.
          image_pull_policy = "IfNotPresent"

          command = ["node", "openclaw.mjs"]
          args    = ["gateway", "--allow-unconfigured", "--bind", "lan", "--port", "18789"]

          port {
            container_port = 18789
          }

          env {
            name = "OPENCLAW_GATEWAY_TOKEN"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.openclaw_env[0].metadata[0].name
                key  = "OPENCLAW_GATEWAY_TOKEN_${upper(each.key)}"
              }
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 18789
            }
            initial_delay_seconds = 20
            period_seconds        = 10
            timeout_seconds       = 2
            failure_threshold     = 12
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 18789
            }
            initial_delay_seconds = 60
            period_seconds        = 20
            timeout_seconds       = 2
            failure_threshold     = 6
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret_v1.openclaw_env]
}

resource "kubernetes_service_v1" "openclaw" {
  for_each = toset(var.enable_openclaw ? local.openclaw_station_keys : [])

  metadata {
    name      = "openclaw-${each.key}"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "openclaw"
      "orchwiz/station"        = each.key
    }
  }

  spec {
    selector = {
      app = "openclaw-${each.key}"
    }

    port {
      port        = 18789
      target_port = 18789
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }

  depends_on = [kubernetes_deployment_v1.openclaw]
}

resource "kubernetes_deployment_v1" "runtime_edge" {
  metadata {
    name      = local.runtime_edge_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "runtime-edge"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = local.runtime_edge_name
      }
    }

    template {
      metadata {
        labels = {
          app                      = local.runtime_edge_name
          "app.kubernetes.io/name" = "runtime-edge"
        }
      }

      spec {
        container {
          name  = "runtime-edge"
          image = var.app_image

          port {
            container_port = var.runtime_edge_port
          }

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.app_env.metadata[0].name
            }
          }

          dynamic "env_from" {
            for_each = var.enable_openclaw ? [1] : []
            content {
              secret_ref {
                name = kubernetes_secret_v1.openclaw_env[0].metadata[0].name
              }
            }
          }

          env {
            name  = "PORT"
            value = tostring(var.runtime_edge_port)
          }

          env {
            name  = "HOSTNAME"
            value = "0.0.0.0"
          }

          command = ["npm"]
          args    = ["run", "runtime-edge", "--", "--hostname", "0.0.0.0", "--port", tostring(var.runtime_edge_port)]

          readiness_probe {
            http_get {
              path = "/health"
              port = var.runtime_edge_port
            }
            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 2
            failure_threshold     = 12
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = var.runtime_edge_port
            }
            initial_delay_seconds = 30
            period_seconds        = 20
            timeout_seconds       = 2
            failure_threshold     = 6
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret_v1.app_env]
}

resource "kubernetes_service_v1" "runtime_edge" {
  metadata {
    name      = local.runtime_edge_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "runtime-edge"
    }
  }

  spec {
    selector = {
      app = local.runtime_edge_name
    }

    port {
      port        = var.runtime_edge_port
      target_port = var.runtime_edge_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }

  depends_on = [kubernetes_deployment_v1.runtime_edge]
}

resource "kubernetes_ingress_v1" "runtime_edge" {
  count = var.create_ingress && (var.enable_openclaw || var.enable_kubeview) ? 1 : 0

  metadata {
    name        = "${local.runtime_edge_name}-ingress"
    namespace   = kubernetes_namespace_v1.shipyard.metadata[0].name
    annotations = local.runtime_edge_ingress_annotations
  }

  spec {
    ingress_class_name = var.ingress_class_name

    dynamic "rule" {
      for_each = concat(
        var.enable_kubeview && trimspace(var.ingress_host) != "" ? [
          {
            host = "kubeview.${trimspace(var.ingress_host)}"
          }
        ] : [],
        var.enable_openclaw && trimspace(var.ingress_host) != "" ? [
          for station in local.openclaw_station_keys : {
            host = "openclaw-${station}.${trimspace(var.ingress_host)}"
          }
        ] : [],
      )

      content {
        host = rule.value.host

        http {
          path {
            path      = "/"
            path_type = "Prefix"

            backend {
              service {
                name = kubernetes_service_v1.runtime_edge.metadata[0].name
                port {
                  number = var.runtime_edge_port
                }
              }
            }
          }
        }
      }
    }

    lifecycle {
      precondition {
        condition     = trimspace(var.ingress_host) != ""
        error_message = "runtime-edge ingress requires ingress_host to be set."
      }
    }
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

          dynamic "env_from" {
            for_each = var.enable_openclaw ? [1] : []
            content {
              secret_ref {
                name = kubernetes_secret_v1.openclaw_env[0].metadata[0].name
              }
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

resource "helm_release" "kubeview" {
  count = var.enable_kubeview ? 1 : 0

  name      = "${var.app_name}-kubeview"
  chart     = local.kubeview_chart_archive
  namespace = kubernetes_namespace_v1.shipyard.metadata[0].name

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
    namespace   = kubernetes_namespace_v1.shipyard.metadata[0].name
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

  lifecycle {
    precondition {
      condition     = trimspace(local.kubeview_ingress_host) != ""
      error_message = "kubeview ingress requires kubeview_ingress_host or ingress_host to be set."
    }

    precondition {
      condition = (
        !var.kubeview_ingress_auth_required
        || length(var.kubeview_ingress_auth_annotations) > 0
      )
      error_message = "kubeview ingress auth is required; set kubeview_ingress_auth_annotations."
    }
  }

  depends_on = [helm_release.kubeview]
}
