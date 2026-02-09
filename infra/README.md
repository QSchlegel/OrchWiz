# Infra: Starship and Shipyard

This folder contains Terraform + Ansible scaffolding for two deployment profiles:

- `Local Starship Build`: Minikube-first local stack with in-cluster PostgreSQL.
- `Cloud Shipyard`: Provider-agnostic deployment to an existing Kubernetes cluster.

## Layout

- `terraform/modules/starship-minikube`: local module (app + PostgreSQL + service).
- `terraform/modules/shipyard-k8s`: cloud module (app resources, optional ingress).
- `terraform/environments/starship-local`: wiring for Minikube context.
- `terraform/environments/shipyard-cloud`: wiring for existing cloud cluster context.
- `ansible/playbooks/starship_local.yml`: local deploy workflow.
- `ansible/playbooks/shipyard_cloud.yml`: cloud deploy workflow.

## Quick Start: Local Starship (Minikube)

1. Copy vars template:
   - `cp infra/terraform/environments/starship-local/terraform.tfvars.example infra/terraform/environments/starship-local/terraform.tfvars`
2. Fill secrets/image.
3. Apply with Terraform:
   - `terraform -chdir=infra/terraform/environments/starship-local init -backend=false`
   - `terraform -chdir=infra/terraform/environments/starship-local apply`
4. Or run the Ansible wrapper:
   - `ansible-playbook -i infra/ansible/inventory/local.ini.example infra/ansible/playbooks/starship_local.yml`
5. Get URL:
   - `minikube service -n orchwiz-starship orchwiz --url`

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
