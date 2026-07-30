import type { Timeframe } from "@quant/shared";
import type { CandlePoint, ChartContext } from "./contracts.ts";
import { clampChartVisibleRange, type ChartVisibleRange } from "./viewportMath.ts";

export interface ChartScaleDomain {
  minPrice: number;
  maxPrice: number;
}

export const defaultContext: ChartContext = {
  symbol: "AAPL",
  market: "US",
  timeframe: "1d",
};

export function generateCandles(context: ChartContext): CandlePoint[] {
  const seed = context.symbol.split("").reduce((total, char) => total + char.charCodeAt(0), 0);
  let previousClose = 166 + (seed % 28);
  const intervalMs =
    context.timeframe === "1w"
      ? 7 * 24 * 60 * 60_000
      : context.timeframe === "realtime"
        ? 60_000
        : 24 * 60 * 60_000;
  const endTimestamp = Date.now();

  return Array.from({ length: 64 }, (_, index) => {
    const wave = Math.sin((index + seed) / 4.2) * 3.8 + Math.cos(index / 7) * 2.4;
    const open = previousClose + Math.sin(index / 3) * 1.1;
    const close = open + wave * 0.42 + (index % 5 === 0 ? 1.2 : -0.3);
    const high = Math.max(open, close) + 1.4 + Math.abs(Math.sin(index)) * 2.1;
    const low = Math.min(open, close) - 1.2 - Math.abs(Math.cos(index)) * 1.8;
    const volume = 580000 + Math.round(Math.abs(wave) * 130000 + (index % 9) * 42000);
    previousClose = close;
    const timestamp = endTimestamp - (63 - index) * intervalMs;

    return {
      time: formatBeijingChartTime(timestamp, context.timeframe),
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      signal:
        index === 14 || index === 38 ? "buy" : index === 27 || index === 52 ? "sell" : undefined,
    };
  });
}

export function createSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) {
    return "";
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${path} Q ${controlX} ${previous.y} ${point.x} ${point.y}`;
  }, "");
}

export function formatPrice(value: number) {
  return value.toFixed(2);
}

function formatBeijingChartTime(timestamp: number, timeframe: Timeframe) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const date = `${value("year")}-${value("month")}-${value("day")}`;

  if (timeframe === "realtime") {
    return `${date} ${value("hour")}:${value("minute")}:${value("second")}`;
  }

  if (timeframe === "1d" || timeframe === "1w") {
    return date;
  }

  return `${date} ${value("hour")}:${value("minute")}`;
}

export function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

export function createDefaultVisibleRange(
  candleCount: number,
  visibleBarCount = 96,
): ChartVisibleRange {
  return {
    start: Math.max(0, candleCount - Math.max(12, visibleBarCount)),
    end: candleCount,
  };
}

export function calculateScaleDomain(
  candles: CandlePoint[],
  range: ChartVisibleRange,
): ChartScaleDomain {
  const safeRange = clampChartVisibleRange(range, candles.length);
  const domainCandles = candles.slice(safeRange.start, safeRange.end);
  const highs = domainCandles.map((candle) => candle.high).filter(isFiniteNumber);
  const lows = domainCandles.map((candle) => candle.low).filter(isFiniteNumber);
  const closeFallbacks = domainCandles.map((candle) => candle.close).filter(isFiniteNumber);
  const fallbackPrice = closeFallbacks[closeFallbacks.length - 1] ?? 1;
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const safeMaxPrice = isFiniteNumber(maxPrice) ? maxPrice : fallbackPrice;
  const safeMinPrice = isFiniteNumber(minPrice) ? minPrice : fallbackPrice;
  const padding = Math.max((safeMaxPrice - safeMinPrice) * 0.08, safeMaxPrice * 0.002, 0.01);

  return {
    minPrice: safeMinPrice - padding,
    maxPrice: safeMaxPrice + padding,
  };
}
