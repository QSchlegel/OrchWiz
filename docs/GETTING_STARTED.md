# OrchWiz Getting Started

This guide gets OrchWiz running locally with the current app stack (`node/` + local Postgres).

## Prerequisites

- Node.js 18+ (Node.js 20 recommended)
- npm
- Docker + Docker Compose
- Git

## 1) Clone and start Postgres

```bash
git clone git@github.com:QSchlegel/OrchWiz.git
cd OrchWiz

cd dev-local
docker compose up -d
```

Local Postgres is exposed on `localhost:5435`.

## 2) Configure app environment

```bash
cd ../node
cp .env.example .env
```

Update these values in `node/.env`:

```dotenv
DATABASE_URL=postgresql://orchwiz:orchwiz_dev@localhost:5435/orchis?schema=public
BETTER_AUTH_SECRET=<set-a-random-secret>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Optional: make specific users admin at sign-in
ORCHWIZ_ADMIN_EMAILS=you@example.com
# Landing XO teaser is enabled by default
LANDING_XO_ENABLED=true
LANDING_XO_STAGE=public-preview
```

Generate a local auth secret:

```bash
openssl rand -base64 32
```

## 3) Install, initialize DB, and run

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 4) Sign in

- Go to `/login`
- Use passkey sign-in, or create an account with email + passkey
- Magic-link sign-in is also available
  - In non-production without Resend configured, the generated link is logged to the server console

Landing-specific notes:

- `/` includes an XO teaser chat window that requires passkey unlock before chat is available.
- `/docs` is a public docs hub for XO slash commands, passkey guardrails, and cloud toggle behavior.
- Set `LANDING_XO_ENABLED=false` to disable XO on public cloud without code changes.

## Optional: run with wallet-enclave enabled

Some security-sensitive features use wallet-enclave encryption/signing.

Start wallet-enclave:

```bash
cd services/wallet-enclave
npm install
export WALLET_ENCLAVE_MASTER_SECRET="$(openssl rand -base64 32)"
export WALLET_ENCLAVE_SHARED_SECRET="dev-wallet-token"
npm run dev
```

Use matching settings in `node/.env`:

```dotenv
WALLET_ENCLAVE_ENABLED=true
WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=true
WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=true
WALLET_ENCLAVE_URL=http://127.0.0.1:3377
WALLET_ENCLAVE_SHARED_SECRET=dev-wallet-token
```

If you are not running wallet-enclave locally, set:

```dotenv
WALLET_ENCLAVE_ENABLED=false
WALLET_ENCLAVE_REQUIRE_PRIVATE_MEMORY_ENCRYPTION=false
WALLET_ENCLAVE_REQUIRE_BRIDGE_SIGNATURES=false
```

## First-run checklist

After login, verify these paths:

1. `/sessions`: create a session.
2. `/commands`: confirm seeded shared commands are visible.
3. `/ship-yard`: open launch wizard and profile options.
4. `/security`: run a security audit.
5. `/vault`: browse vault explorer and graph.

## Troubleshooting

- `Prisma can't connect`: check `DATABASE_URL` points to port `5435` and Postgres is running.
- `BETTER_AUTH_SECRET` errors: ensure it is set and non-empty.
- Wallet enclave errors (`WALLET_ENCLAVE_DISABLED`/`WALLET_ENCLAVE_UNREACHABLE`):
  - Start wallet-enclave, or disable enclave-required flags in local `.env`.
- Port conflicts:
  - App default: `3000`
  - Local Postgres: `5435`
