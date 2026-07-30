#!/usr/bin/env bash
set -euo pipefail

audit_dir="${1:-/opt/quant-auth/backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_file="${audit_dir}/host-audit-${timestamp}.log"

install -d -m 0700 "${audit_dir}"
exec > >(tee "${output_file}") 2>&1

date --iso-8601=seconds
cat /etc/os-release
hostnamectl
uname -a
uptime
free -h
swapon --show --bytes
df -hT
df -ih
du -x -h --max-depth=1 /opt /var 2>/dev/null | sort -h
rpm -qa --qf '%{SIZE}\t%{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}\n' | sort -n
rpm -q kernel kernel-core
dnf repoquery --unneeded || true
systemctl list-units --type=service --state=running
systemctl list-unit-files --type=service --state=enabled
systemctl --failed
docker ps --all --size
docker image ls
docker volume ls
docker system df -v
journalctl --disk-usage
ss -lntup
rpm -q aliyun_assist cloud-init docker-ce nginx firewalld chrony dnf-automatic || true
systemctl status aliyun.service --no-pager || true
systemctl status cloud-init.service --no-pager || true
systemctl is-enabled dnf-automatic.timer --quiet \
  && systemctl status dnf-automatic.timer --no-pager \
  || true

chmod 0600 "${output_file}"
printf '%s\n' "${output_file}"
