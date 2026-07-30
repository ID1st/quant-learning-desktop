export type MarketDataProbeFailureKind =
  | "network"
  | "rate-limited"
  | "unauthorized"
  | "no-data"
  | "insufficient-history"
  | "discontinuous-history"
  | "invalid-data"
  | "unknown";

export interface MarketDataProbeFreshness {
  readonly status: "fresh" | "delayed" | "unknown";
  readonly ageSeconds?: number;
}

export interface MarketDataProbeSeriesReport {
  readonly status: "complete" | "partial" | "discontinuous" | "empty";
  readonly rows: number;
  readonly minimumRows: number;
  readonly largestGapDays?: number;
}

export function classifyMarketDataProbeFailure(error: unknown): MarketDataProbeFailureKind {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (/(?:http\s*)?429|rate.?limit|请求受限/.test(normalized)) return "rate-limited";
  if (/unauthori[sz]ed|permission|auth(?:entication)? failed|权限不足|认证失败/.test(normalized))
    return "unauthorized";
  if (/discontinuous .*?(?:series|history)|历史数据断层/.test(normalized))
    return "discontinuous-history";
  if (/(?:partial|incomplete) .*?(?:series|history)|历史数据不足/.test(normalized))
    return "insufficient-history";
  if (/no usable|received 0|no data|empty (?:response|result)|暂无数据/.test(normalized))
    return "no-data";
  if (/invalid (?:ohlc|bar|price)|inconsistent ohlc|行情数据异常/.test(normalized))
    return "invalid-data";
  if (
    /fetch failed|network|timed? out|timeout|econn|enotfound|http 5\d\d|请求失败/.test(normalized)
  )
    return "network";
  return "unknown";
}

export function evaluateMarketDataProbeFreshness(
  timestamp: number | undefined,
  now = Date.now(),
  delayedAfterMs = 15 * 60_000,
): MarketDataProbeFreshness {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) {
    return { status: "unknown" };
  }

  const ageSeconds = Math.round(Math.max(0, now - timestamp) / 1_000);
  return {
    status: ageSeconds * 1_000 <= delayedAfterMs ? "fresh" : "delayed",
    ageSeconds,
  };
}

export function evaluateMarketDataProbeSeries(
  bars: readonly { readonly timestamp: number }[],
  timeframe: "realtime" | "1d" | "1w",
): MarketDataProbeSeriesReport {
  const timestamps = bars
    .map((bar) => bar.timestamp)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
    .sort((left, right) => left - right);
  const minimumRows = timeframe === "1d" ? 60 : timeframe === "1w" ? 26 : 30;

  if (timestamps.length === 0) {
    return { status: "empty", rows: 0, minimumRows };
  }

  const largestGapDays = timestamps.slice(1).reduce((largest, timestamp, index) => {
    const previous = timestamps[index] ?? timestamp;
    return Math.max(largest, (timestamp - previous) / 86_400_000);
  }, 0);
  const maximumGapDays =
    timeframe === "1d" ? 14 : timeframe === "1w" ? 35 : Number.POSITIVE_INFINITY;

  if (largestGapDays > maximumGapDays) {
    return { status: "discontinuous", rows: timestamps.length, minimumRows, largestGapDays };
  }

  return {
    status: timestamps.length >= minimumRows ? "complete" : "partial",
    rows: timestamps.length,
    minimumRows,
    largestGapDays,
  };
}
