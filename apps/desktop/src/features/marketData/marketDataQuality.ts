export interface MarketDataOhlcv {
  readonly timestamp: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly amount?: number;
}

export type MarketDataQualityIssue =
  "invalid-timestamp" | "invalid-price" | "invalid-volume" | "invalid-amount" | "inconsistent-ohlc";

export interface MarketDataQualityReport<T extends MarketDataOhlcv> {
  readonly validBars: readonly T[];
  readonly rejectedCount: number;
  readonly issues: Readonly<Record<MarketDataQualityIssue, number>>;
}

const emptyIssues: Readonly<Record<MarketDataQualityIssue, number>> = {
  "invalid-timestamp": 0,
  "invalid-price": 0,
  "invalid-volume": 0,
  "invalid-amount": 0,
  "inconsistent-ohlc": 0,
};

export function getMarketDataQualityIssue(bar: MarketDataOhlcv): MarketDataQualityIssue | null {
  if (!Number.isFinite(bar.timestamp) || bar.timestamp <= 0) return "invalid-timestamp";
  if (
    ![bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
  )
    return "invalid-price";
  if (!Number.isFinite(bar.volume) || bar.volume < 0) return "invalid-volume";
  if (bar.amount !== undefined && (!Number.isFinite(bar.amount) || bar.amount < 0))
    return "invalid-amount";
  if (
    bar.high < bar.low ||
    bar.high < bar.open ||
    bar.high < bar.close ||
    bar.low > bar.open ||
    bar.low > bar.close
  )
    return "inconsistent-ohlc";
  return null;
}

export function isMarketDataBarQualityValid(bar: MarketDataOhlcv) {
  return getMarketDataQualityIssue(bar) === null;
}

export function inspectMarketDataBars<T extends MarketDataOhlcv>(
  bars: readonly T[],
): MarketDataQualityReport<T> {
  const issues = { ...emptyIssues };
  const validBars: T[] = [];

  for (const bar of bars) {
    const issue = getMarketDataQualityIssue(bar);
    if (issue) {
      issues[issue] += 1;
    } else {
      validBars.push(bar);
    }
  }

  return { validBars, rejectedCount: bars.length - validBars.length, issues };
}
