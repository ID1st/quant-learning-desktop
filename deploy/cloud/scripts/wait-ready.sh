#!/usr/bin/env bash
set -euo pipefail

for _attempt in $(seq 1 60); do
  if curl --fail --silent --max-time 5 \
    http://127.0.0.1:8787/health/ready >/dev/null; then
    echo "quant-auth is ready"
    exit 0
  fi
  sleep 2
done

echo "quant-auth did not become ready within 120 seconds" >&2
exit 1
