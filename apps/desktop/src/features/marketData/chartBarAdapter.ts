import type { CandlePoint } from "@quant/chart";
import type { Bar } from "@quant/strategy-engine";
import type { MarketDataBar } from "./marketBarCacheService.ts";

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function formatCandleTime(timestamp: number) {
  const isoValue = new Date(timestamp).toISOString();
  const [datePart, timePart = ""] = isoValue.split("T");
  const [hour = "00", minute = "00"] = timePart.split(":");

  if (hour === "00" && minute === "00") {
    return datePart;
  }

  return `${datePart} ${hour}:${minute}`;
}

function isRenderableBar(bar: MarketDataBar) {
  return (
    isFiniteNumber(bar.timestamp) &&
    isFiniteNumber(bar.open) &&
    isFiniteNumber(bar.high) &&
    isFiniteNumber(bar.low) &&
    isFiniteNumber(bar.close) &&
    isFiniteNumber(bar.volume) &&
    bar.high >= bar.low
  );
}

export function marketBarsToStrategyBars(bars: MarketDataBar[]): Bar[] {
  return bars
    .filter(isRenderableBar)
    .map((bar) => ({
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
}

export function marketBarsToCandles(bars: MarketDataBar[]): CandlePoint[] {
  return marketBarsToStrategyBars(bars).map((bar) => ({
    ...bar,
    time: formatCandleTime(bar.timestamp),
  }));
}
