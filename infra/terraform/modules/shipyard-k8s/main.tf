locals {
  postgres_release_name   = "${var.app_name}-postgres"
  in_cluster_database_url = "postgresql://${var.postgres_user}:${var.postgres_password}@${local.postgres_release_name}-postgresql.${var.namespace}.svc.cluster.local:5432/${var.postgres_db}?schema=public"
  effective_database_url  = var.enable_in_cluster_postgres ? local.in_cluster_database_url : var.database_url
  create_database_secret  = length(trimspace(local.effective_database_url)) > 0
  kubeview_chart_archive  = "${path.module}/../../../vendor/kubeview/deploy/helm/kubeview-${var.kubeview_chart_version}.tgz"
  openclaw_station_keys   = ["xo", "ops", "eng", "sec", "med", "cou"]
  runtime_edge_name       = "${var.app_name}-runtime-edge"
  runtime_jwt_secret      = trimspace(var.runtime_jwt_secret) != "" ? var.runtime_jwt_secret : var.better_auth_secret
  openclaw_gateway_tokens = merge(
    { for station in local.openclaw_station_keys : station => "${var.openclaw_gateway_token}-${station}" },
    { for station, token in var.openclaw_gateway_tokens : station => token if contains(local.openclaw_station_keys, station) },
  )
  next_public_app_origin = can(regex("^https?://[^/]+", trimspace(var.next_public_app_url))) ? regex("^https?://[^/]+", trimspace(var.next_public_app_url)) : ""
  openclaw_control_ui_allowed_origins = distinct(compact(concat(
    [local.next_public_app_origin],
    local.next_public_app_origin == "http://localhost" ? ["http://127.0.0.1"] : [],
    startswith(local.next_public_app_origin, "http://localhost:") ? [replace(local.next_public_app_origin, "http://localhost:", "http://127.0.0.1:")] : [],
    local.next_public_app_origin == "https://localhost" ? ["https://127.0.0.1"] : [],
    startswith(local.next_public_app_origin, "https://localhost:") ? [replace(local.next_public_app_origin, "https://localhost:", "https://127.0.0.1:")] : [],
    local.next_public_app_origin == "http://127.0.0.1" ? ["http://localhost"] : [],
    startswith(local.next_public_app_origin, "http://127.0.0.1:") ? [replace(local.next_public_app_origin, "http://127.0.0.1:", "http://localhost:")] : [],
    local.next_public_app_origin == "https://127.0.0.1" ? ["https://localhost"] : [],
    startswith(local.next_public_app_origin, "https://127.0.0.1:") ? [replace(local.next_public_app_origin, "https://127.0.0.1:", "https://localhost:")] : [],
  )))
  spacebot_name           = "${var.app_name}-spacebot"
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
  enable_monitoring_namespace       = var.enable_grafana || var.enable_prometheus || var.enable_loki || var.enable_clickhouse || var.enable_langfuse
  grafana_ingress_host              = trimspace(var.grafana_ingress_host) != "" ? trimspace(var.grafana_ingress_host) : (trimspace(var.ingress_host) != "" ? "grafana.${trimspace(var.ingress_host)}" : "")
  prometheus_ingress_host           = trimspace(var.prometheus_ingress_host) != "" ? trimspace(var.prometheus_ingress_host) : (trimspace(var.ingress_host) != "" ? "prometheus.${trimspace(var.ingress_host)}" : "")
  monitoring_dashboards_dir         = "${path.module}/../../../../dev-local/monitoring/grafana/dashboards"
  grafana_dashboards_configmap_name = "${var.app_name}-grafana-dashboards"
  grafana_dashboard_files = {
    "ship-oncall-command-center.json" = "${local.monitoring_dashboards_dir}/ship-oncall-command-center.json"
    "ship-diagnostics-deep-dive.json" = "${local.monitoring_dashboards_dir}/ship-diagnostics-deep-dive.json"
  }
  prometheus_metrics_scrape_secret_name = "${var.app_name}-metrics-scrape-auth"
  prometheus_metrics_token_mount_path   = "/etc/prometheus/secrets/orchwiz-app-metrics"
  resolved_metrics_bearer_token         = trimspace(var.orchwiz_metrics_bearer_token) != "" ? var.orchwiz_metrics_bearer_token : var.metrics_bearer_token
  prometheus_service_metrics_targets = concat(
    [
      {
        targets = ["${var.app_name}.${var.namespace}.svc.cluster.local:${var.app_port}"]
        labels  = { service = "app" }
      },
      {
        targets = ["${local.runtime_edge_name}.${var.namespace}.svc.cluster.local:${var.runtime_edge_port}"]
        labels  = { service = "runtime-edge" }
      },
    ],
    var.enable_provider_proxy ? [
      {
        targets = ["${local.provider_proxy_name}.${var.namespace}.svc.cluster.local:${var.provider_proxy_port}"]
        labels  = { service = "provider-proxy" }
      },
    ] : [],
  )
  prometheus_probe_targets = concat(
    [
      {
        targets = ["http://${var.app_name}.${var.namespace}.svc.cluster.local:${var.app_port}/api/health"]
        labels  = { service = "app" }
      },
      {
        targets = ["http://${local.runtime_edge_name}.${var.namespace}.svc.cluster.local:${var.runtime_edge_port}/health"]
        labels  = { service = "runtime-edge" }
      },
    ],
    var.enable_provider_proxy ? [
      {
        targets = ["http://${local.provider_proxy_name}.${var.namespace}.svc.cluster.local:${var.provider_proxy_port}/health"]
        labels  = { service = "provider-proxy" }
      },
    ] : [],
    var.enable_openclaw ? [
      for station in local.openclaw_station_keys : {
        targets = ["http://openclaw-${station}.${var.namespace}.svc.cluster.local:18789/health"]
        labels  = { service = "openclaw-${station}" }
      }
    ] : [],
    var.enable_spacebot ? [
      {
        targets = ["http://${local.spacebot_name}.${var.namespace}.svc.cluster.local:${var.spacebot_api_port}/api/health"]
        labels  = { service = "spacebot" }
      },
    ] : [],
  )
  prometheus_extra_scrape_configs = [
    {
      job_name          = "ship-service-metrics"
      metrics_path      = "/metrics"
      scheme            = "http"
      bearer_token_file = "${local.prometheus_metrics_token_mount_path}/bearer-token"
      static_configs    = local.prometheus_service_metrics_targets
    },
    {
      job_name = "blackbox-exporter"
      static_configs = [
        {
          targets = ["prometheus-blackbox-exporter.${var.monitoring_namespace}.svc.cluster.local:9115"]
        }
      ]
    },
    {
      job_name     = "ship-service-probes"
      metrics_path = "/probe"
      params = {
        module = ["http_2xx"]
      }
      static_configs = local.prometheus_probe_targets
      relabel_configs = [
        {
          source_labels = ["__address__"]
          target_label  = "__param_target"
        },
        {
          source_labels = ["service"]
          target_label  = "service"
        },
        {
          source_labels = ["__param_target"]
          target_label  = "instance"
        },
        {
          target_label = "__address__"
          replacement  = "prometheus-blackbox-exporter.${var.monitoring_namespace}.svc.cluster.local:9115"
        },
      ]
    },
  ]
  prometheus_alerting_rules = {
    groups = [
      {
        name = "ship-situational-awareness"
        rules = [
          {
            alert = "ShipServiceProbeFailing"
            expr  = "probe_success{job=\"ship-service-probes\"} == 0"
            for   = "2m"
            labels = {
              severity = "page"
            }
            annotations = {
              summary     = "Ship service probe is failing"
              description = "{{ $labels.service }} probe target {{ $labels.instance }} is failing."
            }
          },
          {
            alert = "ShipServiceMetricsScrapeDown"
            expr  = "up{job=\"ship-service-metrics\"} == 0"
            for   = "2m"
            labels = {
              severity = "warning"
            }
            annotations = {
              summary     = "Ship service metrics scrape is down"
              description = "Prometheus cannot scrape /metrics for {{ $labels.service }} at {{ $labels.instance }}."
            }
          },
          {
            alert = "ShipServiceElevated5xxRate"
            expr  = "(sum by (service) (rate(orchwiz_http_requests_total{status_class=\"5xx\"}[5m])) / clamp_min(sum by (service) (rate(orchwiz_http_requests_total[5m])), 0.001)) > 0.05"
            for   = "10m"
            labels = {
              severity = "warning"
            }
            annotations = {
              summary     = "Elevated 5xx rate"
              description = "{{ $labels.service }} has sustained 5xx ratio above 5% over 10 minutes."
            }
          },
          {
            alert = "ShipServiceHighP95Latency"
            expr  = "histogram_quantile(0.95, sum by (le, service) (rate(orchwiz_http_request_duration_seconds_bucket[5m]))) > 1.5"
            for   = "10m"
            labels = {
              severity = "warning"
            }
            annotations = {
              summary     = "Elevated p95 latency"
              description = "{{ $labels.service }} p95 request latency is above 1.5s."
            }
          },
          {
            alert = "ShipPodRestartSpike"
            expr  = "sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total{namespace=\"${var.namespace}\"}[15m])) > 2"
            for   = "5m"
            labels = {
              severity = "warning"
            }
            annotations = {
              summary     = "Pod restart spike detected"
              description = "Pod {{ $labels.namespace }}/{{ $labels.pod }} restarted more than twice in 15 minutes."
            }
          },
        ]
      }
    ]
  }
  runtime_edge_ingress_annotations = merge(
    {
      "nginx.ingress.kubernetes.io/proxy-read-timeout" = "3600"
      "nginx.ingress.kubernetes.io/proxy-send-timeout" = "3600"
      "nginx.ingress.kubernetes.io/proxy-buffering"    = "off"
    },
    var.ingress_annotations,
  )

  app_env = merge(
    {
      BETTER_AUTH_SECRET              = var.better_auth_secret
      BETTER_AUTH_URL                 = var.better_auth_url
      NEXT_PUBLIC_APP_URL             = var.next_public_app_url
      ORCHWIZ_APP_NAME                = var.app_name
      ORCHWIZ_RUNTIME_JWT_SECRET      = local.runtime_jwt_secret
      ORCHWIZ_RUNTIME_JWT_TTL_SECONDS = "600"
      ORCHWIZ_RUNTIME_JWT_ISSUER      = "orchwiz"
      ORCHWIZ_RUNTIME_JWT_AUDIENCE    = "orchwiz-runtime-edge"
      ORCHWIZ_RUNTIME_JWT_COOKIE_DOMAIN = (
        var.create_ingress && trimspace(var.ingress_host) != ""
        ? ".${trimspace(var.ingress_host)}"
        : ""
      )
      GITHUB_CLIENT_ID                    = var.github_client_id
      GITHUB_CLIENT_SECRET                = var.github_client_secret
      RUNTIME_ADAPTER_REGISTRY_ENABLED    = "false"
      BRIDGE_DISPATCH_REGISTRY_ENABLED    = "false"
      TOOLCHAIN_PROTOCOL_REGISTRY_ENABLED = "false"
      SPACEBOT_CONNECTOR_ENABLED          = "false"
      NODE_ENV                            = "production"
      ENABLE_FORWARDING_INGEST            = "true"
      ENABLE_SSE_EVENTS                   = "true"
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
    trimspace(var.security_audit_cron_token) != "" ? {
      SECURITY_AUDIT_CRON_TOKEN = var.security_audit_cron_token
    } : {},
    trimspace(local.resolved_metrics_bearer_token) != "" ? {
      ORCHWIZ_METRICS_BEARER_TOKEN    = local.resolved_metrics_bearer_token
      PROMETHEUS_METRICS_BEARER_TOKEN = local.resolved_metrics_bearer_token
    } : {},
    var.enable_langfuse ? {
      # In-cluster URL so OrchWiz proxy and Langfuse client talk to Langfuse over cluster network.
      LANGFUSE_BASE_URL   = "http://langfuse.${var.monitoring_namespace}.svc.cluster.local:3000"
      LANGFUSE_PUBLIC_KEY = var.langfuse_public_key
      LANGFUSE_SECRET_KEY = var.langfuse_secret_key
    } : {},
    var.enable_spacebot ? {
      SPACEBOT_WEBHOOK_BASE_URL = "http://${local.spacebot_name}:${var.spacebot_webhook_port}"
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
  count = var.enable_in_cluster_postgres ? 1 : 0

  name       = local.postgres_release_name
  repository = "oci://registry-1.docker.io/bitnamicharts"
  chart      = "postgresql"
  version    = var.postgres_chart_version
  namespace  = kubernetes_namespace_v1.shipyard.metadata[0].name
  timeout    = 900

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

  lifecycle {
    precondition {
      condition     = !var.enable_in_cluster_postgres || length(trimspace(var.postgres_password)) > 0
      error_message = "postgres_password must be set when enable_in_cluster_postgres is true."
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
    DATABASE_URL = local.effective_database_url
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
      OPENCLAW_GATEWAY_TOKENS             = jsonencode(local.openclaw_gateway_tokens)
      OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS = jsonencode(local.openclaw_control_ui_allowed_origins)
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
    PROVIDER_PROXY_API_KEY          = var.provider_proxy_api_key
    PROVIDER_PROXY_HOST             = "0.0.0.0"
    PROVIDER_PROXY_PORT             = tostring(var.provider_proxy_port)
    ORCHWIZ_METRICS_BEARER_TOKEN    = local.resolved_metrics_bearer_token
    PROMETHEUS_METRICS_BEARER_TOKEN = local.resolved_metrics_bearer_token
    CODEX_HOME                      = "/data/codex-home"
    CODEX_RUNTIME_WORKDIR           = "/workspace"
    CODEX_RUNTIME_TIMEOUT_MS        = "120000"
    CODEX_RUNTIME_MODEL             = var.provider_proxy_default_model
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

resource "kubernetes_secret_v1" "spacebot_env" {
  count = var.enable_spacebot ? 1 : 0

  metadata {
    name      = "${local.spacebot_name}-env"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "spacebot"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  type = "Opaque"
  data = merge(
    {
      WEBHOOK_ENABLED = "true"
    },
    var.spacebot_env,
  )
}

resource "kubernetes_persistent_volume_claim_v1" "spacebot_data" {
  count = var.enable_spacebot ? 1 : 0

  wait_until_bound = false

  metadata {
    name      = "${local.spacebot_name}-data"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "spacebot"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  spec {
    access_modes = ["ReadWriteOnce"]

    resources {
      requests = {
        storage = var.spacebot_storage_size
      }
    }
  }
}

resource "kubernetes_deployment_v1" "spacebot" {
  count = var.enable_spacebot ? 1 : 0

  wait_for_rollout = false

  metadata {
    name      = local.spacebot_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "spacebot"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = local.spacebot_name
      }
    }

    template {
      metadata {
        labels = {
          app                      = local.spacebot_name
          "orchwiz/profile"        = "cloud_shipyard"
          "app.kubernetes.io/name" = "spacebot"
        }
      }

      spec {
        container {
          name              = "spacebot"
          image             = var.spacebot_image
          image_pull_policy = "IfNotPresent"

          port {
            container_port = var.spacebot_api_port
          }

          port {
            container_port = var.spacebot_webhook_port
          }

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.spacebot_env[0].metadata[0].name
            }
          }

          volume_mount {
            name       = "spacebot-data"
            mount_path = "/data"
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = var.spacebot_webhook_port
            }
            initial_delay_seconds = 20
            period_seconds        = 10
            timeout_seconds       = 2
            failure_threshold     = 12
          }

          liveness_probe {
            http_get {
              path = "/api/health"
              port = var.spacebot_api_port
            }
            initial_delay_seconds = 30
            period_seconds        = 20
            timeout_seconds       = 2
            failure_threshold     = 6
          }
        }

        volume {
          name = "spacebot-data"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim_v1.spacebot_data[0].metadata[0].name
          }
        }
      }
    }
  }

  depends_on = [kubernetes_secret_v1.spacebot_env]
}

resource "kubernetes_service_v1" "spacebot" {
  count = var.enable_spacebot ? 1 : 0

  metadata {
    name      = local.spacebot_name
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name" = "spacebot"
    }
  }

  spec {
    selector = {
      app = local.spacebot_name
    }

    port {
      name        = "api"
      port        = var.spacebot_api_port
      target_port = var.spacebot_api_port
      protocol    = "TCP"
    }

    port {
      name        = "webhook"
      port        = var.spacebot_webhook_port
      target_port = var.spacebot_webhook_port
      protocol    = "TCP"
    }

    type = "ClusterIP"
  }

  depends_on = [kubernetes_deployment_v1.spacebot]
}

resource "kubernetes_deployment_v1" "openclaw" {
  for_each = toset(var.enable_openclaw ? local.openclaw_station_keys : [])

  # OpenClaw startup behavior may vary by image/runtime profile; keep Terraform from
  # blocking provisioning when a station probe is temporarily unhealthy.
  wait_for_rollout = false

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

          command = ["/bin/sh", "-lc"]
          args = [<<-EOT
            set -eu
            if [ -n "$${OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS:-}" ] && [ "$${OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS}" != "[]" ]; then
              node openclaw.mjs config set gateway.controlUi.allowedOrigins "$${OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS}" --json >/dev/null 2>&1 || true
            fi
            export OPENCLAW_GATEWAY_URL="$${OPENCLAW_GATEWAY_URL:-ws://openclaw-${each.key}:18789}"
            node openclaw.mjs config set gateway.mode remote >/dev/null 2>&1 || true
            node openclaw.mjs config set gateway.remote.url "$${OPENCLAW_GATEWAY_URL}" >/dev/null 2>&1 || true
            if [ -n "$${OPENCLAW_GATEWAY_TOKEN:-}" ]; then
              node openclaw.mjs config set gateway.remote.token "$${OPENCLAW_GATEWAY_TOKEN}" >/dev/null 2>&1 || true
            fi
            exec node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789
          EOT
          ]

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

          env {
            name  = "OPENCLAW_GATEWAY_URL"
            value = "ws://openclaw-${each.key}:18789"
          }

          env {
            name = "OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.openclaw_env[0].metadata[0].name
                key  = "OPENCLAW_CONTROL_UI_ALLOWED_ORIGINS"
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
        annotations = {
          "orchwiz/runtime-jwt-secret-hash" = sha256(local.runtime_jwt_secret)
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

          env {
            name  = "ORCHWIZ_MONITORING_NAMESPACE"
            value = var.monitoring_namespace
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
  }

  lifecycle {
    precondition {
      condition     = trimspace(var.ingress_host) != ""
      error_message = "runtime-edge ingress requires ingress_host to be set."
    }
  }
}

resource "kubernetes_persistent_volume_claim_v1" "vault_inbox" {
  count = var.vault_pvc_enabled ? 1 : 0

  # Most clusters use a StorageClass with `WaitForFirstConsumer`, which can deadlock if
  # Terraform blocks on PVC binding before creating the Deployment. Let the PVC bind
  # asynchronously once the app Pod is scheduled.
  wait_until_bound = false

  metadata {
    name      = "${var.app_name}-vault-inbox"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = var.app_name
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
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
        annotations = {
          "orchwiz/runtime-jwt-secret-hash" = sha256(local.runtime_jwt_secret)
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

  lifecycle {
    precondition {
      condition     = !var.vault_pvc_enabled || var.replicas == 1
      error_message = "vault_pvc_enabled requires replicas=1 (ReadWriteOnce PVC mounted at /app/OWZ-Vault/00-Inbox)."
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

resource "kubernetes_cron_job_v1" "security_audit" {
  count = var.enable_security_audit_cron ? 1 : 0

  metadata {
    name      = "${var.app_name}-security-audit"
    namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = var.app_name
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/profile"           = "cloud_shipyard"
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

# -----------------------------------------------------------------------------
# Grafana (monitoring namespace; app expects grafana.monitoring.svc.cluster.local:3000)
# -----------------------------------------------------------------------------
resource "kubernetes_config_map_v1" "grafana_dashboards" {
  count = var.enable_grafana ? 1 : 0

  metadata {
    name      = local.grafana_dashboards_configmap_name
    namespace = kubernetes_namespace_v1.monitoring[0].metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "grafana"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/component"         = "monitoring"
    }
  }

  data = {
    for file_name, source_path in local.grafana_dashboard_files :
    file_name => file(source_path)
  }
}

resource "helm_release" "grafana" {
  count = var.enable_grafana ? 1 : 0

  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = var.grafana_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name
  timeout    = 900

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

  values = [
    yamlencode({
      "grafana.ini" = {
        auth = {
          disable_login_form   = true
          disable_signout_menu = true
        }
        "auth.anonymous" = {
          enabled  = true
          org_role = "Viewer"
        }
        security = {
          allow_embedding = true
        }
        dashboards = {
          default_home_dashboard_path = "/var/lib/grafana/dashboards/orchwiz/ship-oncall-command-center.json"
        }
      }
      dashboardProviders = {
        "dashboardproviders.yaml" = {
          apiVersion = 1
          providers = [
            {
              name                  = "orchwiz-monitoring"
              orgId                 = 1
              folder                = "OrchWiz Ship Ops"
              type                  = "file"
              disableDeletion       = false
              updateIntervalSeconds = 30
              allowUiUpdates        = false
              options = {
                path                      = "/var/lib/grafana/dashboards/orchwiz"
                foldersFromFilesStructure = false
              }
            }
          ]
        }
      }
      dashboardsConfigMaps = {
        orchwiz = kubernetes_config_map_v1.grafana_dashboards[0].metadata[0].name
      }
      datasources = {
        "datasources.yaml" = {
          apiVersion = 1
          datasources = [
            {
              name      = "Prometheus"
              uid       = "prometheus"
              type      = "prometheus"
              access    = "proxy"
              url       = "http://prometheus-server.${var.monitoring_namespace}.svc.cluster.local:9090"
              isDefault = true
              editable  = false
              jsonData = {
                httpMethod     = "POST"
                manageAlerts   = false
                prometheusType = "Prometheus"
                timeInterval   = "5s"
              }
            }
          ]
        }
      }
    }),
  ]

  depends_on = [kubernetes_config_map_v1.grafana_dashboards]
}

resource "kubernetes_ingress_v1" "grafana" {
  count = var.enable_grafana && var.grafana_ingress_enabled && trimspace(local.grafana_ingress_host) != "" ? 1 : 0

  metadata {
    name        = "${var.app_name}-grafana-ingress"
    namespace   = kubernetes_namespace_v1.monitoring[0].metadata[0].name
    annotations = {}
  }

  spec {
    ingress_class_name = var.ingress_class_name
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
# Prometheus (monitoring namespace; app expects prometheus-server.monitoring.svc.cluster.local:9090)
# -----------------------------------------------------------------------------
resource "kubernetes_secret_v1" "prometheus_metrics_scrape_auth" {
  count = var.enable_prometheus ? 1 : 0

  metadata {
    name      = local.prometheus_metrics_scrape_secret_name
    namespace = kubernetes_namespace_v1.monitoring[0].metadata[0].name
    labels = {
      "app.kubernetes.io/name"    = "prometheus"
      "app.kubernetes.io/part-of" = "orchwiz"
      "orchwiz/component"         = "monitoring"
    }
  }

  type = "Opaque"
  data = {
    "bearer-token" = local.resolved_metrics_bearer_token
  }

  lifecycle {
    precondition {
      condition     = trimspace(local.resolved_metrics_bearer_token) != ""
      error_message = "metrics_bearer_token must be set when enable_prometheus is true."
    }
  }
}

resource "helm_release" "prometheus_blackbox_exporter" {
  count = var.enable_prometheus ? 1 : 0

  name       = "prometheus-blackbox-exporter"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus-blackbox-exporter"
  version    = var.prometheus_blackbox_exporter_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name
  timeout    = 900

  set {
    name  = "fullnameOverride"
    value = "prometheus-blackbox-exporter"
  }

  values = [
    yamlencode({
      config = {
        modules = {
          http_2xx = {
            prober  = "http"
            timeout = "5s"
            http = {
              method                = "GET"
              preferred_ip_protocol = "ip4"
            }
          }
        }
      }
    }),
  ]
}

resource "helm_release" "prometheus" {
  count = var.enable_prometheus ? 1 : 0

  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = var.prometheus_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name
  timeout    = 900

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
    value = var.prometheus_enable_kube_state_metrics ? "true" : "false"
  }
  set {
    name  = "prometheus-node-exporter.enabled"
    value = var.prometheus_enable_node_exporter ? "true" : "false"
  }
  set {
    name  = "prometheus-pushgateway.enabled"
    value = "false"
  }

  values = [
    yamlencode({
      server = {
        extraSecretMounts = [
          {
            name       = "orchwiz-app-metrics-token"
            secretName = kubernetes_secret_v1.prometheus_metrics_scrape_auth[0].metadata[0].name
            mountPath  = local.prometheus_metrics_token_mount_path
            readOnly   = true
          }
        ]
        extraScrapeConfigs = yamlencode(local.prometheus_extra_scrape_configs)
      }
      serverFiles = {
        "alerting_rules.yml" = local.prometheus_alerting_rules
      }
    }),
  ]

  depends_on = [
    kubernetes_secret_v1.prometheus_metrics_scrape_auth,
    helm_release.prometheus_blackbox_exporter,
  ]
}

resource "kubernetes_ingress_v1" "prometheus" {
  count = var.enable_prometheus && var.prometheus_ingress_enabled && trimspace(local.prometheus_ingress_host) != "" ? 1 : 0

  metadata {
    name        = "${var.app_name}-prometheus-ingress"
    namespace   = kubernetes_namespace_v1.monitoring[0].metadata[0].name
    annotations = {}
  }

  spec {
    ingress_class_name = var.ingress_class_name
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
# Loki (monitoring namespace; Grafana datasource at loki:3100)
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
# ClickHouse (monitoring namespace; backend for Langfuse / analytics)
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
# Langfuse (monitoring namespace; in-cluster URL injected into app_env)
# -----------------------------------------------------------------------------
resource "helm_release" "langfuse" {
  count = var.enable_langfuse ? 1 : 0

  name       = "langfuse"
  repository = "https://langfuse.github.io/langfuse-k8s"
  chart      = "langfuse"
  version    = var.langfuse_chart_version
  namespace  = kubernetes_namespace_v1.monitoring[0].metadata[0].name
  timeout    = 1800

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
    value = trimspace(var.langfuse_salt) != "" ? var.langfuse_salt : "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
  }
  set_sensitive {
    name  = "langfuse.nextauth.secret.value"
    value = trimspace(var.langfuse_nextauth_secret) != "" ? var.langfuse_nextauth_secret : "9f88c4048f2d171ef74f14ea61c95cde3d458f38244fdd4fbed9f4e71e74c407"
  }
  set_sensitive {
    name  = "langfuse.encryptionKey.value"
    value = trimspace(var.langfuse_encryption_key) != "" ? var.langfuse_encryption_key : "e4c7f4dc723173fbd2f5f94f5d4a4d98229d6bd76ddd30cd88f9225a4a9de5d3"
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
