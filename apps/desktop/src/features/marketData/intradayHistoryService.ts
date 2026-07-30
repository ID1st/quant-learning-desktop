import type { AlphaFeedMarketDataBar } from "@quant/api-client";
import type { Market } from "@quant/shared";
import {
  findPreviousTradingSession,
  getMarketTimeZone,
  getSessionSegments,
  getZonedDateParts,
  resolveTradingDate,
  type MarketDateParts,
  type TradingCalendarErrorCode,
  type TradingSession,
} from "./marketCalendar.ts";
import type { MarketDataBar } from "./marketBarCacheService.ts";

export interface IntradayHistoryWindow {
  startTime: number;
  endTime: number;
  isMarketOpen: boolean;
  errorCode?: TradingCalendarErrorCode;
}

const minuteMs = 60_000;
const intradayWarmupSessionCount = 5;

function previousSession(
  market: Market,
  before: MarketDateParts,
): TradingSession | null {
  const resolution = findPreviousTradingSession(market, before);
  return resolution.ok ? resolution.session : null;
}

function findStartSession(
  market: Market,
  latest: TradingSession,
  count: number,
) {
  let session = latest;
  const [year, month, day] = latest.date.split("-").map(Number);
  let parts = { year, month, day };
  for (let index = 1; index < Math.max(1, Math.floor(count)); index += 1) {
    const resolution = findPreviousTradingSession(market, parts);
    if (!resolution.ok || !resolution.session) {
      break;
    }
    session = resolution.session;
    const values = session.date.split("-").map(Number);
    parts = { year: values[0], month: values[1], day: values[2] };
  }
  return session;
}

export function getIntradayHistoryWindow(
  market: Market,
  now = Date.now(),
  sessionCount = intradayWarmupSessionCount,
): IntradayHistoryWindow {
  const today = getZonedDateParts(
    new Date(now),
    getMarketTimeZone(market),
  );
  const todayResolution = resolveTradingDate(market, today);
  if (!todayResolution.ok) {
    return {
      startTime: now,
      endTime: now,
      isMarketOpen: false,
      errorCode: todayResolution.errorCode,
    };
  }

  let latestSession: TradingSession | null = todayResolution.session;
  let isMarketOpen = false;
  let endTime = now;

  if (latestSession) {
    const segments = getSessionSegments(latestSession);
    const firstOpen = segments[0]?.startTime ?? now;
    if (now < firstOpen) {
      latestSession = previousSession(market, today);
    } else {
      const active = segments.find(
        (segment) => now >= segment.startTime && now < segment.endTime,
      );
      isMarketOpen = Boolean(active);
      if (active) {
        endTime = now;
      } else {
        const completed = segments.filter(
          (segment) => segment.endTime <= now,
        );
        endTime = completed.at(-1)?.endTime ?? firstOpen;
      }
    }
  } else {
    latestSession = previousSession(market, today);
  }

  if (!latestSession) {
    return {
      startTime: now,
      endTime: now,
      isMarketOpen: false,
      errorCode: "CALENDAR_OUT_OF_RANGE",
    };
  }

  const latestSegments = getSessionSegments(latestSession);
  if (latestSession.date !== formatParts(today)) {
    endTime = latestSegments.at(-1)?.endTime ?? now;
  }
  const startSession = findStartSession(
    market,
    latestSession,
    sessionCount,
  );
  const startTime = getSessionSegments(startSession)[0]?.startTime ?? now;

  return { startTime, endTime, isMarketOpen };
}

function formatParts(parts: MarketDateParts) {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function isMarketSessionOpen(
  market: Market,
  now = Date.now(),
) {
  return getIntradayHistoryWindow(market, now).isMarketOpen;
}

export function alphaFeedMinuteBarsToRealtimeBars(
  bars: AlphaFeedMarketDataBar[],
  key: Pick<MarketDataBar, "symbol" | "market">,
  window: Pick<IntradayHistoryWindow, "startTime" | "endTime">,
): MarketDataBar[] {
  return bars
    .filter((bar) => bar.symbol === key.symbol && bar.market === key.market)
    .filter(
      (bar) =>
        bar.timestamp >= window.startTime &&
        bar.timestamp <= window.endTime,
    )
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
