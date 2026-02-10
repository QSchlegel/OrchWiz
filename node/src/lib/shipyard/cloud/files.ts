import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { CloudProviderConfig } from "@/lib/shipyard/cloud/types"

const TERRAFORM_PROVIDER_PATH = "infra/terraform/environments/shipyard-cloud/providers.tf"
const TERRAFORM_MAIN_PATH = "infra/terraform/environments/shipyard-cloud/main.tf"
const TERRAFORM_VARIABLES_PATH = "infra/terraform/environments/shipyard-cloud/variables.tf"
const TERRAFORM_TFVARS_PATH = "infra/terraform/environments/shipyard-cloud/terraform.tfvars"
const ANSIBLE_INVENTORY_PATH = "infra/ansible/inventory/cloud.ini"
const ANSIBLE_PLAYBOOK_PATH = "infra/ansible/playbooks/shipyard_cloud.yml"

export const SHIPYARD_CLOUD_FILE_ALLOWLIST = [
  TERRAFORM_PROVIDER_PATH,
  TERRAFORM_MAIN_PATH,
  TERRAFORM_VARIABLES_PATH,
  TERRAFORM_TFVARS_PATH,
  ANSIBLE_INVENTORY_PATH,
  ANSIBLE_PLAYBOOK_PATH,
] as const

export type ShipyardCloudEditablePath = (typeof SHIPYARD_CLOUD_FILE_ALLOWLIST)[number]

export interface ShipyardCloudEditableFile {
  path: ShipyardCloudEditablePath
  absolutePath: string
  exists: boolean
  updatedAt: string | null
  content: string
}

function repoRoot(): string {
  const override = process.env.ORCHWIZ_REPO_ROOT?.trim()
  if (override) {
    return resolve(override)
  }

  return resolve(process.cwd(), "..")
}

const allowlistedAbsolutePathMap = new Map(
  SHIPYARD_CLOUD_FILE_ALLOWLIST.map((relativePath) => [resolve(repoRoot(), relativePath), relativePath]),
)

function resolveAllowlistedPath(path: string): {
  absolutePath: string
  relativePath: ShipyardCloudEditablePath
} {
  const absolutePath = resolve(repoRoot(), path)
  const allowlistedRelativePath = allowlistedAbsolutePathMap.get(absolutePath)
  if (!allowlistedRelativePath) {
    throw new Error("Path is not in the Ship Yard cloud allowlist.")
  }

  return {
    absolutePath,
    relativePath: allowlistedRelativePath,
  }
}

function quoteForTf(value: string): string {
  return JSON.stringify(value)
}

function renderProvidersFile(): string {
  return `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = ">= 1.48.0"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}
`
}

function renderVariablesFile(): string {
  return `variable "hcloud_token" {
  type        = string
  description = "Hetzner Cloud API token"
  sensitive   = true
}

variable "cluster_name" {
  type        = string
  description = "Cluster base name"
}

variable "location" {
  type        = string
  description = "Hetzner location (e.g. nbg1, fsn1, hel1)"
}

variable "image" {
  type        = string
  description = "Hetzner image (e.g. ubuntu-24.04)"
}

variable "network_cidr" {
  type        = string
  description = "Cluster network CIDR"
}

variable "control_plane_type" {
  type        = string
  description = "Hetzner server type for control plane"
}

variable "control_plane_count" {
  type        = number
  description = "Number of control-plane nodes"
}

variable "worker_type" {
  type        = string
  description = "Hetzner server type for worker nodes"
}

variable "worker_count" {
  type        = number
  description = "Number of worker nodes"
}

variable "ssh_public_key" {
  type        = string
  description = "Public SSH key used for server login"
}

variable "k3s_channel" {
  type        = string
  description = "K3s channel (stable/testing/latest)"
  default     = "stable"
}

variable "k3s_disable_traefik" {
  type        = bool
  description = "Disable Traefik in the default K3s install"
  default     = true
}
`
}

function renderMainFile(config: CloudProviderConfig): string {
  return `resource "hcloud_ssh_key" "shipyard" {
  name       = "${config.cluster.clusterName}-orchwiz"
  public_key = var.ssh_public_key
}

resource "hcloud_network" "cluster" {
  name     = "${config.cluster.clusterName}-net"
  ip_range = var.network_cidr
}

resource "hcloud_network_subnet" "cluster" {
  network_id   = hcloud_network.cluster.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = var.network_cidr
}

resource "hcloud_server" "control_plane" {
  count       = var.control_plane_count
  name        = "${config.cluster.clusterName}-cp-${"${count.index + 1}"}"
  image       = var.image
  server_type = var.control_plane_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.shipyard.id]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  network {
    network_id = hcloud_network.cluster.id
  }

  labels = {
    role      = "control-plane"
    cluster   = var.cluster_name
    orchwiz   = "shipyard"
    stackmode = "full-support-systems"
  }
}

resource "hcloud_server" "worker" {
  count       = var.worker_count
  name        = "${config.cluster.clusterName}-worker-${"${count.index + 1}"}"
  image       = var.image
  server_type = var.worker_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.shipyard.id]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  network {
    network_id = hcloud_network.cluster.id
  }

  labels = {
    role      = "worker"
    cluster   = var.cluster_name
    orchwiz   = "shipyard"
    stackmode = "full-support-systems"
  }
}

output "control_plane_public_ipv4" {
  value = [for server in hcloud_server.control_plane : server.ipv4_address]
}

output "control_plane_private_ipv4" {
  value = [for server in hcloud_server.control_plane : server.network[0].ip]
}

output "worker_public_ipv4" {
  value = [for server in hcloud_server.worker : server.ipv4_address]
}

output "worker_private_ipv4" {
  value = [for server in hcloud_server.worker : server.network[0].ip]
}
`
}

