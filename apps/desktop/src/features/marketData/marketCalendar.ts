import type { Market } from "@quant/shared";

export interface MarketDateParts {
  year: number;
  month: number;
  day: number;
}

export interface TradingSegment {
  startMinute: number;
  endMinute: number;
}

export interface TradingSession {
  market: Market;
  date: string;
  timeZone: string;
  segments: readonly TradingSegment[];
  sourceVersion: string;
}

export type TradingCalendarErrorCode = "CALENDAR_OUT_OF_RANGE";

export type TradingCalendarResolution =
  { ok: true; session: TradingSession | null } | { ok: false; errorCode: TradingCalendarErrorCode };

interface CalendarProfile {
  timeZone: string;
  firstDate: string;
  lastDate: string;
  sourceVersion: string;
  sourceUrl: string;
  retrievedAt: string;
  holidays: ReadonlySet<string>;
  halfDays: ReadonlySet<string>;
  regularSegments: readonly TradingSegment[];
  halfDaySegments: readonly TradingSegment[];
}

function dateSet(values: readonly string[]) {
  return new Set(values);
}

const usHolidays = dateSet([
  "2025-01-01",
  "2025-01-09",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
  "2028-01-17",
  "2028-02-21",
  "2028-04-14",
  "2028-05-29",
  "2028-06-19",
  "2028-07-04",
  "2028-09-04",
  "2028-11-23",
  "2028-12-25",
]);

const cnHolidays = dateSet([
  "2025-01-01",
  "2025-01-28",
  "2025-01-29",
  "2025-01-30",
  "2025-01-31",
  "2025-02-03",
  "2025-02-04",
  "2025-04-04",
  "2025-05-01",
  "2025-05-02",
  "2025-05-05",
  "2025-06-02",
  "2025-10-01",
  "2025-10-02",
  "2025-10-03",
  "2025-10-06",
  "2025-10-07",
  "2025-10-08",
  "2026-01-01",
  "2026-01-02",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-02-20",
  "2026-02-23",
  "2026-04-06",
  "2026-05-01",
  "2026-05-04",
  "2026-05-05",
  "2026-06-19",
  "2026-09-25",
  "2026-10-01",
  "2026-10-02",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
]);

const hkHolidays = dateSet([
  "2025-01-01",
  "2025-01-29",
  "2025-01-30",
  "2025-01-31",
  "2025-04-04",
  "2025-04-18",
  "2025-04-21",
  "2025-05-01",
  "2025-05-05",
  "2025-07-01",
  "2025-10-01",
  "2025-10-07",
  "2025-10-29",
  "2025-12-25",
  "2025-12-26",
  "2026-01-01",
  "2026-02-17",
  "2026-02-18",
  "2026-02-19",
  "2026-04-03",
  "2026-04-06",
  "2026-04-07",
  "2026-05-01",
  "2026-05-25",
  "2026-06-19",
  "2026-07-01",
  "2026-10-01",
  "2026-10-19",
  "2026-12-25",
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-03-26",
  "2027-03-29",
  "2027-04-05",
  "2027-05-13",
  "2027-06-09",
  "2027-07-01",
  "2027-09-16",
  "2027-10-01",
  "2027-10-08",
  "2027-12-27",
]);

const profiles: Record<Market, CalendarProfile> = {
  US: {
    timeZone: "America/New_York",
    firstDate: "2025-01-01",
    lastDate: "2028-12-31",
    sourceVersion: "NYSE-2026-07-30",
    sourceUrl: "https://www.nyse.com/markets/hours-calendars",
    retrievedAt: "2026-07-30",
    holidays: usHolidays,
    halfDays: dateSet([
      "2025-07-03",
      "2025-11-28",
      "2025-12-24",
      "2026-11-27",
      "2026-12-24",
      "2027-11-26",
      "2028-07-03",
      "2028-11-24",
    ]),
    regularSegments: [{ startMinute: 9 * 60 + 30, endMinute: 16 * 60 }],
    halfDaySegments: [{ startMinute: 9 * 60 + 30, endMinute: 13 * 60 }],
  },
  CN: {
    timeZone: "Asia/Shanghai",
    firstDate: "2025-01-01",
    lastDate: "2026-12-31",
    sourceVersion: "SSE-2025-45",
    sourceUrl: "https://www.sse.com.cn/disclosure/dealinstruc/closed/",
    retrievedAt: "2026-07-30",
    holidays: cnHolidays,
    halfDays: dateSet([]),
    regularSegments: [
      { startMinute: 9 * 60 + 30, endMinute: 11 * 60 + 30 },
      { startMinute: 13 * 60, endMinute: 15 * 60 },
    ],
    halfDaySegments: [],
  },
  HK: {
    timeZone: "Asia/Hong_Kong",
    firstDate: "2025-01-01",
    lastDate: "2027-12-31",
    sourceVersion: "HKEX-MO-DT-133-26",
    sourceUrl: "https://www.hkex.com.hk/News/HKEX-Calendar?sc_lang=en",
    retrievedAt: "2026-07-30",
    holidays: hkHolidays,
    halfDays: dateSet([
      "2025-01-28",
      "2025-12-24",
      "2025-12-31",
      "2026-02-16",
      "2026-12-24",
      "2026-12-31",
      "2027-02-05",
      "2027-12-24",
      "2027-12-31",
    ]),
    regularSegments: [
      { startMinute: 9 * 60 + 30, endMinute: 12 * 60 },
      { startMinute: 13 * 60, endMinute: 16 * 60 },
    ],
    halfDaySegments: [{ startMinute: 9 * 60 + 30, endMinute: 12 * 60 }],
  },
};

