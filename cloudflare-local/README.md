# Cloudflare Local Deployment

This directory contains a Docker Compose setup for deploying Orchwiz with Cloudflare Tunnel for public access.

## Overview

The deployment includes:
- **PostgreSQL**: Database for the application
- **Next.js**: The Orchwiz application server
- **Cloudflared**: Cloudflare Tunnel for secure public access

## Prerequisites

- Docker and Docker Compose installed
- Cloudflare account with Zero Trust access
- GitHub OAuth app credentials

## Setup Instructions

### 1. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and configure:

#### Required Variables

- `POSTGRES_USER`: PostgreSQL username (default: orchwiz)
- `POSTGRES_PASSWORD`: PostgreSQL password (change from default!)
- `POSTGRES_DB`: Database name (default: orchis)
- `DATABASE_URL`: Full PostgreSQL connection string
- `BETTER_AUTH_SECRET`: Random secret (minimum 32 characters)
- `BETTER_AUTH_URL`: Internal service URL (http://nextjs:3000)
- `NEXT_PUBLIC_APP_URL`: Public URL from Cloudflare tunnel
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret
- `CLOUDFLARE_TUNNEL_TOKEN`: Cloudflare tunnel token

### 2. Set Up Cloudflare Tunnel

#### Option A: Using Tunnel Token (Recommended)

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** > **Tunnels**
3. Click **Create a tunnel**
4. Select **Cloudflared** as the connector
5. Give your tunnel a name (e.g., `orchwiz-tunnel`)
6. Copy the **Tunnel Token**
7. Paste the token into your `.env` file as `CLOUDFLARE_TUNNEL_TOKEN`

#### Option B: Using Config File

If you prefer using a config file instead of a token:

1. Create a tunnel in Cloudflare Zero Trust
2. Download the credentials file
3. Place it at `cloudflared/credentials.json`
4. Update `cloudflared/config.yml` with your tunnel ID and hostname

### 3. Configure GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set **Authorization callback URL** to: `https://your-tunnel-url.trycloudflare.com/api/auth/callback/github`
4. Copy the **Client ID** and **Client Secret**
5. Add them to your `.env` file

### 4. Initialize Database

Before starting the services, you need to set up the database schema:

```bash
# Start only PostgreSQL first
docker-compose up -d postgres

# Wait for PostgreSQL to be ready, then run migrations
docker-compose exec nextjs npx prisma generate
docker-compose exec nextjs npx prisma db push

# Or if you prefer to run migrations from your local machine:
cd ../node
npx prisma generate
npx prisma db push
```

### 5. Start Services

Start all services:

```bash
docker-compose up -d
```

View logs:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f nextjs
docker-compose logs -f cloudflared
```

### 6. Access the Application

Once the tunnel is running, Cloudflare will provide a URL like:
`https://orchwiz-tunnel-xxxxx.trycloudflare.com`

Access the application at this URL.

## Service Details

### PostgreSQL

- **Internal Port**: 5432
- **External Port**: 5432 (accessible from host)
- **Data Persistence**: Stored in Docker volume `postgres_data`
- **Health Check**: Automatic with retries

### Next.js

- **Internal Port**: 3000
- **External Port**: 3000 (accessible from host for local testing)
- **Build**: Multi-stage Docker build
- **Health Check**: Checks `/api/health` endpoint

### Cloudflared

- **Configuration**: `cloudflared/config.yml`
- **Tunnel**: Routes traffic to Next.js service
- **Public Access**: Via Cloudflare tunnel URL

## Common Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
```

### Rebuild Services
```bash
docker-compose build --no-cache
docker-compose up -d
```

### Access Database
```bash
docker-compose exec postgres psql -U orchwiz -d orchis
```

### Run Prisma Commands
```bash
docker-compose exec nextjs npx prisma studio
docker-compose exec nextjs npx prisma db push
docker-compose exec nextjs npx prisma migrate dev
```

### Clean Up (Remove volumes)
```bash
docker-compose down -v
```

## Troubleshooting

### Database Connection Issues

If Next.js can't connect to PostgreSQL:

1. Check that PostgreSQL is healthy:
   ```bash
   docker-compose ps
   ```

2. Verify DATABASE_URL in `.env` matches PostgreSQL credentials

3. Check PostgreSQL logs:
   ```bash
   docker-compose logs postgres
   ```

### Cloudflare Tunnel Not Working

1. Verify tunnel token is correct in `.env`

2. Check cloudflared logs:
   ```bash
   docker-compose logs cloudflared
   ```

3. Ensure Next.js is running and healthy:
   ```bash
   docker-compose logs nextjs
   ```

### Next.js Build Failures

1. Check Docker build logs:
   ```bash
   docker-compose build nextjs
   ```

2. Verify all dependencies are in `package.json`

3. Check Prisma generation:
   ```bash
   docker-compose exec nextjs npx prisma generate
   ```

### Port Conflicts

If ports 3000 or 5432 are already in use:

1. Stop conflicting services, or
2. Modify port mappings in `docker-compose.yml`:
   ```yaml
   ports:
     - "3001:3000"  # Change external port
   ```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_USER` | PostgreSQL username | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |
| `POSTGRES_DB` | Database name | Yes |
| `DATABASE_URL` | Full PostgreSQL connection string | Yes |
| `BETTER_AUTH_SECRET` | Auth secret (min 32 chars) | Yes |
| `BETTER_AUTH_URL` | Internal auth URL | Yes |
| `NEXT_PUBLIC_APP_URL` | Public application URL | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | Yes |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare tunnel token | Yes |
| `NODE_ENV` | Node environment | No (defaults to production) |

## Security Notes

- **Never commit `.env` file** - It contains sensitive credentials
- Change default PostgreSQL password in production
- Use strong `BETTER_AUTH_SECRET` (generate with: `openssl rand -base64 32`)
- Keep Cloudflare tunnel token secure
- Use HTTPS (provided by Cloudflare tunnel)

## Production Considerations

For production deployments:

1. Use managed PostgreSQL service instead of container
2. Set up proper backup strategy
3. Configure Cloudflare tunnel with custom domain
4. Enable Cloudflare security features (WAF, DDoS protection)
5. Set up monitoring and alerting
6. Use secrets management for environment variables
7. Configure proper logging and log aggregation

## Related Documentation

- [Orchwiz Overview](../../OWZ-Vault/01-Project-Overview/Orchwiz-Overview.md)
- [Deployment Guide](../../OWZ-Vault/03-Technical/Deployment-Guide.md)
- [Node Concept](../../OWZ-Vault/01-Project-Overview/Node-Concept.md)
