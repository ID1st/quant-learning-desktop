#!/usr/bin/env bash
set -euo pipefail

service_root="/opt/quant-auth"
incoming_dir="${service_root}/incoming"
releases_dir="${service_root}/releases"
current_link="${service_root}/current"
previous_link="${service_root}/previous"
site_root="/var/www/fnndp.xyz"
site_releases_dir="${site_root}/releases"
site_current_link="${site_root}/current"
site_previous_link="${site_root}/previous"
archive="${1:-}"
release_id="${2:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ -z "${archive}" || -z "${release_id}" ]]; then
  echo "Usage: deploy-release.sh <archive.tar.gz> <release-id>" >&2
  exit 1
fi

if [[ ! "${release_id}" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{7,40}$ ]]; then
  echo "Release ID must use UTC timestamp and a source digest." >&2
  exit 1
fi

resolved_archive="$(realpath -e "${archive}")"
case "${resolved_archive}" in
  "${incoming_dir}/"*) ;;
  *)
    echo "Release archives must be placed under ${incoming_dir}." >&2
    exit 1
    ;;
esac

release_dir="${releases_dir}/${release_id}"
staging_dir="${releases_dir}/.staging-${release_id}"
if [[ -e "${release_dir}" || -e "${staging_dir}" ]]; then
  echo "Release already exists: ${release_id}" >&2
  exit 1
fi

if tar -tzf "${resolved_archive}" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "Release archive contains an unsafe path." >&2
  exit 1
fi

install -d -m 0750 "${incoming_dir}" "${releases_dir}"
install -d -m 0750 "${staging_dir}"
cleanup() {
  if [[ "${staging_dir}" == "${releases_dir}/.staging-"* ]]; then
    rm -rf -- "${staging_dir}"
  fi
}
trap cleanup EXIT

tar -xzf "${resolved_archive}" -C "${staging_dir}"
find "${staging_dir}/deploy/cloud/scripts" -maxdepth 1 -type f -name '*.sh' \
  -exec chmod 0750 {} +
test -f "${staging_dir}/deploy/cloud/docker-compose.yml"
test -f "${staging_dir}/apps/cloud-server/package.json"
test -f "${staging_dir}/apps/admin-web/dist/index.html"
test -x "${staging_dir}/deploy/cloud/scripts/wait-ready.sh"

if [[ ! -f "${service_root}/secrets/auth.env" ||
  ! -f "${service_root}/secrets/postgres.env" ]]; then
  "${staging_dir}/deploy/cloud/scripts/bootstrap-production-secrets.sh"
fi
if ! grep -Eq '^AUTH_ADMIN_EMAIL=[^[:space:]]+@[^[:space:]]+$' \
  "${service_root}/secrets/auth.env"; then
  echo "AUTH_ADMIN_EMAIL must be configured in auth.env before deployment." >&2
  exit 1
fi

docker compose \
  -f "${staging_dir}/deploy/cloud/docker-compose.yml" \
  config --quiet
docker compose \
  -f "${staging_dir}/deploy/cloud/docker-compose.yml" \
  build auth migrate

mv -- "${staging_dir}" "${release_dir}"
trap - EXIT

candidate_compose="${release_dir}/deploy/cloud/docker-compose.yml"
docker compose \
  -f "${candidate_compose}" \
  up -d postgres
for _attempt in $(seq 1 30); do
  if docker compose \
    -f "${candidate_compose}" \
    exec -T postgres \
    pg_isready -U quant_auth -d quant_auth >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose \
  -f "${candidate_compose}" \
  exec -T postgres \
  pg_isready -U quant_auth -d quant_auth >/dev/null

"${release_dir}/deploy/cloud/scripts/postgres-backup.sh" \
  "${candidate_compose}"
docker compose \
  -f "${candidate_compose}" \
  run --rm --no-deps migrate
docker compose \
  -f "${candidate_compose}" \
  run --rm --no-deps auth \
  node apps/cloud-server/dist/cli/adminProvision.js

if [[ -L "${current_link}" ]]; then
  active_release="$(readlink -f "${current_link}")"
  case "${active_release}" in
    "${releases_dir}/"*) ln -sfn "${active_release}" "${previous_link}" ;;
  esac
fi

next_link="${service_root}/.current-${release_id}"
ln -s "${release_dir}" "${next_link}"
mv -Tf "${next_link}" "${current_link}"

install -m 0644 "${release_dir}"/deploy/cloud/systemd/*.service \
  /etc/systemd/system/
install -m 0644 "${release_dir}"/deploy/cloud/systemd/*.timer \
  /etc/systemd/system/
install -m 0644 \
  "${release_dir}/deploy/cloud/systemd/quant-auth-invite-exports.conf" \
  /etc/tmpfiles.d/quant-auth-invite-exports.conf
systemctl daemon-reload
systemctl enable quant-auth-compose.service >/dev/null
systemctl enable --now \
  quant-auth-postgres-backup.timer \
  quant-auth-restore-drill.timer >/dev/null
systemd-tmpfiles --create /etc/tmpfiles.d/quant-auth-invite-exports.conf

docker compose \
  -f "${current_link}/deploy/cloud/docker-compose.yml" \
  up -d --no-deps auth
"${current_link}/deploy/cloud/scripts/wait-ready.sh"

site_release_dir="${site_releases_dir}/${release_id}"
site_staging_dir="${site_releases_dir}/.staging-${release_id}"
if [[ -e "${site_release_dir}" || -e "${site_staging_dir}" ]]; then
  echo "Web release already exists: ${release_id}" >&2
  exit 1
fi
if [[ -e "${site_current_link}" && ! -L "${site_current_link}" ]]; then
  echo "Web current path exists but is not a symbolic link." >&2
  exit 1
fi
install -d -m 0755 "${site_root}" "${site_releases_dir}" "${site_staging_dir}"
site_cleanup() {
  if [[ "${site_staging_dir}" == "${site_releases_dir}/.staging-"* ]]; then
    rm -rf -- "${site_staging_dir}"
  fi
}
trap site_cleanup EXIT
cp -a "${release_dir}/apps/admin-web/dist/." "${site_staging_dir}/"
find "${site_staging_dir}" -type d -exec chmod 0755 {} +
find "${site_staging_dir}" -type f -exec chmod 0644 {} +
mv -- "${site_staging_dir}" "${site_release_dir}"
trap - EXIT

if [[ -L "${site_current_link}" ]]; then
  active_site_release="$(readlink -f "${site_current_link}")"
  case "${active_site_release}" in
    "${site_releases_dir}/"*) ln -sfn "${active_site_release}" "${site_previous_link}" ;;
  esac
fi
site_next_link="${site_root}/.current-${release_id}"
ln -s "${site_release_dir}" "${site_next_link}"
mv -Tf "${site_next_link}" "${site_current_link}"

install -m 0644 \
  "${release_dir}/deploy/cloud/nginx/quant-auth.conf.template" \
  /etc/nginx/conf.d/quant-auth.conf
nginx -t
systemctl reload nginx

echo "Release activated: ${release_id}"
