import type { CandlePoint } from "@quant/chart";
import type { Bar } from "@quant/strategy-engine";
import type { MarketDataBar } from "./marketBarCacheService.ts";

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function formatCandleTime(timestamp: number, timeframe?: MarketDataBar["timeframe"]) {
  const isoValue = new Date(timestamp).toISOString();
  const [datePart, timePart = ""] = isoValue.split("T");
  const [hour = "00", minute = "00"] = timePart.split(":");

  if (timeframe === "1d" || timeframe === "1w" || (hour === "00" && minute === "00")) {
    return datePart;
  }

  if (timeframe === "realtime") {
    const [second = "00"] = timePart.split(":").slice(2);
    const wholeSecond = second.split(".")[0] ?? "00";
    return `${datePart} ${hour}:${minute}:${wholeSecond}`;
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
  return bars.filter(isRenderableBar).map((bar) => ({
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    time: formatCandleTime(bar.timestamp, bar.timeframe),
  }));
}
