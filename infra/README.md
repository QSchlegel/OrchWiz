# Infra: Starship and Shipyard

This folder contains Terraform + Ansible scaffolding for two deployment profiles:

- `Local Starship Build`: local Kubernetes stack with in-cluster PostgreSQL (`kind` default, `minikube` optional).
- `Cloud Shipyard`: Provider-agnostic deployment to an existing Kubernetes cluster.

Both profiles now support an optional internal Spacebot runtime service for `spacebot-webhook` adapter rollout.

## Layout

- `terraform/modules/starship-minikube`: local module (app + PostgreSQL + service).
- `terraform/modules/shipyard-k8s`: cloud module (app resources, optional ingress).
- `terraform/environments/starship-local`: local wiring controlled by `infrastructure_kind` (`kind|minikube`).
- `terraform/environments/shipyard-cloud`: wiring for existing cloud cluster context.
- `ansible/playbooks/starship_local.yml`: local deploy workflow.
- `ansible/playbooks/shipyard_cloud.yml`: cloud deploy workflow.

Spacebot controls are available in both module stacks via:

- `enable_spacebot`
- `spacebot_image`
- `spacebot_app_port` (default `19898`)
- `spacebot_webhook_port` (default `18789`)
- `spacebot_storage_size`
- `spacebot_env`

## Vendor Dependencies

- Initialize vendored infra dependencies (including KubeView chart source):
  - `git submodule update --init --recursive infra/vendor/kubeview`

## Quick Start: Local Starship (KIND default, Minikube optional)

1. Copy vars template:
   - `cp infra/terraform/environments/starship-local/terraform.tfvars.example infra/terraform/environments/starship-local/terraform.tfvars`
   - If needed, copy inventory template: `cp infra/ansible/inventory/local.ini.example infra/ansible/inventory/local.ini`
2. Fill secrets/image and choose local cluster kind:
   - default: `infrastructure_kind = "kind"` with `kube_context = "kind-orchwiz"`
   - alternative: `infrastructure_kind = "minikube"` with `kube_context = "minikube"`
3. Apply with Terraform:
   - `terraform -chdir=infra/terraform/environments/starship-local init -backend=false`
   - `terraform -chdir=infra/terraform/environments/starship-local apply`
4. Or run the Ansible wrapper:
   - `ansible-playbook -i infra/ansible/inventory/local.ini.example infra/ansible/playbooks/starship_local.yml`
5. Access endpoint:
   - KIND: `kubectl -n orchwiz-starship port-forward svc/orchwiz 3000:3000`
   - Minikube: `minikube service -n orchwiz-starship orchwiz --url`

### Ship Yard Local Launch Notes

- The app server local-launch path is fail-fast: it requires `terraform.tfvars`, Ansible inventory, and playbook paths to exist.
- Missing files are reported with copy-ready remediation commands; files are not auto-generated.
- `saneBootstrap` can assist with CLI auto-install only when `ENABLE_LOCAL_INFRA_AUTO_INSTALL=true`.
- For `kind`, `saneBootstrap=true` uses a docker-first flow to bootstrap app image delivery:
  - Build context defaults to `node/` using `node/Dockerfile.shipyard`
  - `node/.dockerignore` trims build context for faster local loops
  - Image runs a local-friendly Next dev server for bootstrap stability
  - Image tag defaults to `orchwiz:local-dev`
  - Image is loaded into the target kind cluster before Terraform/Ansible
  - Controls: `LOCAL_SHIPYARD_AUTO_BUILD_APP_IMAGE`, `LOCAL_SHIPYARD_AUTO_CREATE_KIND_CLUSTER`, `LOCAL_SHIPYARD_FORCE_REBUILD_APP_IMAGE`, `LOCAL_SHIPYARD_APP_IMAGE`, `LOCAL_SHIPYARD_DOCKERFILE`, `LOCAL_SHIPYARD_DOCKER_CONTEXT`, `LOCAL_SHIPYARD_KIND_CLUSTER_NAME`
