# API Documentation

## Overview

Orchwiz provides RESTful API endpoints for all major features. All API routes are located in `node/src/app/api/`.

## Authentication

Most endpoints require authentication via Better Auth. Include the session cookie in requests.

## Endpoints

### Sessions
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create a new session
- `GET /api/sessions/[id]` - Get session details
- `POST /api/sessions/[id]/prompt` - Submit a prompt to a session
- `POST /api/sessions/[id]/mode` - Change session mode

### Commands
- `GET /api/commands` - List all commands
- `POST /api/commands` - Create a new command
- `GET /api/commands/[id]` - Get command details
- `POST /api/commands/[id]/execute` - Execute a command

### Subagents
- `GET /api/subagents` - List all subagents
- `POST /api/subagents` - Create a new subagent
- `GET /api/subagents/[id]` - Get subagent details

### Documentation
- `GET /api/docs/claude` - Get CLAUDE.md document
- `POST /api/docs/claude` - Update CLAUDE.md document
- `GET /api/docs/guidance` - Get guidance entries

### GitHub
- `GET /api/github/prs` - Get PRs with @claude tag
- `POST /api/github/webhook` - GitHub webhook handler

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create a new task

### Verification
- `GET /api/verification` - List verification runs
- `POST /api/verification` - Start a verification run

### Hooks
- `GET /api/hooks` - List all hooks
- `POST /api/hooks` - Create a new hook
- `GET /api/hooks/[id]` - Get hook details

### Permissions
- `GET /api/permissions` - List all permissions
- `POST /api/permissions` - Create a new permission
- `GET /api/permissions/[id]` - Get permission details

### Actions
- `GET /api/actions` - List agent actions

## Response Format

All endpoints return JSON. Success responses include the requested data. Error responses include an `error` field with a message.

## Related Notes

- [[Database-Schema]] - Database models used by APIs
- [[Deployment-Guide]] - API deployment information
