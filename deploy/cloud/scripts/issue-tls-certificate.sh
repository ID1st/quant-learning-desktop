#!/usr/bin/env bash
set -euo pipefail

credentials_file="/opt/quant-auth/secrets/acme-ali.env"
acme_home="/root/.acme.sh"
acme="${acme_home}/acme.sh"
certificate_dir="/etc/nginx/ssl/fnndp.xyz"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ ! -f "${credentials_file}" ]]; then
  echo "AliDNS ACME credentials are missing: ${credentials_file}" >&2
  exit 1
fi

if [[ "$(stat -c %a "${credentials_file}")" != "600" ]]; then
  echo "AliDNS ACME credentials must have mode 600." >&2
  exit 1
fi

set -a
source "${credentials_file}"
set +a
: "${Ali_Key:?Ali_Key is required}"
: "${Ali_Secret:?Ali_Secret is required}"
: "${ACME_EMAIL:?ACME_EMAIL is required}"

if [[ ! -x "${acme}" ]]; then
  installer="$(mktemp /tmp/get-acme.XXXXXX.sh)"
  trap 'rm -f -- "${installer}"' EXIT
  curl --fail --silent --show-error --location \
    https://get.acme.sh \
    --output "${installer}"
  sh "${installer}" "email=${ACME_EMAIL}" \
    --home "${acme_home}" \
    --no-cron
  rm -f -- "${installer}"
  trap - EXIT
fi

"${acme}" --set-default-ca --server letsencrypt
"${acme}" --issue \
  --server letsencrypt \
  --dns dns_ali \
  --keylength ec-256 \
  -d fnndp.xyz \
  -d auth.fnndp.xyz

install -d -m 0750 "${certificate_dir}"
install -m 0600 /dev/null "${certificate_dir}/privkey.pem"
install -m 0644 /dev/null "${certificate_dir}/fullchain.pem"

"${acme}" --install-cert \
  --ecc \
  -d fnndp.xyz \
  --key-file "${certificate_dir}/privkey.pem" \
  --fullchain-file "${certificate_dir}/fullchain.pem" \
  --reloadcmd "systemctl reload nginx"

openssl x509 -checkend 1814400 -noout \
  -in "${certificate_dir}/fullchain.pem" >/dev/null
echo "TLS certificate installed for fnndp.xyz and auth.fnndp.xyz."
