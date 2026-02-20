#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROM_CFG_TEMPLATE="$ROOT_DIR/prometheus/prometheus.yml"
PROM_CFG_RENDERED="$ROOT_DIR/prometheus/.generated.prometheus.yml"
PROM_ALERTS="$ROOT_DIR/prometheus/alerts.yml"
BLACKBOX_CFG="$ROOT_DIR/blackbox/blackbox.yml"
GRAF_PROV="$ROOT_DIR/grafana/provisioning"
ONCALL_DASHBOARD="ship-oncall-command-center.json"
DEEP_DIVE_DASHBOARD="ship-diagnostics-deep-dive.json"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

METRICS_BEARER_TOKEN="${PROMETHEUS_METRICS_BEARER_TOKEN:-${ORCHWIZ_METRICS_BEARER_TOKEN:-}}"
if [[ -z "$METRICS_BEARER_TOKEN" ]]; then
  echo "PROMETHEUS_METRICS_BEARER_TOKEN is not set; defaulting to 'orchwiz-local-metrics-token'." >&2
  METRICS_BEARER_TOKEN="orchwiz-local-metrics-token"
fi

mkdir -p "$GRAF_PROV/dashboards/json"

# Keep only the two ship dashboards in the provisioned path.
rm -f "$GRAF_PROV"/dashboards/json/*.json
cp "$ROOT_DIR/grafana/dashboards/$ONCALL_DASHBOARD" "$GRAF_PROV/dashboards/json/$ONCALL_DASHBOARD"
cp "$ROOT_DIR/grafana/dashboards/$DEEP_DIVE_DASHBOARD" "$GRAF_PROV/dashboards/json/$DEEP_DIVE_DASHBOARD"

ESCAPED_METRICS_BEARER_TOKEN="$(printf '%s' "$METRICS_BEARER_TOKEN" | sed -e 's/[\/&]/\\&/g')"
sed "s/__PROMETHEUS_METRICS_BEARER_TOKEN__/$ESCAPED_METRICS_BEARER_TOKEN/g" \
  "$PROM_CFG_TEMPLATE" > "$PROM_CFG_RENDERED"

docker volume create orchwiz_grafana_data >/dev/null

docker rm -f orchwiz-prometheus orchwiz-grafana orchwiz-blackbox-exporter >/dev/null 2>&1 || true

docker run -d \
  --name orchwiz-blackbox-exporter \
  --restart unless-stopped \
  -p 9115:9115 \
  -v "$BLACKBOX_CFG:/etc/blackbox_exporter/config.yml:ro" \
  prom/blackbox-exporter:latest \
  --config.file=/etc/blackbox_exporter/config.yml >/dev/null

docker run -d \
  --name orchwiz-prometheus \
  --restart unless-stopped \
  -p 9090:9090 \
  -v "$PROM_CFG_RENDERED:/etc/prometheus/prometheus.yml:ro" \
  -v "$PROM_ALERTS:/etc/prometheus/alerts.yml:ro" \
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
  -e GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/etc/grafana/provisioning/dashboards/json/ship-oncall-command-center.json \
  -v orchwiz_grafana_data:/var/lib/grafana \
  -v "$GRAF_PROV:/etc/grafana/provisioning:ro" \
  grafana/grafana-oss:latest >/dev/null

echo "Monitoring stack started:"
echo "- Grafana:    http://localhost:3001"
echo "- Prometheus: http://localhost:9090"
echo "- Blackbox:   http://localhost:9115"
echo "- Metrics token: configured (PROMETHEUS_METRICS_BEARER_TOKEN)"
