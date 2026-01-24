# Cloud Node

## Overview

A cloud node is an Orchwiz deployment running in a cloud environment, accessible over the internet.

## Use Cases

- Production deployments
- Team collaboration
- High availability
- Public access

## Setup Options

### Option 1: Cloudflare Tunnel (Recommended)
Use the cloudflare-local deployment setup for easy tunneling:
- See [[../cloudflare-local/README|cloudflare-local README]]
- Uses Docker Compose
- Includes cloudflared tunnel

### Option 2: Direct Cloud Deployment
Deploy to cloud platforms:
- Vercel (for Next.js)
- Railway
- Render
- AWS/GCP/Azure

## Configuration

### Database
- Managed PostgreSQL service (recommended)
- Or containerized PostgreSQL
- Secure connection strings

### Application
- Public URL (via tunnel or direct)
- Production build
- Environment variables from secure storage

### Authentication
- GitHub OAuth with production callback URL
- Secure session management
- HTTPS required

## Security Considerations

- Use HTTPS for all connections
- Secure database credentials
- Environment variable security
- Rate limiting
- Authentication requirements

## Data Forwarding

Cloud nodes can:
- Receive data from local nodes
- Forward to other cloud nodes
- Aggregate data from multiple sources

## Related Notes

- [[Local-Node]] - Local node setup
- [[Data-Forwarding]] - Data forwarding configuration
- [[Deployment-Guide]] - General deployment instructions
