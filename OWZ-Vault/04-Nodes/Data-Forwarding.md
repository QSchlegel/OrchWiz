# Data Forwarding

## Overview

Data forwarding allows Orchwiz nodes to send relevant data to other nodes for aggregate visualization and centralized monitoring.

## Use Cases

- **Aggregate Visualization**: Combine data from multiple nodes into a unified dashboard
- **Centralized Monitoring**: Send all node data to a central monitoring node
- **Cross-Node Analysis**: Analyze patterns and trends across different deployments
- **Backup and Redundancy**: Forward critical data to backup nodes

## Configuration

### Source Node Setup

1. **Identify Target Node**
   - Target node URL
   - Authentication credentials
   - API endpoint for data reception

2. **Configure Forwarding**
   - Set `FORWARD_TARGET_URL` environment variable
   - Set `FORWARD_API_KEY` for authentication
   - Enable forwarding in node settings

3. **Select Data to Forward**
   - Session data
   - Task status
   - Command executions
   - Verification results
   - System metrics

### Target Node Setup

1. **API Endpoint**
   - Create API route to receive forwarded data
   - Authenticate incoming requests
   - Validate data format

2. **Data Storage**
   - Store forwarded data in database
   - Link to source node identifier
   - Aggregate with local data

3. **Visualization**
   - Display aggregate data in dashboard
   - Show source node information
   - Filter by node or time range

## Data Format

Forwarded data typically includes:
- Source node identifier
- Timestamp
- Data type (session, task, etc.)
- Payload (actual data)
- Metadata (node version, environment, etc.)

## Security

- Use HTTPS for all forwarding
- Authenticate with API keys or tokens
- Validate data before processing
- Rate limit forwarding requests
- Encrypt sensitive data

## Implementation Status

Data forwarding is a planned feature. Current implementation focuses on single-node operation.

## Related Notes

- [[Local-Node]] - Local node configuration
- [[Cloud-Node]] - Cloud node configuration
- [[Architecture]] - System architecture
