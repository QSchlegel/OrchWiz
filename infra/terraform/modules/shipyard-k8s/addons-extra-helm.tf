locals {
  extra_default_namespace = kubernetes_namespace_v1.shipyard.metadata[0].name
}

resource "helm_release" "extra" {
  for_each = var.extra_helm_releases

  name  = each.key
  chart = each.value.chart

  repository = (
    trimspace(coalesce(try(each.value.repository, null), "")) != ""
    ? trimspace(coalesce(try(each.value.repository, null), ""))
    : null
  )

  version = (
    trimspace(coalesce(try(each.value.version, null), "")) != ""
    ? trimspace(coalesce(try(each.value.version, null), ""))
    : null
  )

  namespace = (
    trimspace(coalesce(try(each.value.namespace, null), "")) != ""
    ? trimspace(coalesce(try(each.value.namespace, null), ""))
    : local.extra_default_namespace
  )

  create_namespace  = coalesce(try(each.value.create_namespace, null), false)
  atomic            = coalesce(try(each.value.atomic, null), false)
  cleanup_on_fail   = coalesce(try(each.value.cleanup_on_fail, null), true)
  dependency_update = coalesce(try(each.value.dependency_update, null), false)
  timeout           = coalesce(try(each.value.timeout_seconds, null), 600)

  values = trimspace(coalesce(try(each.value.values_yaml, null), "")) != "" ? [coalesce(try(each.value.values_yaml, null), "")] : []

  dynamic "set" {
    for_each = try(tomap(each.value.set), {})

    content {
      name  = set.key
      value = set.value
    }
  }

  dynamic "set_sensitive" {
    for_each = try(tomap(each.value.set_sensitive), {})

    content {
      name  = set_sensitive.key
      value = set_sensitive.value
    }
  }
}

resource "kubernetes_ingress_v1" "extra" {
  for_each = var.extra_ingresses

  metadata {
    name = "${var.app_name}-${each.key}-addon-ingress"
    namespace = (
      trimspace(coalesce(try(each.value.namespace, null), "")) != ""
      ? trimspace(coalesce(try(each.value.namespace, null), ""))
      : local.extra_default_namespace
    )
    annotations = try(tomap(each.value.annotations), {})
  }

  spec {
    ingress_class_name = (
      trimspace(coalesce(try(each.value.ingress_class_name, null), "")) != ""
      ? trimspace(coalesce(try(each.value.ingress_class_name, null), ""))
      : var.ingress_class_name
    )

    rule {
      host = (
        trimspace(coalesce(try(each.value.host, null), "")) != ""
        ? trimspace(coalesce(try(each.value.host, null), ""))
        : (
          trimspace(var.ingress_host) != ""
          ? "${each.key}.${trimspace(var.ingress_host)}"
          : ""
        )
      )

      http {
        path {
          path = (
            trimspace(coalesce(try(each.value.path, null), "")) != ""
            ? trimspace(coalesce(try(each.value.path, null), ""))
            : "/"
          )
          path_type = (
            trimspace(coalesce(try(each.value.path_type, null), "")) != ""
            ? trimspace(coalesce(try(each.value.path_type, null), ""))
            : "Prefix"
          )

          backend {
            service {
              name = each.value.service_name
              port {
                number = each.value.service_port
              }
            }
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = trimspace(coalesce(try(each.value.host, null), "")) != "" || trimspace(var.ingress_host) != ""
      error_message = "extra_ingresses[\"${each.key}\"] requires host or ingress_host to be set."
    }

    precondition {
      condition = trimspace(
        (
          trimspace(coalesce(try(each.value.host, null), "")) != ""
          ? trimspace(coalesce(try(each.value.host, null), ""))
          : (
            trimspace(var.ingress_host) != ""
            ? "${each.key}.${trimspace(var.ingress_host)}"
            : ""
          )
        )
      ) != ""
      error_message = "extra_ingresses[\"${each.key}\"] requires a non-empty host."
    }

    precondition {
      condition = startswith(
        (
          trimspace(coalesce(try(each.value.path, null), "")) != ""
          ? trimspace(coalesce(try(each.value.path, null), ""))
          : "/"
        ),
        "/"
      )
      error_message = "extra_ingresses[\"${each.key}\"] path must start with '/'."
    }
  }
}
