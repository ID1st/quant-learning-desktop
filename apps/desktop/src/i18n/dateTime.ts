import type { Timeframe } from "@quant/shared";

import type { LocalDatabase } from "../features/persistence/localDatabase";
import type { AppLanguage } from "./i18n";

export const APP_TIME_ZONE_OPTIONS = [
  { value: "system", label: "跟随系统" },
  { value: "UTC", label: "协调世界时" },
  { value: "Asia/Shanghai", label: "上海" },
  { value: "Asia/Hong_Kong", label: "香港" },
  { value: "Asia/Tokyo", label: "东京" },
  { value: "Europe/London", label: "伦敦" },
  { value: "America/New_York", label: "纽约" },
  { value: "America/Chicago", label: "芝加哥" },
  { value: "America/Los_Angeles", label: "洛杉矶" },
] as const;

export type AppTimeZone = (typeof APP_TIME_ZONE_OPTIONS)[number]["value"];
export type DateTimeValue = Date | number | string;

const TIME_ZONE_COLLECTION = "preferences.time-zone";
const TIME_ZONE_DOCUMENT_VERSION = 1;
const supportedTimeZones = new Set<string>(APP_TIME_ZONE_OPTIONS.map((option) => option.value));

export function sanitizeTimeZone(value: unknown): AppTimeZone {
  return typeof value === "string" && supportedTimeZones.has(value)
    ? (value as AppTimeZone)
    : "system";
}

export function readTimeZonePreference(database: LocalDatabase): AppTimeZone {
  return database.readDocument(TIME_ZONE_COLLECTION, {
    version: TIME_ZONE_DOCUMENT_VERSION,
    fallback: "system",
    sanitize: sanitizeTimeZone,
  });
}

export function writeTimeZonePreference(database: LocalDatabase, timeZone: AppTimeZone): void {
  database.writeDocument(TIME_ZONE_COLLECTION, TIME_ZONE_DOCUMENT_VERSION, timeZone);
}

export function resolveTimeZone(timeZone: AppTimeZone): string {
  return timeZone === "system"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : timeZone;
}

function intlTimeZone(timeZone: AppTimeZone): string | undefined {
  return timeZone === "system" ? undefined : timeZone;
}

function toDate(value: DateTimeValue): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatDate(
  value: DateTimeValue,
  language: AppLanguage,
  timeZone: AppTimeZone,
): string {
  const date = toDate(value);
  if (!date) return "--";

  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: intlTimeZone(timeZone),
  }).format(date);
}

export function formatTime(
  value: DateTimeValue,
  language: AppLanguage,
  timeZone: AppTimeZone,
  includeSeconds = true,
): string {
  const date = toDate(value);
  if (!date) return includeSeconds ? "--:--:--" : "--:--";

  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
    timeZone: intlTimeZone(timeZone),
  }).format(date);
}

export function formatDateTime(
  value: DateTimeValue,
  language: AppLanguage,
  timeZone: AppTimeZone,
  includeSeconds = false,
): string {
  const date = toDate(value);
  if (!date) return "--";

  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
    timeZone: intlTimeZone(timeZone),
  }).format(date);
}

export function formatChartTime(
  timestamp: number,
  timeframe: Timeframe,
  timeZone: AppTimeZone,
  tradingDateLabel: string,
): string {
  if (timeframe === "1d" || timeframe === "1w") {
    return tradingDateLabel;
  }

  const date = toDate(timestamp);
  if (!date) return tradingDateLabel;

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeframe === "realtime" ? { second: "2-digit" as const } : {}),
    hourCycle: "h23",
    timeZone: intlTimeZone(timeZone),
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  const dateLabel = `${part("year")}-${part("month")}-${part("day")}`;
  const clock = `${part("hour")}:${part("minute")}`;

  return timeframe === "realtime"
    ? `${dateLabel} ${clock}:${part("second")}`
    : `${dateLabel} ${clock}`;
}
