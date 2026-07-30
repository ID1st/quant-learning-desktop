const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatEntitlementRemaining(entitlementEndsAt: string, now = new Date()): string {
  const expiresAt = Date.parse(entitlementEndsAt);
  if (!Number.isFinite(expiresAt)) {
    return "无法计算";
  }

  const remainingMs = expiresAt - now.getTime();
  if (remainingMs <= 0) {
    return "已到期";
  }
  if (remainingMs < MINUTE_MS) {
    return "不足 1 分钟";
  }

  const days = Math.floor(remainingMs / DAY_MS);
  const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS);

  if (days > 0) {
    return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`;
  }
  return `${minutes} 分钟`;
}
