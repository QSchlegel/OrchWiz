# Local Monitoring Stack (Grafana + Prometheus + Blackbox)

Ship-focused local observability stack configured for Bridge embedding and no-login local usage.

## Ports

- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Blackbox exporter: `http://localhost:9115`

## Dashboards (exactly 2)

- `Ship On-Call Command Center` (`uid=ship-oncall-cc`) - default home
- `Ship Diagnostics Deep Dive` (`uid=ship-diagnostics-dd`)

## What is provisioned

- Grafana anonymous Viewer mode with embedding enabled
- Prometheus datasource (`uid=prometheus`)
- Grafana home dashboard pinned to `ship-oncall-command-center.json`
- Prometheus scrapes:
  - itself (`localhost:9090`)
  - Grafana metrics (`host.docker.internal:3001/metrics`)
  - ship-service metrics endpoints (`/metrics`) for:
    - OrchWiz app (`host.docker.internal:3000`)
    - runtime-edge (`host.docker.internal:3100`)
    - provider-proxy (`host.docker.internal:4000`)
- Blackbox health probes (`ship-service-probes`) for:
  - app (`/api/health`)
  - runtime-edge (`/health`)
  - provider-proxy (`/health`)
- Alert rules loaded into Prometheus (`dev-local/monitoring/prometheus/alerts.yml`) for:
  - probe failure
  - metrics scrape down
  - elevated 5xx rate
  - elevated p95 latency
  - pod restart spike (uses `kube-state-metrics` series when present)

## Metrics token env

The `/metrics` endpoints are bearer-token protected.

- Preferred variable: `PROMETHEUS_METRICS_BEARER_TOKEN`
- Backward-compatible alias: `ORCHWIZ_METRICS_BEARER_TOKEN`

Use the same token for:

1. OrchWiz app/runtime-edge/provider-proxy process env
2. `start-monitoring.sh` so Prometheus can authenticate scrapes

Example:

```bash
PROMETHEUS_METRICS_BEARER_TOKEN=replace-me ./dev-local/monitoring/start-monitoring.sh
```

## Start / Refresh

```bash
./dev-local/monitoring/start-monitoring.sh
```

## Stop

```bash
./dev-local/monitoring/stop-monitoring.sh
```
