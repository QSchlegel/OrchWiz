#!/usr/bin/env bash
set -euo pipefail

docker rm -f orchwiz-prometheus orchwiz-grafana orchwiz-blackbox-exporter >/dev/null 2>&1 || true
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rm -f "$ROOT_DIR/prometheus/.generated.prometheus.yml"
echo "Stopped monitoring containers (orchwiz-prometheus, orchwiz-grafana, orchwiz-blackbox-exporter)."
