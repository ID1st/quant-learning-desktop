#!/usr/bin/env bash
set -euo pipefail

service_root="/opt/quant-auth"
compose_file="${service_root}/current/deploy/cloud/docker-compose.yml"
backup_dir="${service_root}/backups/postgres"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ ! -f "${compose_file}" ]]; then
  echo "Active deployment is missing: ${compose_file}" >&2
  exit 1
fi

umask 077
install -d -m 0750 "${backup_dir}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${backup_dir}/quant-auth-${timestamp}.dump"
temporary="$(mktemp "${backup_dir}/.quant-auth-${timestamp}.XXXXXX")"

cleanup() {
  rm -f -- "${temporary}"
}
trap cleanup EXIT

docker compose -f "${compose_file}" exec -T postgres \
  sh -ec 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${temporary}"

if [[ ! -s "${temporary}" ]]; then
  echo "PostgreSQL backup is empty." >&2
  exit 1
fi

docker compose -f "${compose_file}" exec -T postgres \
  pg_restore --list < "${temporary}" >/dev/null

chmod 0600 "${temporary}"
mv -- "${temporary}" "${target}"
find "${backup_dir}" -maxdepth 1 -type f -name 'quant-auth-*.dump' -mtime +7 -delete

echo "PostgreSQL backup verified: ${target}"
