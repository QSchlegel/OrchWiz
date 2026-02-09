# Infra: Starship and Shipyard

This folder contains Terraform + Ansible scaffolding for two deployment profiles:

- `Local Starship Build`: local Kubernetes stack with in-cluster PostgreSQL (`kind` default, `minikube` optional).
- `Cloud Shipyard`: Provider-agnostic deployment to an existing Kubernetes cluster.

## Layout

- `terraform/modules/starship-minikube`: local module (app + PostgreSQL + service).
- `terraform/modules/shipyard-k8s`: cloud module (app resources, optional ingress).
- `terraform/environments/starship-local`: local wiring controlled by `infrastructure_kind` (`kind|minikube`).
- `terraform/environments/shipyard-cloud`: wiring for existing cloud cluster context.
- `ansible/playbooks/starship_local.yml`: local deploy workflow.
- `ansible/playbooks/shipyard_cloud.yml`: cloud deploy workflow.

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
- Local provisioning command execution still requires `ENABLE_LOCAL_COMMAND_EXECUTION=true`.
- Kube context presence is validated before provisioning; cluster auto-create/start is not performed.

## Quick Start: Cloud Shipyard (Existing Kubernetes)

1. Copy vars template:
   - `cp infra/terraform/environments/shipyard-cloud/terraform.tfvars.example infra/terraform/environments/shipyard-cloud/terraform.tfvars`
2. Set `kube_context`, image, URLs, and secrets.
3. Apply with Terraform:
   - `terraform -chdir=infra/terraform/environments/shipyard-cloud init -backend=false`
   - `terraform -chdir=infra/terraform/environments/shipyard-cloud apply`
4. Or run the Ansible wrapper:
   - `ansible-playbook -i infra/ansible/inventory/cloud.ini.example infra/ansible/playbooks/shipyard_cloud.yml`

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
