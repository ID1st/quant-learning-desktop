#!/usr/bin/env bash
set -euo pipefail

credentials_file="/opt/quant-auth/secrets/acme-ali.env"
acme="/root/.acme.sh/acme.sh"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

set -a
source "${credentials_file}"
set +a

"${acme}" --cron --home /root/.acme.sh --server letsencrypt
openssl x509 -checkend 1814400 -noout \
  -in /etc/nginx/ssl/fnndp.xyz/fullchain.pem >/dev/null
