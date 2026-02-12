#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROM_CFG="$ROOT_DIR/prometheus/prometheus.yml"
GRAF_PROV="$ROOT_DIR/grafana/provisioning"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

mkdir -p "$GRAF_PROV/dashboards/json"

# Keep dashboard json copies in the provisioned path
cp "$ROOT_DIR"/grafana/dashboards/*.json "$GRAF_PROV/dashboards/json/"

docker volume create orchwiz_grafana_data >/dev/null

docker rm -f orchwiz-prometheus orchwiz-grafana >/dev/null 2>&1 || true

docker run -d \
  --name orchwiz-prometheus \
  --restart unless-stopped \
  -p 9090:9090 \
  -v "$PROM_CFG:/etc/prometheus/prometheus.yml:ro" \
  prom/prometheus:latest >/dev/null

docker run -d \
  --name orchwiz-grafana \
  --restart unless-stopped \
  -p 3001:3000 \
  -e GF_SECURITY_ALLOW_EMBEDDING=true \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer \
  -e GF_AUTH_DISABLE_LOGIN_FORM=true \
  -e GF_AUTH_DISABLE_SIGNOUT_MENU=true \
  -e GF_USERS_ALLOW_SIGN_UP=false \
  -e GF_METRICS_ENABLED=true \
  -e GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/etc/grafana/provisioning/dashboards/json/orchwiz-monitoring-overview.json \
  -v orchwiz_grafana_data:/var/lib/grafana \
  -v "$GRAF_PROV:/etc/grafana/provisioning:ro" \
  grafana/grafana-oss:latest >/dev/null

echo "Monitoring stack started:"
echo "- Grafana:    http://localhost:3001"
echo "- Prometheus: http://localhost:9090"