function renderTfvarsFile(args: {
  config: CloudProviderConfig
  sshPublicKey: string
}): string {
  const { config, sshPublicKey } = args
  return `# Generated by OrchWiz Ship Yard cloud utility
# Replace hcloud_token before running terraform.

hcloud_token        = ""
cluster_name        = ${quoteForTf(config.cluster.clusterName)}
location            = ${quoteForTf(config.cluster.location)}
image               = ${quoteForTf(config.cluster.image)}
network_cidr        = ${quoteForTf(config.cluster.networkCidr)}
control_plane_type  = ${quoteForTf(config.cluster.controlPlane.machineType)}
control_plane_count = ${config.cluster.controlPlane.count}
worker_type         = ${quoteForTf(config.cluster.workers.machineType)}
worker_count        = ${config.cluster.workers.count}
ssh_public_key      = ${quoteForTf(sshPublicKey)}
k3s_channel         = ${quoteForTf(config.k3s.channel)}
k3s_disable_traefik = ${String(config.k3s.disableTraefik)}
`
}

function renderInventoryFile(config: CloudProviderConfig): string {
  return `# Generated by OrchWiz Ship Yard cloud utility
# Fill this file after terraform apply using output IP addresses.

[control_plane]
${config.cluster.clusterName}-cp-1 ansible_host=<CONTROL_PLANE_PUBLIC_IP> ansible_user=root ansible_port=22

[workers]
${config.cluster.clusterName}-worker-1 ansible_host=<WORKER_PUBLIC_IP_1> ansible_user=root ansible_port=22

[k3s_cluster:children]
control_plane
workers
`
}

function renderPlaybookFile(config: CloudProviderConfig): string {
  return `---
- name: Bootstrap K3s control plane for OrchWiz Starship
  hosts: control_plane
  become: true
  gather_facts: true
  vars:
    k3s_channel: "${config.k3s.channel}"
    disable_traefik: ${String(config.k3s.disableTraefik).toLowerCase()}
  tasks:
    - name: Install K3s server
      ansible.builtin.shell: |
        curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL={{ k3s_channel }} sh -s - ${config.k3s.disableTraefik ? "--disable traefik" : ""}
      args:
        creates: /usr/local/bin/k3s

    - name: Read K3s node token
      ansible.builtin.slurp:
        src: /var/lib/rancher/k3s/server/node-token
      register: k3s_token

    - name: Share K3s token
      ansible.builtin.set_fact:
        shared_k3s_token: "{{ k3s_token.content | b64decode | trim }}"

- name: Join K3s workers
  hosts: workers
  become: true
  gather_facts: true
  tasks:
    - name: Install K3s agent
      ansible.builtin.shell: |
        curl -sfL https://get.k3s.io | K3S_URL=https://{{ hostvars[groups['control_plane'][0]].ansible_host }}:6443 K3S_TOKEN={{ hostvars[groups['control_plane'][0]].shared_k3s_token }} sh -
      args:
        creates: /usr/local/bin/k3s-agent

- name: Deploy OrchWiz full support systems
  hosts: control_plane
  become: true
  gather_facts: true
  tasks:
    - name: Ensure namespace exists
      ansible.builtin.shell: |
        KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl create namespace orchwiz-starship --dry-run=client -o yaml | KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl apply -f -
      changed_when: false

    - name: Apply runtime + observability stack placeholder
      ansible.builtin.debug:
        msg: >-
          Full-stack mode enabled: deploy bridge crew services, runtime systems, and observability components from Ship Yard manifests.
`
}

export function renderHetznerFileBundle(args: {
  config: CloudProviderConfig
  sshPublicKey: string
}): Record<ShipyardCloudEditablePath, string> {
  return {
    [TERRAFORM_PROVIDER_PATH]: renderProvidersFile(),
    [TERRAFORM_MAIN_PATH]: renderMainFile(args.config),
    [TERRAFORM_VARIABLES_PATH]: renderVariablesFile(),
    [TERRAFORM_TFVARS_PATH]: renderTfvarsFile({
      config: args.config,
      sshPublicKey: args.sshPublicKey,
    }),
    [ANSIBLE_INVENTORY_PATH]: renderInventoryFile(args.config),
    [ANSIBLE_PLAYBOOK_PATH]: renderPlaybookFile(args.config),
  }
}

export async function readShipyardCloudEditableFiles(
  paths: ShipyardCloudEditablePath[] = [...SHIPYARD_CLOUD_FILE_ALLOWLIST],
): Promise<ShipyardCloudEditableFile[]> {
  return Promise.all(
    paths.map(async (path) => {
      const { absolutePath, relativePath } = resolveAllowlistedPath(path)
      try {
        const [content, fileStat] = await Promise.all([
          readFile(absolutePath, "utf8"),
          stat(absolutePath),
        ])

        return {
          path: relativePath,
          absolutePath,
          exists: true,
          updatedAt: fileStat.mtime.toISOString(),
          content,
        }
      } catch {
        return {
          path: relativePath,
          absolutePath,
          exists: false,
          updatedAt: null,
          content: "",
        }
      }
    }),
  )
}

export async function writeShipyardCloudEditableFiles(args: {
  files: Array<{
    path: string
    content: string
  }>
}): Promise<ShipyardCloudEditableFile[]> {
  const writes = args.files.map(async (file) => {
    const { absolutePath, relativePath } = resolveAllowlistedPath(file.path)
    await mkdir(dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, file.content, "utf8")
    const fileStat = await stat(absolutePath)

    return {
      path: relativePath,
      absolutePath,
      exists: true,
      updatedAt: fileStat.mtime.toISOString(),
      content: file.content,
    }
  })

  return Promise.all(writes)
}
