#!/usr/bin/env bash
set -euo pipefail

service_root="/opt/quant-auth"
secrets_dir="${service_root}/secrets"
smtp_password_file="${1:-${secrets_dir}/smtp.password}"
auth_env="${secrets_dir}/auth.env"
postgres_env="${secrets_dir}/postgres.env"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if [[ -e "${auth_env}" || -e "${postgres_env}" ]]; then
  echo "Production environment files already exist; refusing to overwrite them." >&2
  exit 1
fi

if [[ ! -f "${smtp_password_file}" ]]; then
  echo "SMTP password file is missing: ${smtp_password_file}" >&2
  exit 1
fi

smtp_password="$(tr -d '\r\n' < "${smtp_password_file}")"
if [[ ! "${smtp_password}" =~ ^[A-Za-z0-9._~!$%*+,=-]{16,128}$ ]]; then
  echo "SMTP password must be 16-128 URL-safe ASCII characters." >&2
  exit 1
fi

umask 077
install -d -m 0750 "${service_root}"
install -d -m 0750 "${service_root}/backups/postgres"
install -d -m 0750 "${service_root}/data"
install -d -m 0700 "${service_root}/data/postgres"
install -d -m 0700 "${secrets_dir}"
install -d -m 0700 "${secrets_dir}/invite-exports"

database_password="$(openssl rand -hex 32)"
invite_pepper="$(openssl rand -hex 32)"
token_pepper="$(openssl rand -hex 32)"
email_pepper="$(openssl rand -hex 32)"
challenge_secret="$(openssl rand -hex 32)"

private_key_file="${secrets_dir}/offline-private.pem"
public_key_file="${secrets_dir}/offline-public.pem"
openssl genpkey -algorithm ED25519 -out "${private_key_file}"
openssl pkey -in "${private_key_file}" -pubout -out "${public_key_file}"
chmod 0600 "${private_key_file}" "${public_key_file}"

private_key_escaped="$(awk '{printf "%s\\\\n", $0}' "${private_key_file}")"
public_key_escaped="$(awk '{printf "%s\\\\n", $0}' "${public_key_file}")"

postgres_tmp="$(mktemp "${secrets_dir}/.postgres.env.XXXXXX")"
auth_tmp="$(mktemp "${secrets_dir}/.auth.env.XXXXXX")"
cleanup() {
  rm -f -- "${postgres_tmp}" "${auth_tmp}"
}
trap cleanup EXIT

printf '%s\n' \
  "POSTGRES_DB=quant_auth" \
  "POSTGRES_USER=quant_auth" \
  "POSTGRES_PASSWORD=${database_password}" \
  > "${postgres_tmp}"

printf '%s\n' \
  "DATABASE_URL=postgresql://quant_auth:${database_password}@postgres:5432/quant_auth" \
  "AUTH_HOST=0.0.0.0" \
  "AUTH_PORT=8787" \
  "AUTH_LOG_LEVEL=info" \
  "AUTH_INVITE_CODE_PEPPER=${invite_pepper}" \
  "AUTH_TOKEN_PEPPER=${token_pepper}" \
  "AUTH_EMAIL_CODE_PEPPER=${email_pepper}" \
  "AUTH_LOGIN_CHALLENGE_SECRET=${challenge_secret}" \
  "AUTH_OFFLINE_PRIVATE_KEY_PEM=${private_key_escaped}" \
  "AUTH_OFFLINE_PUBLIC_KEY_PEM=${public_key_escaped}" \
  "AUTH_INVITE_EXPORT_DIR=${secrets_dir}/invite-exports" \
  "AUTH_SMTP_HOST=smtpdm.aliyun.com" \
  "AUTH_SMTP_PORT=465" \
  "AUTH_SMTP_SECURE=true" \
  "AUTH_SMTP_USER=no-reply@notify.fnndp.xyz" \
  "AUTH_SMTP_PASSWORD=${smtp_password}" \
  "AUTH_SMTP_FROM=量化学习系统 <no-reply@notify.fnndp.xyz>" \
  > "${auth_tmp}"

install -m 0600 "${postgres_tmp}" "${postgres_env}"
install -m 0600 "${auth_tmp}" "${auth_env}"
rm -f -- "${smtp_password_file}"

echo "Production secrets were generated under ${secrets_dir}."
echo "Only offline-public.pem may be copied into the desktop build environment."