- Local provisioning command execution still requires `ENABLE_LOCAL_COMMAND_EXECUTION=true`.
- Kube context presence is validated before provisioning; when `LOCAL_SHIPYARD_AUTO_CREATE_KIND_CLUSTER=true` (default) and the target kind cluster is missing, Ship Yard creates it before loading the app image.
- PostgreSQL Helm release uses the Bitnami OCI repo (`oci://registry-1.docker.io/bitnamicharts`) in `terraform/modules/starship-minikube/main.tf`.
- `postgres_chart_version` is pinned in `terraform/modules/starship-minikube/variables.tf`; keep it current and run `terraform init -upgrade -backend=false` when chart fetch behavior changes upstream.

Debug loop helper:

- `cd node && SHIPYARD_BEARER_TOKEN=owz_shipyard_v1.<keyId>.<secret> npm run shipyard:local:debug`

## Quick Start: Cloud Shipyard (Existing Kubernetes)

1. Copy vars template:
   - `cp infra/terraform/environments/shipyard-cloud/terraform.tfvars.example infra/terraform/environments/shipyard-cloud/terraform.tfvars`
2. Set `kube_context`, image, URLs, and secrets.
3. Apply with Terraform:
   - `terraform -chdir=infra/terraform/environments/shipyard-cloud init -backend=false`
   - `terraform -chdir=infra/terraform/environments/shipyard-cloud apply`
4. Or run the Ansible wrapper:
   - `ansible-playbook -i infra/ansible/inventory/cloud.ini.example infra/ansible/playbooks/shipyard_cloud.yml`

## Spacebot Runtime Service (Internal-Only Defaults)

- Spacebot deployment is optional and disabled by default (`enable_spacebot = false`).
- When enabled, Terraform provisions:
  - `Secret` for env wiring
  - `PersistentVolumeClaim`
  - `Deployment`
  - `ClusterIP` service (no ingress by default)
- App env is wired with `SPACEBOT_WEBHOOK_BASE_URL` to internal service DNS.
- Public exposure requires explicit ingress opt-in outside default templates.

## KubeView

- KubeView is deployed by default in both profiles (`enable_kubeview = true`).
- Deployment scope is whole cluster by default (`kubeview_single_namespace = false`).
- Local profile:
  - Ingress exposure is opt-in (`kubeview_ingress_enabled = false` by default).
  - Default host pattern when ingress is enabled: `kubeview.<namespace>.localhost`.
- Cloud profile:
  - KubeView ingress is enabled by default and mounted at `/kubeview`.
  - Path-prefix hosting uses nginx regex rewrite (`/kubeview(/|$)(.*)` -> `/$2`).
  - Ingress auth annotations are required when `kubeview_ingress_auth_required = true`.
  - Configure `kubeview_ingress_auth_annotations` in `terraform.tfvars` (see example values in `infra/terraform/environments/shipyard-cloud/terraform.tfvars.example`).

## Monitoring stack (Grafana, Prometheus, Loki, ClickHouse, Langfuse)

When enabled via Terraform variables, the following observability components are provisioned in a **monitoring** namespace:

- **Grafana** (port 3000), **Prometheus** (port 9090), **Loki** (port 3100), **ClickHouse** (backend), **Langfuse** (port 3000).

The OrchWiz app uses **in-cluster** service URLs when running inside the cluster (e.g. `grafana.monitoring.svc.cluster.local:3000`, `prometheus-server.monitoring.svc.cluster.local:9090`, `loki.monitoring.svc.cluster.local:3100`, `langfuse.monitoring.svc.cluster.local:3000`). No change is required for in-cluster app deployments.

### Persistence and storage

- Loki and ClickHouse support optional persistent volumes; enable via `loki_persistence_enabled` / `clickhouse_persistence_enabled` and set `loki_storage_size` / `clickhouse_storage_size` (e.g. `10Gi`).
- If the cluster has no default StorageClass, PVCs will stay Pending. Set `monitoring_storage_class` to an existing StorageClass name when needed.

### Local dev with app on host

When the OrchWiz app runs **outside** the cluster (e.g. local Next.js on your machine pointing at a minikube/kind cluster), it cannot reach in-cluster URLs. Either:

