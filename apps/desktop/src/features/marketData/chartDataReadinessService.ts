import type { Timeframe } from "@quant/shared";

export type ChartLoadStage = "cache" | "history" | "layers" | "ready" | "degraded" | "error";

export interface ChartLoadState {
  readonly stage: ChartLoadStage;
  readonly message: string;
  readonly cachedBarCount: number;
}

export function getMinimumRenderableBarCount(timeframe: Timeframe) {
  if (timeframe === "realtime" || timeframe === "1m") return 30;
  // Historical providers can legitimately return a short, valid series for newly listed or newly added symbols.
  // Keep the sparse-data guard for intraday lines, but never leave daily/weekly charts loading after two valid bars.
  return 2;
}

export function hasRenderableChartData(
  timeframe: Timeframe,
  barCount: number,
  options: { readonly allowSparseIntraday?: boolean } = {},
) {
  const minimumBars =
    options.allowSparseIntraday && (timeframe === "realtime" || timeframe === "1m")
      ? 2
      : getMinimumRenderableBarCount(timeframe);
  return barCount >= minimumBars;
}

export function createChartLoadState(
  stage: ChartLoadStage,
  symbol: string,
  timeframe: Timeframe,
  cachedBarCount: number,
  detail?: string,
): ChartLoadState {
  const periodLabel = timeframe === "realtime" ? "分时" : timeframe === "1w" ? "周线" : "日线";
  const defaultMessage: Record<ChartLoadStage, string> = {
    cache: `正在读取 ${symbol} ${periodLabel}缓存…`,
    history: `正在同步 ${symbol} ${periodLabel}数据…`,
    layers: "正在加载指标和策略图层…",
    ready: `${symbol} ${periodLabel}数据已就绪。`,
    degraded: `${symbol} 正在使用本地缓存。`,
    error: `${symbol} ${periodLabel}数据暂不可用。`,
  };

  return { stage, message: detail ?? defaultMessage[stage], cachedBarCount };
}
