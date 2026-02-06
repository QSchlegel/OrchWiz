# Node Concept

## Overview

Orchwiz operates on a node-based architecture where each node is an independent deployment that can visualize its state or forward data to other nodes.

## Node Types

### Local Node
A node deployed on a local machine or development environment. Local nodes are typically used for:
- Development and testing
- Personal workflows
- Offline operation

### Cloud Node
A node deployed in a cloud environment. Cloud nodes are typically used for:
- Production deployments
- Team collaboration
- High availability

## Node Capabilities

### State Visualization
Each node can visualize its own state, including:
- Current sessions and their status
- Active tasks and commands
- System health and metrics
- User activity and interactions

### Data Forwarding
Nodes can forward relevant data to other nodes for:
- **Aggregate Visualization**: Combining data from multiple nodes into a unified view
- **Centralized Monitoring**: Sending data to a central monitoring node
- **Cross-Node Analysis**: Analyzing patterns across different deployments

### Agent Runtime
Each node can execute sessions through a pluggable agent runtime (OpenClaw initially). The runtime harness emits telemetry that can be sent to Langfuse for observability.

## Node Communication

Nodes communicate through:
- HTTP/HTTPS APIs
- WebSocket connections (for real-time updates)
- Message queues (for async data forwarding)

## Deployment Requirements

Each node requires:
- PostgreSQL database
- Next.js application server
- Network connectivity (for cloud nodes or data forwarding)
- Authentication and authorization setup

## Related Notes

- [[Local-Node]] - Local node deployment guide
- [[Cloud-Node]] - Cloud node deployment guide
- [[Data-Forwarding]] - Data forwarding configuration
- [[Deployment-Guide]] - General deployment instructions
