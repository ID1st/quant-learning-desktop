import type { CandlePoint } from "@quant/chart";
import type { Bar } from "@quant/strategy-engine";
import type { MarketDataBar } from "./marketBarCacheService.ts";

function isFiniteNumber(value: number) {
  return Number.isFinite(value);
}

function getBeijingDateParts(timestamp: number) {
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

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function formatCandleTime(timestamp: number, timeframe?: MarketDataBar["timeframe"]) {
  const { date, hour, minute, second } = getBeijingDateParts(timestamp);
  if (timeframe === "1d" || timeframe === "1w" || (hour === "00" && minute === "00")) {
    return date;
  }

  if (timeframe === "realtime") {
    return `${date} ${hour}:${minute}:${second}`;
  }

  return `${date} ${hour}:${minute}`;
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
