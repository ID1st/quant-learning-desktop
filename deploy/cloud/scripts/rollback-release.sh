#!/usr/bin/env bash
set -euo pipefail

service_root="/opt/quant-auth"
releases_dir="${service_root}/releases"
current_link="${service_root}/current"
previous_link="${service_root}/previous"
site_root="/var/www/fnndp.xyz"
site_releases_dir="${site_root}/releases"
site_current_link="${site_root}/current"
site_previous_link="${site_root}/previous"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ ! -L "${current_link}" || ! -L "${previous_link}" ]]; then
  echo "Both current and previous release links are required." >&2
  exit 1
fi

current_release="$(readlink -f "${current_link}")"
previous_release="$(readlink -f "${previous_link}")"
case "${current_release}" in
  "${releases_dir}/"*) ;;
  *) echo "Current release link is unsafe." >&2; exit 1 ;;
esac
case "${previous_release}" in
  "${releases_dir}/"*) ;;
  *) echo "Previous release link is unsafe." >&2; exit 1 ;;
esac
target_release_id="$(basename "${previous_release}")"
target_site_release="${site_releases_dir}/${target_release_id}"
if [[ ! -d "${target_site_release}" ]]; then
  echo "Matching web release is missing: ${target_release_id}" >&2
  exit 1
fi

next_link="${service_root}/.rollback-current"
old_link="${service_root}/.rollback-previous"
ln -s "${previous_release}" "${next_link}"
ln -s "${current_release}" "${old_link}"
mv -Tf "${next_link}" "${current_link}"
mv -Tf "${old_link}" "${previous_link}"

docker compose \
  -f "${current_link}/deploy/cloud/docker-compose.yml" \
  up -d --build
"${current_link}/deploy/cloud/scripts/wait-ready.sh"

if [[ -L "${site_current_link}" ]]; then
  current_site_release="$(readlink -f "${site_current_link}")"
  case "${current_site_release}" in
    "${site_releases_dir}/"*) ln -sfn "${current_site_release}" "${site_previous_link}" ;;
  esac
fi
site_next_link="${site_root}/.rollback-current"
ln -s "${target_site_release}" "${site_next_link}"
mv -Tf "${site_next_link}" "${site_current_link}"

install -m 0644 \
  "${current_link}/deploy/cloud/nginx/quant-auth.conf.template" \
  /etc/nginx/conf.d/quant-auth.conf
nginx -t
systemctl reload nginx

echo "Rolled back to $(basename "${previous_release}")."
