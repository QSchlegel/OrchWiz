# Orchwiz Overview

## What is Orchwiz?

Orchwiz (Orchestration Wizard) is a distributed orchestration platform for managing and visualizing AI coding assistant workflows. The platform consists of multiple nodes that can be deployed locally or in the cloud.

## Core Concept

Orchwiz has at least 1 deployed node. Each node can:
- **Visualize its state**: Display its own operational status and data
- **Forward data**: Send relevant data to another node for aggregate visualization

## Key Features

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

## Project Structure

The main application is located in the `node/` directory, which contains:
- Next.js application code
- Prisma schema and database configuration
- API routes for all features
- React components and UI

## Related Notes

- [[Node-Concept]] - Understanding the node architecture
- [[Architecture]] - System architecture details
- [[Database-Schema]] - Database structure reference
