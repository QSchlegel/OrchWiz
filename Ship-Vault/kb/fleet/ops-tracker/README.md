# Fleet Ops Tracker

## Purpose
- Fleet-wide aggregation dashboard and daily rollups.
- Canonical fleet files live under `kb/fleet/ops-tracker/`.

## Included Sources
- `manual`
- `security_audit`
- `bridge_scorecard`
- `verification`
- `deployment`

## Commands
- `npm --prefix node run ops-tracker:export`
- `npm --prefix node run ops-tracker:export:dry-run`
- `npm --prefix node run ops-tracker:backfill`
