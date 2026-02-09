# Deployment Guide

## Overview

This guide covers deploying Orchwiz nodes both locally and in the cloud.

## Deployment Profiles

OrchWiz supports two explicit deployment profiles:

- `Local Starship Build`: local Minikube-first flow using Terraform + Ansible.
- `Cloud Shipyard`: cloud Kubernetes flow using Terraform + Ansible against an existing cluster.

## Local Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL database
- GitHub OAuth app credentials

### Steps

1. **Clone and Install**
   ```bash
   cd node
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Run Development Server**
   ```bash
   npm run dev
   ```

5. **Access Application**
   - Open http://localhost:3000

### Local Starship Build (Minikube + Terraform + Ansible)

1. Copy Terraform vars:
   ```bash
   cp infra/terraform/environments/starship-local/terraform.tfvars.example infra/terraform/environments/starship-local/terraform.tfvars
   ```
2. Configure image + secrets in `terraform.tfvars`.
3. Apply Terraform:
   ```bash
   terraform -chdir=infra/terraform/environments/starship-local init -backend=false
   terraform -chdir=infra/terraform/environments/starship-local apply
   ```
4. Or run via Ansible wrapper:
   ```bash
   ansible-playbook -i infra/ansible/inventory/local.ini.example infra/ansible/playbooks/starship_local.yml
   ```
5. Get endpoint:
   ```bash
   minikube service -n orchwiz-starship orchwiz --url
   ```

## Cloud Deployment with Cloudflare

See the [[../cloudflare-local/README|cloudflare-local README]] for Docker Compose deployment using cloudflared.

### Key Components
- PostgreSQL database container
- Next.js application container
- Cloudflared tunnel for public access

## Cloud Shipyard (Existing Kubernetes + Terraform + Ansible)

1. Copy Terraform vars:
   ```bash
   cp infra/terraform/environments/shipyard-cloud/terraform.tfvars.example infra/terraform/environments/shipyard-cloud/terraform.tfvars
   ```
2. Configure:
   - `kube_context`
   - app image tag
   - auth/public URLs
   - database secret strategy (`database_url` or pre-existing secret name)
3. Apply Terraform:
   ```bash
   terraform -chdir=infra/terraform/environments/shipyard-cloud init -backend=false
   terraform -chdir=infra/terraform/environments/shipyard-cloud apply
   ```
4. Or run via Ansible wrapper:
   ```bash
   ansible-playbook -i infra/ansible/inventory/cloud.ini.example infra/ansible/playbooks/shipyard_cloud.yml
   ```

## Environment Variables

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `GITHUB_CLIENT_ID` - GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - GitHub OAuth client secret
- `BETTER_AUTH_SECRET` - Random secret for auth
- `BETTER_AUTH_URL` - Auth callback URL
- `NEXT_PUBLIC_APP_URL` - Public application URL

## Database Migrations

```bash
# Create a new migration
npm run db:migrate

# Push schema changes without migration
npm run db:push

# Open Prisma Studio
npm run db:studio
```

## Production Build

```bash
npm run build
npm start
```

## Related Notes

- [[Node-Concept]] - Understanding node architecture
- [[Local-Node]] - Local node setup
- [[Cloud-Node]] - Cloud node setup
- [[Data-Forwarding]] - Configuring data forwarding
