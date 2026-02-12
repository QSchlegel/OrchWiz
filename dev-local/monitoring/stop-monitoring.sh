#!/usr/bin/env bash
set -euo pipefail

docker rm -f orchwiz-prometheus orchwiz-grafana >/dev/null 2>&1 || true
echo "Stopped monitoring containers (orchwiz-prometheus, orchwiz-grafana)."
