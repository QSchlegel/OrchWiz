# Local Development Setup

This directory contains the Docker Compose setup for local development with a PostgreSQL database.

## Quick Start

1. **Start the database:**
   ```bash
   docker compose up -d
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example ../node/.env
   # Edit ../node/.env with your configuration
   ```

3. **Initialize the database:**
   ```bash
   cd ../node
   npx prisma generate
   npx prisma db push
   ```

4. **Start the Next.js dev server:**
   ```bash
   npm run dev
   ```

5. **Access the application:**
   - Open http://localhost:3000

## Database Connection

The PostgreSQL database runs on port **5435** (to avoid conflicts with other local databases).

Connection string:
```
postgresql://orchwiz:orchwiz_dev@localhost:5435/orchis?schema=public
```

## Commands

### Start database
```bash
docker compose up -d
```

### Stop database
```bash
docker compose down
```

### View logs
```bash
docker compose logs -f
```

### Access database
```bash
docker compose exec postgres psql -U orchwiz -d orchis
```

### Reset database (removes all data)
```bash
docker compose down -v
docker compose up -d
```

## Optional: llm-graph-builder ingest stack

Use this only when running `knowledge:ingest` with provider `llm_graph_builder`.

1. Clone `llm-graph-builder` beside this repo (or set `LGB_REPO_PATH` to your clone):

```bash
cd ..
git clone https://github.com/neo4j-labs/llm-graph-builder.git
```

2. Start Neo4j + llm-graph-builder backend using the overlay:

```bash
cd /path/to/OrchWiz/dev-local
docker compose -f docker-compose.yml -f docker-compose.ingest.llm-graph-builder.yml up -d
```

3. Run ingest from the node app workspace:

```bash
cd /path/to/OrchWiz/node
npm run knowledge:ingest:dry-run
npm run knowledge:ingest
```

## Environment Variables

Copy `.env.example` to `../node/.env` and configure:

- `DATABASE_URL`: PostgreSQL connection string (port 5435)
- `BETTER_AUTH_SECRET`: Random secret (min 32 characters)
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret

## Default Credentials

- **User**: orchwiz
- **Password**: orchwiz_dev
- **Database**: orchis
- **Port**: 5435

**Note**: These are development defaults. Change them in production!
