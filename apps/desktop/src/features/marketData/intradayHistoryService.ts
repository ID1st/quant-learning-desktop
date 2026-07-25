import type { Market } from "@quant/shared";
import type { AlphaFeedMarketDataBar } from "@quant/api-client";
import type { MarketDataBar } from "./marketBarCacheService.ts";

interface MarketSessionProfile {
  timeZone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

interface MarketDateParts {
  year: number;
  month: number;
  day: number;
}

export interface IntradayHistoryWindow {
  startTime: number;
  endTime: number;
  isMarketOpen: boolean;
}

const minuteMs = 60_000;
const intradayWarmupSessionCount = 5;

function getMarketSessionProfile(market: Market): MarketSessionProfile {
  if (market === "US") {
    return { timeZone: "America/New_York", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 };
  }

  if (market === "HK") {
    return { timeZone: "Asia/Hong_Kong", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 };
  }

  return { timeZone: "Asia/Shanghai", openHour: 9, openMinute: 30, closeHour: 15, closeMinute: 0 };
}

function getZonedDateParts(date: Date, timeZone: string): MarketDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const zonedAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));

  return zonedAsUtc - date.getTime();
}

function zonedDateTimeToTimestamp(parts: MarketDateParts, profile: MarketSessionProfile, hour: number, minute: number) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), profile.timeZone);

  return utcGuess - getTimeZoneOffsetMs(new Date(firstPass), profile.timeZone);
}

function addMarketDays(parts: MarketDateParts, delta: number): MarketDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta, 12));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function isWeekday(parts: MarketDateParts) {
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function findPreviousWeekday(parts: MarketDateParts) {
  let candidate = addMarketDays(parts, -1);

  while (!isWeekday(candidate)) {
    candidate = addMarketDays(candidate, -1);
  }

  return candidate;
}

function findPreviousWeekdays(parts: MarketDateParts, count: number) {
  let candidate = parts;

  for (let index = 0; index < count; index += 1) {
    candidate = findPreviousWeekday(candidate);
  }

  return candidate;
}

function sameMarketDate(left: MarketDateParts, right: MarketDateParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function getSessionOpen(parts: MarketDateParts, profile: MarketSessionProfile) {
  return zonedDateTimeToTimestamp(parts, profile, profile.openHour, profile.openMinute);
}

function getSessionClose(parts: MarketDateParts, profile: MarketSessionProfile) {
  return zonedDateTimeToTimestamp(parts, profile, profile.closeHour, profile.closeMinute);
}

export function getIntradayHistoryWindow(market: Market, now = Date.now(), sessionCount = intradayWarmupSessionCount): IntradayHistoryWindow {
  const profile = getMarketSessionProfile(market);
  const today = getZonedDateParts(new Date(now), profile.timeZone);
  const todayIsWeekday = isWeekday(today);
  const todayOpen = getSessionOpen(today, profile);
  const todayClose = getSessionClose(today, profile);
  const isTodaySessionStarted = todayIsWeekday && now >= todayOpen;
  const isMarketOpen = todayIsWeekday && now >= todayOpen && now < todayClose;
  const latestSessionDate = isTodaySessionStarted ? today : findPreviousWeekday(today);
  const startSessionDate = findPreviousWeekdays(latestSessionDate, Math.max(1, Math.floor(sessionCount)) - 1);
  const latestSessionClose = getSessionClose(latestSessionDate, profile);
  const endTime = sameMarketDate(latestSessionDate, today) && isMarketOpen ? now : latestSessionClose;

  return {
    startTime: getSessionOpen(startSessionDate, profile),
    endTime,
    isMarketOpen,
  };
}

export function isMarketSessionOpen(market: Market, now = Date.now()) {
  return getIntradayHistoryWindow(market, now).isMarketOpen;
}

export function alphaFeedMinuteBarsToRealtimeBars(
  bars: AlphaFeedMarketDataBar[],
  key: Pick<MarketDataBar, "symbol" | "market">,
  window: Pick<IntradayHistoryWindow, "startTime" | "endTime">,
): MarketDataBar[] {
  return bars
    .filter((bar) => bar.symbol === key.symbol && bar.market === key.market)
    .filter((bar) => bar.timestamp >= window.startTime && bar.timestamp <= window.endTime)
    .map((bar) => ({
      symbol: key.symbol,
      market: key.market,
      timeframe: "realtime",
      timestamp: Math.floor(bar.timestamp / minuteMs) * minuteMs,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      amount: bar.amount,
      provider: bar.provider,
    }));
}
