#!/usr/bin/env bash
set -euo pipefail

service_root="/opt/quant-auth"
compose_file="${service_root}/current/deploy/cloud/docker-compose.yml"
backup_dir="${service_root}/backups/postgres"
certificate_file="/etc/nginx/ssl/fnndp.xyz/fullchain.pem"
access_log="/var/log/nginx/quant-auth-access.log"
failure_count=0

report_failure() {
  echo "ALERT: $1" >&2
  failure_count=$((failure_count + 1))
}

disk_percent="$(df -P / | awk 'NR == 2 {gsub(/%/, "", $5); print $5}')"
if [[ -z "${disk_percent}" || "${disk_percent}" -ge 80 ]]; then
  report_failure "root filesystem usage is ${disk_percent:-unknown}%"
fi

available_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
if [[ -z "${available_kib}" || "${available_kib}" -lt 262144 ]]; then
  report_failure "available memory is ${available_kib:-unknown} KiB"
fi

if ! curl --fail --silent --show-error --max-time 5 \
  http://127.0.0.1:8787/health/ready >/dev/null; then
  sleep 2
  if ! curl --fail --silent --show-error --max-time 5 \
    http://127.0.0.1:8787/health/ready >/dev/null; then
    report_failure "authentication API failed two readiness checks"
  fi
fi

latest_backup="$(find "${backup_dir}" -maxdepth 1 -type f -name 'quant-auth-*.dump' -print 2>/dev/null | sort | tail -n 1)"
if [[ -z "${latest_backup}" ]]; then
  report_failure "no PostgreSQL backup exists"
else
  backup_age_seconds="$(( $(date +%s) - $(stat -c %Y "${latest_backup}") ))"
  if [[ "${backup_age_seconds}" -gt 93600 ]]; then
    report_failure "latest PostgreSQL backup is older than 26 hours"
  fi
fi

if [[ ! -f "${certificate_file}" ]]; then
  report_failure "TLS certificate is missing"
elif ! openssl x509 -checkend 1814400 -noout -in "${certificate_file}" >/dev/null; then
  report_failure "TLS certificate expires in less than 21 days"
fi

if [[ -f "${compose_file}" ]]; then
  outbox_state="$(
    docker compose -f "${compose_file}" exec -T postgres psql -At \
      -U quant_auth \
      -d quant_auth \
      -c "SELECT count(*) FILTER (WHERE status = 'FAILED' AND attempt_count >= 8), COALESCE(EXTRACT(EPOCH FROM now() - min(created_at) FILTER (WHERE status IN ('PENDING','FAILED','SENDING'))), 0)::bigint FROM email_outbox;" \
      2>/dev/null || printf 'query-failed|query-failed'
  )"
  terminal_failures="${outbox_state%%|*}"
  oldest_pending_seconds="${outbox_state##*|}"
  if [[ "${terminal_failures}" == "query-failed" ]]; then
    report_failure "email outbox health query failed"
  else
    if [[ "${terminal_failures}" -gt 0 ]]; then
      report_failure "email outbox has ${terminal_failures} terminal failures"
    fi
    if [[ "${oldest_pending_seconds}" -gt 600 ]]; then
      report_failure "oldest email outbox item is older than 10 minutes"
    fi
  fi
else
  report_failure "active Compose deployment is missing"
fi

if [[ -f "${access_log}" ]]; then
  cutoff_epoch="$(( $(date +%s) - 300 ))"
  read -r request_count server_error_count < <(
    jq -r --argjson cutoff "${cutoff_epoch}" \
      'select((.msec | tonumber) >= $cutoff) | .status' \
      "${access_log}" 2>/dev/null |
      awk '{total += 1; if ($1 >= 500 && $1 <= 599) errors += 1} END {print total + 0, errors + 0}'
  )
  if [[ "${request_count}" -gt 0 ]] &&
    [[ $((server_error_count * 100)) -gt $((request_count * 5)) ]]; then
    report_failure "five-minute 5xx ratio exceeds 5% (${server_error_count}/${request_count})"
  fi
fi

if [[ "${failure_count}" -gt 0 ]]; then
  exit 1
fi

echo "quant-auth operational checks passed"