export function formatMarketDate(parts: MarketDateParts) {
  return `${parts.year.toString().padStart(4, "0")}-${parts.month
    .toString()
    .padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`;
}

export function getZonedDateParts(date: Date, timeZone: string): MarketDateParts {
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
  const zonedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return zonedAsUtc - date.getTime();
}

export function zonedMinuteToTimestamp(
  parts: MarketDateParts,
  timeZone: string,
  minuteOfDay: number,
) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
}

export function addMarketDays(parts: MarketDateParts, delta: number): MarketDateParts {
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

export function getMarketTimeZone(market: Market) {
  return profiles[market].timeZone;
}

export function resolveTradingDate(
  market: Market,
  parts: MarketDateParts,
): TradingCalendarResolution {
  const profile = profiles[market];
  const date = formatMarketDate(parts);
  if (date < profile.firstDate || date > profile.lastDate) {
    return { ok: false, errorCode: "CALENDAR_OUT_OF_RANGE" };
  }
  if (!isWeekday(parts) || profile.holidays.has(date)) {
    return { ok: true, session: null };
  }
  return {
    ok: true,
    session: {
      market,
      date,
      timeZone: profile.timeZone,
      segments: profile.halfDays.has(date) ? profile.halfDaySegments : profile.regularSegments,
      sourceVersion: profile.sourceVersion,
    },
  };
}

export function resolveTradingSessionAt(
  market: Market,
  timestamp: number,
): TradingCalendarResolution {
  const profile = profiles[market];
  return resolveTradingDate(market, getZonedDateParts(new Date(timestamp), profile.timeZone));
}

export function getSessionSegments(
  session: TradingSession,
): Array<TradingSegment & { startTime: number; endTime: number }> {
  const [year, month, day] = session.date.split("-").map(Number);
  const parts = { year, month, day };
  return session.segments.map((segment) => ({
    ...segment,
    startTime: zonedMinuteToTimestamp(parts, session.timeZone, segment.startMinute),
    endTime: zonedMinuteToTimestamp(parts, session.timeZone, segment.endMinute),
  }));
}

export function findPreviousTradingSession(
  market: Market,
  before: MarketDateParts,
): TradingCalendarResolution {
  let candidate = addMarketDays(before, -1);
  for (let index = 0; index < 370; index += 1) {
    const resolution = resolveTradingDate(market, candidate);
    if (!resolution.ok || resolution.session) {
      return resolution;
    }
    candidate = addMarketDays(candidate, -1);
  }
  return { ok: false, errorCode: "CALENDAR_OUT_OF_RANGE" };
}

export function getTradingSegmentAt(market: Market, timestamp: number) {
  const resolution = resolveTradingSessionAt(market, timestamp);
  if (!resolution.ok || !resolution.session) {
    return null;
  }
  const segments = getSessionSegments(resolution.session);
  const segmentIndex = segments.findIndex(
    (segment) => timestamp >= segment.startTime && timestamp < segment.endTime,
  );
  if (segmentIndex < 0) {
    return null;
  }
  return {
    session: resolution.session,
    segmentIndex,
    ...segments[segmentIndex],
  };
}

export function getCalendarCoverage(market: Market) {
  const profile = profiles[market];
  return {
    firstDate: profile.firstDate,
    lastDate: profile.lastDate,
    sourceVersion: profile.sourceVersion,
    sourceUrl: profile.sourceUrl,
    retrievedAt: profile.retrievedAt,
  };
}
