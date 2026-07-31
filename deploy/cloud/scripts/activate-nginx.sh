#!/usr/bin/env bash
set -euo pipefail

release_root="/opt/quant-auth/current"
certificate_dir="/etc/nginx/ssl/fnndp.xyz"
site_root="/var/www/fnndp.xyz"
site_releases_dir="${site_root}/releases"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

test -s "${certificate_dir}/fullchain.pem"
test -s "${certificate_dir}/privkey.pem"
openssl x509 -checkend 86400 -noout \
  -in "${certificate_dir}/fullchain.pem" >/dev/null

resolved_release="$(readlink -f "${release_root}")"
release_id="$(basename "${resolved_release}")"
site_release_dir="${site_releases_dir}/${release_id}"
test -f "${release_root}/apps/admin-web/dist/index.html"
install -d -m 0755 "${site_root}" "${site_releases_dir}"
if [[ -e "${site_root}/current" && ! -L "${site_root}/current" ]]; then
  echo "Web current path exists but is not a symbolic link." >&2
  exit 1
fi
if [[ ! -d "${site_release_dir}" ]]; then
  install -d -m 0755 "${site_release_dir}"
  cp -a "${release_root}/apps/admin-web/dist/." "${site_release_dir}/"
  find "${site_release_dir}" -type d -exec chmod 0755 {} +
  find "${site_release_dir}" -type f -exec chmod 0644 {} +
fi
ln -sfn "${site_release_dir}" "${site_root}/current"
install -m 0644 \
  "${release_root}/deploy/cloud/nginx/quant-auth.conf.template" \
  /etc/nginx/conf.d/quant-auth.conf

nginx -t
systemctl reload nginx
systemctl enable --now \
  quant-auth-cert-renew.timer \
  quant-auth-ops-check.timer >/dev/null
echo "Nginx HTTPS sites activated."
