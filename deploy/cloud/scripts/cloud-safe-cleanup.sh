#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf '%s\n' "cloud-safe-cleanup.sh must run as root" >&2
  exit 1
fi

dnf clean all
journalctl --vacuum-time=7d
journalctl --vacuum-size=100M
docker image prune --force
docker builder prune --force --filter until=168h

if [[ "$(swapon --noheadings | wc -l)" -eq 0 ]]; then
  swap_path="/swapfile"
  if [[ -e "${swap_path}" ]] && ! file "${swap_path}" | grep -Fq "swap file"; then
    printf '%s\n' \
      "${swap_path} already exists and is not a swap file; refusing to overwrite it" \
      >&2
    exit 1
  fi
  if [[ ! -e "${swap_path}" ]]; then
    fallocate -l 1G "${swap_path}"
    chmod 0600 "${swap_path}"
    mkswap "${swap_path}"
  fi
  swapon "${swap_path}"
  if ! grep -Fq "${swap_path} none swap sw 0 0" /etc/fstab; then
    printf '%s\n' "${swap_path} none swap sw 0 0" >> /etc/fstab
  fi
  sysctl vm.swappiness=10
  printf '%s\n' "vm.swappiness = 10" > /etc/sysctl.d/99-quant-auth-swap.conf
fi

free -h
df -hT /
journalctl --disk-usage
docker system df
systemctl is-active docker nginx firewalld chronyd
systemctl is-enabled docker nginx firewalld chronyd
systemctl is-enabled dnf-automatic.timer || true
ss -lntup
