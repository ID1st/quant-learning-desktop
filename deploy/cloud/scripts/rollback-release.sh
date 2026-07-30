#!/usr/bin/env bash
set -euo pipefail

service_root="/opt/quant-auth"
releases_dir="${service_root}/releases"
current_link="${service_root}/current"
previous_link="${service_root}/previous"

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

echo "Rolled back to $(basename "${previous_release}")."
