# Agent Ops Tracker

## Quick Start
1. Open `ops-tracker/templates/(TEMPLATE) Ops Tracker Event.md`.
2. Create a new note under `ops-tracker/events/manual/YYYY/MM/DD/`.
3. Fill `shipDeploymentId`, `agentId`, event kind, and notes.
4. Run `npm --prefix node run ops-tracker:export`.

## Required Frontmatter Fields
- `eventId`
- `occurredAt`
- `shipDeploymentId`
- `agentId`
- `source` (`manual`)
- `points` (default `1`)
- `visibility` (`public` by default)

## Notes
- Only public events are aggregated into ship/fleet scopes.
- Private content is excluded from ship/fleet rollups.
