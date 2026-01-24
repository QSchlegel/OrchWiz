# OrchWiz - Orchestration Wizard

<div align="center">

**A distributed orchestration platform for managing and visualizing AI coding assistant workflows**

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.3-2D3748)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791)](https://www.postgresql.org/)

</div>

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Development](#development)
- [Node Architecture](#node-architecture)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

## 🎯 Overview

OrchWiz (Orchestration Wizard) is a comprehensive platform for orchestrating and visualizing AI coding assistant workflows across distributed nodes. Each node is a self-contained deployment that can operate independently or forward data to other nodes for aggregate visualization.

### Key Concepts

- **Distributed Nodes**: Deploy OrchWiz nodes locally or in the cloud
- **State Visualization**: Each node visualizes its own operational state
- **Data Forwarding**: Nodes can forward data to other nodes for unified views
- **Session Management**: Track and manage AI coding sessions with different modes
- **Command Orchestration**: Define and execute custom commands across nodes

## 🏗️ Architecture

### System Architecture Diagram

```mermaid
graph TB
    subgraph "User Interface"
        UI[Next.js Frontend<br/>React + Tailwind CSS]
    end
    
    subgraph "Application Layer"
        API[Next.js API Routes<br/>RESTful Endpoints]
        AUTH[Better Auth<br/>GitHub OAuth]
    end
    
    subgraph "Data Layer"
        PRISMA[Prisma ORM]
        DB[(PostgreSQL<br/>Database)]
    end
    
    subgraph "Node 1 - Local"
        N1[OrchWiz Node<br/>Local Deployment]
        N1DB[(Local PostgreSQL)]
    end
    
    subgraph "Node 2 - Cloud"
        N2[OrchWiz Node<br/>Cloud Deployment]
        N2DB[(Cloud PostgreSQL)]
    end
    
    subgraph "External Services"
        GITHUB[GitHub API<br/>PR Tracking]
        HOOKS[PostToolUse Hooks<br/>Automation]
    end
    
    UI --> API
    API --> AUTH
    API --> PRISMA
    PRISMA --> DB
    
    N1 -.->|Data Forwarding| N2
    N2 -.->|Aggregate View| N1
    
    API --> GITHUB
    API --> HOOKS
    
    style UI fill:#3b82f6,stroke:#1e40af,color:#fff
    style API fill:#10b981,stroke:#059669,color:#fff
    style DB fill:#8b5cf6,stroke:#6d28d9,color:#fff
    style N1 fill:#f59e0b,stroke:#d97706,color:#fff
    style N2 fill:#06b6d4,stroke:#0891b2,color:#fff
```

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Auth
    participant Prisma
    participant Database
    participant GitHub
    
    User->>Frontend: Interact with UI
    Frontend->>API: API Request
    API->>Auth: Verify Session
    Auth-->>API: Session Valid
    API->>Prisma: Database Query
    Prisma->>Database: Execute Query
    Database-->>Prisma: Return Data
    Prisma-->>API: Formatted Data
    API->>GitHub: External API Call (if needed)
    GitHub-->>API: Response
    API-->>Frontend: JSON Response
    Frontend-->>User: Update UI
```

### Node Communication

```mermaid
graph LR
    subgraph "Local Node"
        LN[Local OrchWiz<br/>Development]
        LNDB[(Local DB)]
        LN --> LNDB
    end
    
    subgraph "Cloud Node"
        CN[Cloud OrchWiz<br/>Production]
        CNDB[(Cloud DB)]
        CN --> CNDB
    end
    
    subgraph "Hybrid Node"
        HN[Hybrid OrchWiz<br/>Staging]
        HNDB[(Distributed DB)]
        HN --> HNDB
    end
    
    LN -.->|HTTP/WebSocket| CN
    CN -.->|Aggregate Data| LN
    HN -.->|Bidirectional| CN
    HN -.->|Bidirectional| LN
    
    style LN fill:#f59e0b
    style CN fill:#06b6d4
    style HN fill:#ec4899
```

## ✨ Features

### Core Features

- **🔄 Session Management**: Create, view, and manage AI coding sessions with plan/auto-accept modes
- **⚡ Slash Commands**: Define and execute custom commands with execution tracking
- **🤖 Subagents**: Create and manage specialized AI subagents for specific tasks
- **📝 CLAUDE.md Editor**: Edit and version control project documentation with markdown support
- **🔗 GitHub Integration**: Track PRs with @claude tags and manage documentation updates
- **🪝 PostToolUse Hooks**: Automate actions after tool usage with configurable triggers
- **🔐 Permissions Management**: Control command execution permissions with fine-grained access
- **📊 Agent Actions Tracking**: Monitor integrations with Slack, BigQuery, Sentry, and more
- **⏳ Long-Running Tasks**: Track and monitor background tasks with status updates
- **✅ Verification Workflows**: Track browser, bash, and test suite verification runs

### Node Features

- **🌐 Multi-Node Support**: Deploy nodes locally, in the cloud, or in hybrid configurations
- **📡 Data Forwarding**: Forward data between nodes for aggregate visualization
- **🔍 State Visualization**: Real-time visualization of node state and health
- **🔒 Secure Communication**: HTTPS and authentication for node-to-node communication

## 🛠️ Tech Stack

### Frontend
- **Framework**: [Next.js 16.1](https://nextjs.org/) with App Router
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS 4.1](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

### Backend
- **Runtime**: Node.js 18+
- **API**: Next.js API Routes (RESTful)
- **Authentication**: [Better Auth](https://www.better-auth.com/) with GitHub OAuth
- **ORM**: [Prisma 7.3](https://www.prisma.io/)
- **Database**: PostgreSQL 15+

### Development Tools
- **Language**: TypeScript 5.7
- **Package Manager**: npm
- **Database Tools**: Prisma Studio, Docker Compose
- **Version Control**: Git

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Docker** and Docker Compose (for local database)
- **PostgreSQL** 15+ (or use Docker)
- **GitHub OAuth App** (for authentication)

### Installation

1. **Clone the repository:**
   ```bash
   git clone git@github.com:QSchlegel/OrchWiz.git
   cd OrchWiz
   ```

2. **Start the local database:**
   ```bash
   cd dev-local
   docker compose up -d
   ```

3. **Set up environment variables:**
   ```bash
   cd ../node
   cp .env.example .env
   ```

   Edit `.env` with your configuration:
   ```env
   # Database (matches dev-local docker-compose)
   DATABASE_URL="postgresql://orchwiz:orchwiz_dev@localhost:5435/orchis?schema=public"
   
   # Better Auth
   BETTER_AUTH_SECRET="your-random-secret-min-32-characters"
   BETTER_AUTH_URL="http://localhost:3000"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   
   # GitHub OAuth (get from https://github.com/settings/developers)
   GITHUB_CLIENT_ID="your_github_client_id"
   GITHUB_CLIENT_SECRET="your_github_client_secret"
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Set up the database:**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

7. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set **Authorization callback URL** to: `http://localhost:3000/api/auth/callback/github`
4. Copy the Client ID and Client Secret to your `.env` file

## 💻 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Database
npm run db:generate  # Generate Prisma Client
npm run db:push      # Push schema changes to database
npm run db:migrate   # Create and run migrations
npm run db:studio    # Open Prisma Studio
```

### Database Management

```bash
# View database in Prisma Studio
npm run db:studio

# Create a new migration
npm run db:migrate

# Reset database (⚠️ deletes all data)
cd ../dev-local
docker compose down -v
docker compose up -d
cd ../node
npx prisma db push
```

### Project Structure

```
OrchWiz/
├── node/                    # Main Next.js application
│   ├── src/
│   │   ├── app/            # Next.js App Router
│   │   │   ├── (auth)/     # Authentication routes
│   │   │   ├── (dashboard)/# Protected dashboard
│   │   │   │   ├── sessions/      # Session management
│   │   │   │   ├── commands/      # Slash commands
│   │   │   │   ├── subagents/     # AI subagents
│   │   │   │   ├── docs/          # CLAUDE.md editor
│   │   │   │   ├── hooks/         # PostToolUse hooks
│   │   │   │   ├── permissions/   # Access control
│   │   │   │   ├── actions/       # Agent actions
│   │   │   │   ├── tasks/         # Long-running tasks
│   │   │   │   └── verification/  # Verification workflows
│   │   │   ├── api/               # API routes
│   │   │   └── page.tsx           # Home page
│   │   ├── components/            # React components
│   │   │   ├── orchestration/     # Node visualization
│   │   │   ├── sessions/           # Session components
│   │   │   └── shared/            # Shared components
│   │   └── lib/                   # Utilities
│   │       ├── auth.ts            # Better Auth config
│   │       ├── prisma.ts          # Prisma client
│   │       └── github.ts          # GitHub integration
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   └── package.json
├── dev-local/              # Local development setup
│   └── docker-compose.yml  # PostgreSQL container
├── cloudflare-local/       # Cloudflare tunnel setup
└── OWZ-Vault/             # Project documentation
    ├── 01-Project-Overview/
    ├── 02-Development/
    ├── 03-Technical/
    ├── 04-Nodes/
    └── 05-Resources/
```

## 🌐 Node Architecture

OrchWiz uses a distributed node architecture where each node is an independent deployment.

### Node Types

#### Local Node
- **Use Case**: Development, testing, personal workflows
- **Database**: Local PostgreSQL
- **Network**: Localhost or private network
- **Security**: Development-level (HTTP, local auth)

#### Cloud Node
- **Use Case**: Production, team collaboration, high availability
- **Database**: Managed PostgreSQL (e.g., AWS RDS, Supabase)
- **Network**: Public HTTPS endpoint
- **Security**: Production-level (HTTPS, OAuth, encryption)

#### Hybrid Node
- **Use Case**: Staging, CI/CD, multi-region deployments
- **Database**: Distributed or replicated PostgreSQL
- **Network**: Multiple endpoints (local + cloud)
- **Security**: Mixed (development + production)

### Node Capabilities

Each node can:
- **Visualize State**: Display sessions, tasks, commands, and system health
- **Forward Data**: Send data to other nodes for aggregate views
- **Receive Data**: Accept forwarded data from other nodes
- **Operate Independently**: Function standalone without other nodes

### Node Communication

Nodes communicate via:
- **HTTP/HTTPS**: RESTful API calls for data forwarding
- **WebSocket**: Real-time updates (planned)
- **Message Queue**: Async data forwarding (planned)

## 🚢 Deployment

### Local Development

See [dev-local/README.md](dev-local/README.md) for detailed local setup instructions.

### Production Deployment

1. **Set up production database:**
   - Use managed PostgreSQL (AWS RDS, Supabase, etc.)
   - Update `DATABASE_URL` in production environment

2. **Configure environment variables:**
   ```env
   DATABASE_URL="postgresql://user:pass@host:5432/orchwiz"
   BETTER_AUTH_SECRET="production-secret-min-32-chars"
   BETTER_AUTH_URL="https://your-domain.com"
   NEXT_PUBLIC_APP_URL="https://your-domain.com"
   GITHUB_CLIENT_ID="production-client-id"
   GITHUB_CLIENT_SECRET="production-client-secret"
   ```

3. **Build and deploy:**
   ```bash
   npm run build
   npm start
   ```

### Docker Deployment

See [cloudflare-local/README.md](cloudflare-local/README.md) for Docker and Cloudflare tunnel setup.

### Deployment Platforms

- **Vercel**: Optimized for Next.js (recommended)
- **Railway**: Easy PostgreSQL + Next.js deployment
- **AWS**: EC2 + RDS for full control
- **DigitalOcean**: App Platform or Droplets

## 📚 Documentation

Comprehensive documentation is available in the `OWZ-Vault/` directory:

- **[Architecture](OWZ-Vault/01-Project-Overview/Architecture.md)**: System architecture details
- **[Node Concept](OWZ-Vault/01-Project-Overview/Node-Concept.md)**: Understanding nodes
- **[API Documentation](OWZ-Vault/03-Technical/API-Documentation.md)**: API endpoint reference
- **[Database Schema](OWZ-Vault/03-Technical/Database-Schema.md)**: Database structure
- **[Deployment Guide](OWZ-Vault/03-Technical/Deployment-Guide.md)**: Deployment instructions

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🔗 Links

- **Repository**: [github.com/QSchlegel/OrchWiz](https://github.com/QSchlegel/OrchWiz)
- **Issues**: [GitHub Issues](https://github.com/QSchlegel/OrchWiz/issues)
- **Documentation**: See `OWZ-Vault/` directory

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Database powered by [Prisma](https://www.prisma.io/)
- Authentication by [Better Auth](https://www.better-auth.com/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)

---

<div align="center">

**Made with ❤️ for orchestrating AI workflows**

</div>
