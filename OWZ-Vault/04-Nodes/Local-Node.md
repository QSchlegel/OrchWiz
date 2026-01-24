# Local Node

## Overview

A local node is an Orchwiz deployment running on your local machine or development environment.

## Use Cases

- Development and testing
- Personal workflows
- Offline operation
- Quick prototyping

## Setup

1. Follow the [[../03-Technical/Deployment-Guide|Deployment Guide]] for basic setup
2. Configure environment variables for local development
3. Set up local PostgreSQL database
4. Configure GitHub OAuth for localhost

## Configuration

### Database
- Local PostgreSQL instance
- Default port: 5432
- Database name: orchis (or custom)

### Application
- Runs on http://localhost:3000
- Development mode with hot reload
- Direct database connection

### Authentication
- GitHub OAuth callback: http://localhost:3000/api/auth/callback/github
- Local session storage

## Data Forwarding

To forward data to another node:
1. Configure target node URL in environment variables
2. Set up API keys or authentication tokens
3. Enable data forwarding in node settings

## Related Notes

- [[Cloud-Node]] - Cloud node setup
- [[Data-Forwarding]] - Data forwarding configuration
- [[Deployment-Guide]] - General deployment instructions
