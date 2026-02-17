locals {
  postgres_release_name  = "${var.app_name}-postgres"
  database_url           = "postgresql://${var.postgres_user}:${var.postgres_password}@${local.postgres_release_name}-postgresql.${var.namespace}.svc.cluster.local:5432/${var.postgres_db}?schema=public"
  kubeview_chart_archive = "${path.module}/../../../vendor/kubeview/deploy/helm/kubeview-${var.kubeview_chart_version}.tgz"
  kubeview_ingress_host  = trimspace(var.kubeview_ingress_host) != "" ? trimspace(var.kubeview_ingress_host) : "kubeview.${var.namespace}.localhost"
  kubeview_ingress_path  = trimspace(var.kubeview_ingress_path) != "" ? trimspace(var.kubeview_ingress_path) : "/kubeview"
  openclaw_station_keys  = ["xo", "ops", "eng", "sec", "med", "cou"]
  runtime_edge_name      = "${var.app_name}-runtime-edge"
  runtime_jwt_secret     = trimspace(var.runtime_jwt_secret) != "" ? var.runtime_jwt_secret : var.better_auth_secret
  openclaw_gateway_tokens = merge(
    { for station in local.openclaw_station_keys : station => "${var.openclaw_gateway_token}-${station}" },
    { for station, token in var.openclaw_gateway_tokens : station => token if contains(local.openclaw_station_keys, station) },
  )
  provider_proxy_name     = "${var.app_name}-provider-proxy"
  provider_proxy_base_url = "http://${local.provider_proxy_name}:${var.provider_proxy_port}"
  kubeview_ingress_annotations = merge(
    {
      "nginx.ingress.kubernetes.io/use-regex"      = "true"
      "nginx.ingress.kubernetes.io/rewrite-target" = "/$2"
    },
    var.kubeview_ingress_annotations,
  )
  enable_monitoring_namespace = var.enable_grafana || var.enable_prometheus || var.enable_loki || var.enable_clickhouse || var.enable_langfuse
  grafana_ingress_host        = trimspace(var.grafana_ingress_host) != "" ? trimspace(var.grafana_ingress_host) : "grafana.${var.namespace}.localhost"
  prometheus_ingress_host     = trimspace(var.prometheus_ingress_host) != "" ? trimspace(var.prometheus_ingress_host) : "prometheus.${var.namespace}.localhost"

  app_env = merge(
    {
      DATABASE_URL                    = local.database_url
      BETTER_AUTH_SECRET              = var.better_auth_secret
      BETTER_AUTH_URL                 = var.better_auth_url
      NEXT_PUBLIC_APP_URL             = var.next_public_app_url
      ORCHWIZ_APP_NAME                = var.app_name
      ORCHWIZ_RUNTIME_JWT_SECRET      = local.runtime_jwt_secret
      ORCHWIZ_RUNTIME_JWT_TTL_SECONDS = "600"
      ORCHWIZ_RUNTIME_JWT_ISSUER      = "orchwiz"
      ORCHWIZ_RUNTIME_JWT_AUDIENCE    = "orchwiz-runtime-edge"
      GITHUB_CLIENT_ID                = var.github_client_id
      GITHUB_CLIENT_SECRET            = var.github_client_secret
      OPENCLAW_GATEWAY_URL            = "http://openclaw-xo:18789"
      # Bridge UI / websocket proxy resolves station-specific OpenClaw services via this template.
      # Keep OPENCLAW_GATEWAY_URL for single-endpoint runtime provider fallbacks.
      OPENCLAW_GATEWAY_URL_TEMPLATE = "http://openclaw-{stationKey}:18789"
      # Expose the per-station gateway tokens to the OrchWiz app so the embedded OpenClaw Control UI can
      # auto-configure auth without relying on the (deprecated) websocket proxy.
      OPENCLAW_GATEWAY_TOKENS      = jsonencode(local.openclaw_gateway_tokens)
      CODEX_PROVIDER_PROXY_URL     = local.provider_proxy_base_url
      CODEX_PROVIDER_PROXY_API_KEY = var.provider_proxy_api_key
      NODE_ENV                     = "production"
      ENABLE_FORWARDING_INGEST     = "true"
      ENABLE_SSE_EVENTS            = "true"
    },
    trimspace(var.security_audit_cron_token) != "" ? {
      SECURITY_AUDIT_CRON_TOKEN = var.security_audit_cron_token
    } : {},
    var.enable_langfuse ? {
      LANGFUSE_BASE_URL   = "http://langfuse.${var.monitoring_namespace}.svc.cluster.local:3000"
      LANGFUSE_PUBLIC_KEY = var.langfuse_public_key
      LANGFUSE_SECRET_KEY = var.langfuse_secret_key
    } : {},
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

resource "kubernetes_namespace_v1" "monitoring" {
  count = local.enable_monitoring_namespace ? 1 : 0

  metadata {
    name = var.monitoring_namespace
    labels = {
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/component"         = "monitoring"
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

resource "kubernetes_secret_v1" "openclaw_env" {
  metadata {
    name      = "openclaw-env"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "openclaw"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
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
  metadata {
    name      = "${local.provider_proxy_name}-env"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "provider-proxy"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
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
  # Most local Kind/Minikube setups use a StorageClass with `WaitForFirstConsumer`,
  # which deadlocks if Terraform blocks on the PVC binding before creating the Deployment.
  # Let the PVC bind asynchronously once the provider-proxy Pod is scheduled.
  wait_until_bound = false

  metadata {
    name      = "${local.provider_proxy_name}-codex-home"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "provider-proxy"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
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
  # If the image cannot be pulled (e.g. offline dev environment), we still want Terraform
  # to apply the rest of the starship resources (notably OpenClaw + app updates).
  wait_for_rollout = false

  metadata {
    name      = local.provider_proxy_name
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "provider-proxy"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
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
          "orchwiz/profile"        = "local_starship_build"
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
              name = kubernetes_secret_v1.provider_proxy_env.metadata[0].name
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
            claim_name = kubernetes_persistent_volume_claim_v1.provider_proxy_codex_home.metadata[0].name
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
  metadata {
    name      = local.provider_proxy_name
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
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
  for_each = toset(local.openclaw_station_keys)

  metadata {
    name      = "openclaw-${each.key}"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "openclaw"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
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
          "orchwiz/profile"        = "local_starship_build"
          "app.kubernetes.io/name" = "openclaw"
        }
      }

      spec {
        container {
          name  = "openclaw"
          image = var.openclaw_image
          # `:latest` defaults to Always and breaks local clusters when the registry is unreachable.
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
                name = kubernetes_secret_v1.openclaw_env.metadata[0].name
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
  for_each = toset(local.openclaw_station_keys)

  metadata {
    name      = "openclaw-${each.key}"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
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
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "runtime-edge"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
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

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.openclaw_env.metadata[0].name
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
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
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

resource "kubernetes_persistent_volume_claim_v1" "vault_inbox" {
  count = var.vault_pvc_enabled ? 1 : 0

  # Most local Kind/Minikube setups use a StorageClass with `WaitForFirstConsumer`,
  # which deadlocks if Terraform blocks on the PVC binding before creating the Deployment.
  # Let the PVC bind asynchronously once the app Pod is scheduled.
  wait_until_bound = false

  metadata {
    name      = "${var.app_name}-vault-inbox"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = var.app_name
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
    }
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    resources {
      requests = {
        storage = var.vault_pvc_size
      }
    }
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

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.openclaw_env.metadata[0].name
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

          dynamic "volume_mount" {
            for_each = var.vault_pvc_enabled ? [1] : []
            content {
              name       = "vault-inbox"
              mount_path = "/app/OWZ-Vault/00-Inbox"
            }
          }
        }

        dynamic "volume" {
          for_each = var.vault_pvc_enabled ? [1] : []
          content {
            name = "vault-inbox"
            persistent_volume_claim {
              claim_name = kubernetes_persistent_volume_claim_v1.vault_inbox[0].metadata[0].name
            }
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

resource "kubernetes_cron_job_v1" "security_audit" {
  count = var.enable_security_audit_cron ? 1 : 0

  metadata {
    name      = "${var.app_name}-security-audit"
    namespace = kubernetes_namespace_v1.starship.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = var.app_name
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "local_starship_build"
    }
  }

  spec {
    schedule           = var.security_audit_cron_schedule
    concurrency_policy = "Forbid"

    successful_jobs_history_limit = 1
    failed_jobs_history_limit     = 3

    job_template {
      metadata {}

      spec {
        template {
          metadata {}

          spec {
            restart_policy = "Never"

            container {
              name              = "security-audit"
              image             = "curlimages/curl:8.5.0"
              image_pull_policy = "IfNotPresent"

              env {
                name = "SECURITY_AUDIT_CRON_TOKEN"
                value_from {
                  secret_key_ref {
                    name = kubernetes_secret_v1.app_env.metadata[0].name
                    key  = "SECURITY_AUDIT_CRON_TOKEN"
                  }
                }
              }

              command = ["/bin/sh", "-c"]
              args = [<<-EOT
                set -eu
                curl -fsS -X POST "http://${var.app_name}:${var.app_port}/api/security/audits/nightly" \\
                  -H "Authorization: Bearer $SECURITY_AUDIT_CRON_TOKEN" \\
                  -H "Content-Type: application/json" \\
                  --data-binary @- <<'JSON'
                {"includeQuartermasterReview":true,"dryRun":false,"force":false}
                JSON
              EOT
              ]
            }
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = trimspace(var.security_audit_cron_token) != ""
      error_message = "enable_security_audit_cron requires security_audit_cron_token to be set."
    }
  }

  depends_on = [kubernetes_service_v1.app]
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

# -----------------------------------------------------------------------------
# Grafana (monitoring namespace)
# -----------------------------------------------------------------------------
resource "helm_release" "grafana" {
  count = var.enable_grafana ? 1 : 0

  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = var.grafana_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name

  set {
    name  = "fullnameOverride"
    value = "grafana"
  }
  set {
    name  = "service.port"
    value = "3000"
  }
  set {
    name  = "persistence.enabled"
    value = "true"
  }
}

resource "kubernetes_ingress_v1" "grafana" {
  count = var.enable_grafana && var.grafana_ingress_enabled ? 1 : 0

  metadata {
    name        = "${var.app_name}-grafana-ingress"
    namespace   = kubernetes_namespace_v1.monitoring[0].metadata[0].name
    annotations = {}
  }

  spec {
    ingress_class_name = var.kubeview_ingress_class_name
    rule {
      host = local.grafana_ingress_host
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = "grafana"
              port { number = 3000 }
            }
          }
        }
      }
    }
  }
  depends_on = [helm_release.grafana]
}

# -----------------------------------------------------------------------------
# Prometheus (monitoring namespace)
# -----------------------------------------------------------------------------
resource "helm_release" "prometheus" {
  count = var.enable_prometheus ? 1 : 0

  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = var.prometheus_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name

  set {
    name  = "server.fullnameOverride"
    value = "prometheus-server"
  }
  set {
    name  = "server.persistentVolume.enabled"
    value = "true"
  }
  set {
    name  = "alertmanager.enabled"
    value = "false"
  }
  set {
    name  = "kube-state-metrics.enabled"
    value = "false"
  }
  set {
    name  = "prometheus-node-exporter.enabled"
    value = "false"
  }
  set {
    name  = "prometheus-pushgateway.enabled"
    value = "false"
  }
}

resource "kubernetes_ingress_v1" "prometheus" {
  count = var.enable_prometheus && var.prometheus_ingress_enabled ? 1 : 0

  metadata {
    name        = "${var.app_name}-prometheus-ingress"
    namespace   = kubernetes_namespace_v1.monitoring[0].metadata[0].name
    annotations = {}
  }

  spec {
    ingress_class_name = var.kubeview_ingress_class_name
    rule {
      host = local.prometheus_ingress_host
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = "prometheus-server"
              port { number = 9090 }
            }
          }
        }
      }
    }
  }
  depends_on = [helm_release.prometheus]
}

# -----------------------------------------------------------------------------
# Loki (monitoring namespace)
# -----------------------------------------------------------------------------
resource "helm_release" "loki" {
  count = var.enable_loki ? 1 : 0

  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki"
  version    = var.loki_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name

  set {
    name  = "fullnameOverride"
    value = "loki"
  }
  set {
    name  = "deploymentMode"
    value = "SingleBinary"
  }
  set {
    name  = "singleBinary.replicas"
    value = "1"
  }
  set {
    name  = "loki.commonConfig.replication_factor"
    value = "1"
  }
  set {
    name  = "singleBinary.persistence.enabled"
    value = var.loki_persistence_enabled ? "true" : "false"
  }
  set {
    name  = "singleBinary.persistence.size"
    value = var.loki_storage_size
  }
  dynamic "set" {
    for_each = trimspace(var.monitoring_storage_class) != "" ? [1] : []
    content {
      name  = "singleBinary.persistence.storageClass"
      value = var.monitoring_storage_class
    }
  }
}

# -----------------------------------------------------------------------------
# ClickHouse (monitoring namespace)
# -----------------------------------------------------------------------------
resource "helm_release" "clickhouse" {
  count = var.enable_clickhouse ? 1 : 0

  name       = "clickhouse"
  repository = "oci://registry-1.docker.io/bitnamicharts"
  chart      = "clickhouse"
  version    = var.clickhouse_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name

  set {
    name  = "fullnameOverride"
    value = "clickhouse"
  }
  set {
    name  = "persistence.enabled"
    value = var.clickhouse_persistence_enabled ? "true" : "false"
  }
  set {
    name  = "persistence.size"
    value = var.clickhouse_storage_size
  }
  dynamic "set" {
    for_each = trimspace(var.monitoring_storage_class) != "" ? [1] : []
    content {
      name  = "persistence.storageClass"
      value = var.monitoring_storage_class
    }
  }
}

# -----------------------------------------------------------------------------
# Langfuse (monitoring namespace)
# -----------------------------------------------------------------------------
resource "helm_release" "langfuse" {
  count = var.enable_langfuse ? 1 : 0

  name       = "langfuse"
  repository = "https://langfuse.github.io/langfuse-k8s"
  chart      = "langfuse"
  version    = var.langfuse_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name

  set {
    name  = "fullnameOverride"
    value = "langfuse"
  }
  set {
    name  = "langfuse.ingress.enabled"
    value = var.langfuse_ingress_enabled ? "true" : "false"
  }
  dynamic "set" {
    for_each = var.langfuse_ingress_enabled && trimspace(var.langfuse_ingress_host) != "" ? [1] : []
    content {
      name  = "langfuse.ingress.hosts[0].host"
      value = trimspace(var.langfuse_ingress_host)
    }
  }
  set_sensitive {
    name  = "langfuse.salt.value"
    value = trimspace(var.langfuse_salt) != "" ? var.langfuse_salt : "replace-with-openssl-rand-base64-32"
  }
  set_sensitive {
    name  = "langfuse.nextauth.secret.value"
    value = trimspace(var.langfuse_nextauth_secret) != "" ? var.langfuse_nextauth_secret : "replace-with-openssl-rand-hex-32"
  }
  set_sensitive {
    name  = "langfuse.encryptionKey.value"
    value = trimspace(var.langfuse_encryption_key) != "" ? var.langfuse_encryption_key : "replace-with-openssl-rand-hex-32"
  }
  set_sensitive {
    name  = "postgresql.auth.password"
    value = trimspace(var.langfuse_postgres_password) != "" ? var.langfuse_postgres_password : "langfuse-pg-dev"
  }
  set_sensitive {
    name  = "redis.auth.password"
    value = trimspace(var.langfuse_redis_password) != "" ? var.langfuse_redis_password : "langfuse-redis-dev"
  }
  set_sensitive {
    name  = "clickhouse.auth.password"
    value = trimspace(var.langfuse_clickhouse_password) != "" ? var.langfuse_clickhouse_password : "langfuse-ch-dev"
  }
  set_sensitive {
    name  = "s3.auth.rootPassword"
    value = trimspace(var.langfuse_minio_root_password) != "" ? var.langfuse_minio_root_password : "langfuse-minio-dev"
  }
}
