# OrchWiz - Orchestration Wizard

A comprehensive Next.js application for orchestrating and visualizing AI coding assistant workflows across distributed nodes.

## Features

- **Session Management**: Create, view, and manage AI coding sessions with plan/auto-accept modes
- **Slash Commands**: Define and execute custom commands
- **Subagents**: Create and manage specialized AI subagents
- **CLAUDE.md Editor**: Edit and version control project documentation
- **GitHub Integration**: Track PRs with @claude tags and manage documentation updates
- **PostToolUse Hooks**: Automate actions after tool usage
- **Permissions Management**: Control command execution permissions
- **Agent Actions Tracking**: Monitor Slack, BigQuery, Sentry, and other integrations
- **Long-Running Tasks**: Track and monitor background tasks
- **Verification Workflows**: Track browser, bash, and test suite verification runs

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better Auth with GitHub OAuth
- **UI**: React with Tailwind CSS
- **Real-time**: Server-Sent Events ready (implementation pending)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- GitHub OAuth app credentials

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd orchwiz
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your configuration:
```
DATABASE_URL="postgresql://user:password@localhost:5432/orchwiz?schema=public"
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
BETTER_AUTH_SECRET=your_random_secret
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Set up the database:
```bash
npx prisma generate
npx prisma db push
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
orchwiz/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── (auth)/            # Authentication routes
│   │   ├── (dashboard)/      # Protected dashboard routes
│   │   │   ├── sessions/      # Session management
│   │   │   ├── commands/      # Slash commands
│   │   │   ├── subagents/     # Subagents
│   │   │   ├── docs/          # CLAUDE.md editor
│   │   │   ├── hooks/         # PostToolUse hooks
│   │   │   ├── permissions/   # Permissions management
│   │   │   ├── actions/       # Agent actions tracking
│   │   │   ├── tasks/         # Long-running tasks
│   │   │   └── verification/  # Verification workflows
│   │   ├── api/               # API routes
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   ├── lib/                   # Utilities and configurations
│   └── types/                 # TypeScript types
└── package.json
```

## Development

### Database Migrations

```bash
# Create a new migration
npm run db:migrate

# Push schema changes without migration
npm run db:push

# Open Prisma Studio
npm run db:studio
```

### Building for Production

```bash
npm run build
npm start
```

## License

MIT
