export type AlphaFeedInitialSyncMode = "historical" | "intraday";

export function isAlphaFeedRateLimitError(message: string) {
  const normalized = message.toLowerCase();
  return (
    message.includes("频率") || message.includes("HTTP 429") || normalized.includes("rate limit")
  );
}

export function isAlphaFeedInitialSyncFailureBlocking(
  message: string,
  mode: AlphaFeedInitialSyncMode,
) {
  if (isAlphaFeedRateLimitError(message)) return false;
  const isPermissionError =
    message.includes("套餐无此功能或市场权限") || message.includes("HTTP 403");
  return mode === "historical" || !isPermissionError;
}