- **Port-forward** the monitoring services and set env overrides: `GRAFANA_UPSTREAM_URL`, `PROMETHEUS_UPSTREAM_URL`, `LOKI_UPSTREAM_URL` (e.g. `http://127.0.0.1:3000` after `kubectl port-forward -n monitoring svc/grafana 3000:3000`), or
- Use the app’s API proxy routes (`/api/bridge/runtime-ui/grafana`, `/api/bridge/runtime-ui/prometheus`, `/api/bridge/runtime-ui/loki`) with the same port-forwards; the proxy will use the upstream URLs when set.

### Langfuse keys (bootstrap)

- **LANGFUSE_BASE_URL** is always set by Terraform to the **in-cluster** service URL (e.g. `http://langfuse.monitoring.svc.cluster.local:3000`). The app and Langfuse client use this for server-to-Langfuse traffic; optional ingress is only for direct browser access.
- **LANGFUSE_PUBLIC_KEY** and **LANGFUSE_SECRET_KEY** are created in the Langfuse UI after first deploy. One-time bootstrap: deploy Langfuse (e.g. `enable_langfuse = true`), open the Langfuse UI (via ingress or port-forward), create a project, then copy the project keys into Terraform (sensitive variables `langfuse_public_key` / `langfuse_secret_key`) or into the app env so tracing and the proxy work.

Variables and commented examples live in `terraform.tfvars.example` for both **starship-local** and **shipyard-cloud**.

## Helm Add-ons

Both deployment profiles support installing additional Helm charts via Terraform without changing the core modules:

- `extra_helm_releases`: install arbitrary Helm releases (OCI or non-OCI).
- `extra_ingresses`: optionally expose add-ons via Kubernetes Ingress.

### Extra Helm Releases

Add to either:

- `infra/terraform/environments/starship-local/terraform.tfvars`
- `infra/terraform/environments/shipyard-cloud/terraform.tfvars`

Example: install ServiceRadar from its published OCI chart (recommended) and disable its built-in ingress.
ServiceRadar’s web UI is Next.js-based; expose it on a dedicated subdomain (not a path prefix) to avoid `/_next/*` collisions.

```hcl
extra_helm_releases = {
  serviceradar = {
    repository      = "oci://ghcr.io/carverauto/charts"
    chart           = "serviceradar"
    version         = "1.0.75"
    timeout_seconds = 1200
    set = {
      "global.imageTag" = "v1.0.75"
      "ingress.enabled" = "false"
      "image.registryPullSecret" = ""
    }
  }
}

extra_ingresses = {
  serviceradar = {
    # Host defaults:
    # - starship: serviceradar.<namespace>.localhost
    # - shipyard: serviceradar.<ingress_host>
    path         = "/"
    service_name = "serviceradar-web"
    service_port = 3000
    annotations  = {}
  }
}
```

### ServiceRadar Admin Password

When the ServiceRadar chart’s secret generator is enabled (default), it creates `serviceradar-secrets`.
Retrieve the admin password:

```bash
kubectl -n <namespace> get secret serviceradar-secrets -o jsonpath='{.data.admin-password}' | base64 --decode
```

## Notes

- These templates are additive scaffolding and expect you to provide production-ready secrets and image tags.
- `Cloud Shipyard` assumes the cluster already exists and is reachable from your kubeconfig context.

## Wallet Enclave Sidecar Pattern

Bridge-agent message signing and private-memory encryption use a local wallet enclave process.

- Deploy the enclave as a sidecar in the same pod as the agent/runtime container.
- Agent container calls `http://127.0.0.1:3377` only.
- Mnemonic and wallet provider secrets must be mounted only in enclave container.
- Optional shared-secret header (`x-wallet-enclave-token`) should be enabled with `WALLET_ENCLAVE_SHARED_SECRET`.
- No external ingress/service exposure is required for enclave endpoints.

### Sidecar Hardening Checklist

1. Keep enclave service `ClusterIP` internal-only (or sidecar-only with no Service).
2. Use NetworkPolicy to deny cross-pod access to enclave port.
3. Mount `CARDANO_MNEMONIC` and `WALLET_ENCLAVE_MASTER_SECRET` in enclave container only.
4. Do not set mnemonic/env secrets in app deployment container.
