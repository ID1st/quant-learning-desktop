#!/usr/bin/env bash
set -euo pipefail

backup_dir="/opt/quant-auth/backups/postgres"
backup_file="${1:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ -z "${backup_file}" ]]; then
  backup_file="$(find "${backup_dir}" -maxdepth 1 -type f -name 'quant-auth-*.dump' -print | sort | tail -n 1)"
fi

if [[ -z "${backup_file}" || ! -f "${backup_file}" ]]; then
  echo "No PostgreSQL backup is available for the restore drill." >&2
  exit 1
fi

resolved_backup="$(realpath -e "${backup_file}")"
case "${resolved_backup}" in
  "${backup_dir}/"*) ;;
  *)
    echo "Restore drills accept backups only from ${backup_dir}." >&2
    exit 1
    ;;
esac

drill_id="quant-auth-restore-$(date -u +%Y%m%d%H%M%S)-$$"
volume_name="${drill_id}-data"
database_password="$(openssl rand -hex 24)"

cleanup() {
  docker rm -f "${drill_id}" >/dev/null 2>&1 || true
  docker volume rm "${volume_name}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "${volume_name}" >/dev/null
docker run -d \
  --name "${drill_id}" \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --tmpfs /run/postgresql:rw,nosuid,nodev,size=8m \
  -e POSTGRES_DB=quant_restore \
  -e POSTGRES_USER=quant_restore \
  -e "POSTGRES_PASSWORD=${database_password}" \
  -v "${volume_name}:/var/lib/postgresql/data" \
  -v "${resolved_backup}:/backup.dump:ro" \
  postgres:16-alpine >/dev/null

for _attempt in $(seq 1 30); do
  if docker exec "${drill_id}" pg_isready -U quant_restore -d quant_restore >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker exec "${drill_id}" pg_isready -U quant_restore -d quant_restore >/dev/null
docker exec "${drill_id}" pg_restore \
  --exit-on-error \
  --no-owner \
  --no-privileges \
  -U quant_restore \
  -d quant_restore \
  /backup.dump

integrity_result="$(
  docker exec "${drill_id}" psql -At \
    -U quant_restore \
    -d quant_restore \
    -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users','invite_codes','entitlements','sessions','email_outbox');"
)"

if [[ "${integrity_result}" != "5" ]]; then
  echo "Restore drill failed the core-table integrity check." >&2
  exit 1
fi

echo "Restore drill passed for ${resolved_backup}."
