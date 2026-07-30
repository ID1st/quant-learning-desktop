#!/usr/bin/env bash
set -euo pipefail

release_root="/opt/quant-auth/current"
certificate_dir="/etc/nginx/ssl/fnndp.xyz"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

test -s "${certificate_dir}/fullchain.pem"
test -s "${certificate_dir}/privkey.pem"
openssl x509 -checkend 86400 -noout \
  -in "${certificate_dir}/fullchain.pem" >/dev/null

install -d -m 0755 /var/www/fnndp.xyz
install -m 0644 \
  "${release_root}/deploy/cloud/nginx/status/index.html" \
  /var/www/fnndp.xyz/index.html
install -m 0644 \
  "${release_root}/deploy/cloud/nginx/quant-auth.conf.template" \
  /etc/nginx/conf.d/quant-auth.conf

nginx -t
systemctl reload nginx
systemctl enable --now \
  quant-auth-cert-renew.timer \
  quant-auth-ops-check.timer >/dev/null
echo "Nginx HTTPS sites activated."
