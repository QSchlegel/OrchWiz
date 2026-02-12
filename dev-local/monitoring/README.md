# Local Monitoring Stack (Grafana + Prometheus)

This stack is configured for Bridge embedding and no-login local usage.

## Ports

- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`

## What is provisioned

- Grafana anonymous access with embedding enabled
- Prometheus datasource (`uid=prometheus`)
- Dashboards:
  - `OrchWiz Monitoring Overview`
  - `Prometheus Runtime Deep Dive`
- Prometheus scrapes:
  - itself (`localhost:9090`)
  - Grafana metrics (`host.docker.internal:3001/metrics`)

## Start / Refresh

```bash
./dev-local/monitoring/start-monitoring.sh
```

## Stop

```bash
./dev-local/monitoring/stop-monitoring.sh
```
