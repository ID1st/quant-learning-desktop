import type { Market } from "@quant/shared";
import type { Bar, StrategyDefinition, StrategyOutput } from "./contracts.ts";

export function createPlaceholderOutput(
  strategy: StrategyDefinition,
  enabled = true,
): StrategyOutput {
  return {
    signals: [],
    overlays: [],
    render: {
      strategyId: strategy.key,
      strategyName: strategy.name,
      enabled,
      zIndex: 10,
      elements: [],
    },
    metrics: {},
    logs: [`${strategy.name} 当前仅完成注册，Pine Script 转译将在后续模块进行。`],
    alerts: [],
  };
}

export function getNumberParameter(
  parameters: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = parameters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function getPositiveNumberParameter(
  parameters: Record<string, unknown>,
  key: string,
  fallback: number,
) {
  const value = getNumberParameter(parameters, key, fallback);
  return value > 0 ? value : fallback;
}

export function getBooleanParameter(
  parameters: Record<string, unknown>,
  key: string,
  fallback: boolean,
) {
  const value = parameters[key];
  return typeof value === "boolean" ? value : fallback;
}

export function getStringParameter(
  parameters: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  const value = parameters[key];
  return typeof value === "string" ? value : fallback;
}

export function getColorParameter(
  parameters: Record<string, unknown>,
  key: string,
  fallback: string,
) {
  const value = getStringParameter(parameters, key, fallback);
  return /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

export function wilderMovingAverage(
  values: readonly number[],
  period: number,
): Array<number | null> {
  const length = Math.max(1, Math.round(period));
  let previous: number | null = null;

  return values.map((value, index) => {
    if (previous === null) {
      const window = values.slice(index - length + 1, index + 1);
      if (window.length < length) {
        return null;
      }

      previous = window.reduce((total, item) => total + item, 0) / length;
      return previous;
    }

    previous = (previous * (length - 1) + value) / length;
    return previous;
  });
}

export function pineAtr(bars: readonly Bar[], period: number): Array<number | null> {
  const trueRanges = bars.map((bar, index) => {
    const previousClose = bars[index - 1]?.close ?? bar.close;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
  });

  return wilderMovingAverage(trueRanges, period);
}

export function isSeriesNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export const marketTimeZones: Record<Market, string> = {
  US: "America/New_York",
  HK: "Asia/Hong_Kong",
  CN: "Asia/Shanghai",
};
const zonedDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function getZonedDateParts(
  timestamp: number,
  timeZone: string,
): CalendarDate & { hour: number; minute: number } {
  let formatter = zonedDateFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    zonedDateFormatterCache.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function shiftCalendarDate(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function calendarDateKey(date: CalendarDate) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

export function zonedDateTimeToTimestamp(
  date: CalendarDate,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const desiredAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let timestamp = desiredAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedDateParts(timestamp, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const correction = desiredAsUtc - actualAsUtc;
    timestamp += correction;
    if (correction === 0) {
      break;
    }
  }
  return timestamp;
}
