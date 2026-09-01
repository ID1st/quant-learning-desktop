import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LocalDatabase,
  createMemoryStorageDriver,
} from "../src/features/persistence/localDatabase.ts";
import {
  createTranslator,
  getNextLanguage,
  readLanguagePreference,
  sanitizeLanguage,
  writeLanguagePreference,
} from "../src/i18n/i18n.ts";
import {
  APP_TIME_ZONE_OPTIONS,
  formatChartTime,
  formatDateTime,
  formatTime,
  readTimeZonePreference,
  sanitizeTimeZone,
  writeTimeZonePreference,
} from "../src/i18n/dateTime.ts";

describe("desktop i18n", () => {
  it("accepts supported languages and falls back to Simplified Chinese", () => {
    assert.equal(sanitizeLanguage("zh-CN"), "zh-CN");
    assert.equal(sanitizeLanguage("en-US"), "en-US");
    assert.equal(sanitizeLanguage("fr-FR"), "zh-CN");
    assert.equal(sanitizeLanguage(null), "zh-CN");
  });

  it("toggles deterministically between Chinese and English", () => {
    assert.equal(getNextLanguage("zh-CN"), "en-US");
    assert.equal(getNextLanguage("en-US"), "zh-CN");
  });

  it("translates English copy, interpolates values, and safely falls back", () => {
    const english = createTranslator("en-US");
    const chinese = createTranslator("zh-CN");

    assert.equal(english("登录"), "Sign in");
    assert.equal(english("已打开{name}", { name: "Chart" }), "Opened Chart");
    assert.equal(english("未收录文案"), "未收录文案");
    assert.equal(chinese("已打开{name}", { name: "超级图表" }), "已打开超级图表");
  });

  it("persists the selected language in the versioned local database", () => {
    const database = new LocalDatabase(createMemoryStorageDriver());

    assert.equal(readLanguagePreference(database), "zh-CN");
    writeLanguagePreference(database, "en-US");
    assert.equal(readLanguagePreference(database), "en-US");
  });
});

describe("desktop time zone preferences", () => {
  it("accepts the supported market time zones and falls back to the system zone", () => {
    assert.deepEqual(
      APP_TIME_ZONE_OPTIONS.map((option) => option.value),
      [
        "system",
        "UTC",
        "Asia/Shanghai",
        "Asia/Hong_Kong",
        "Asia/Tokyo",
        "Europe/London",
        "America/New_York",
        "America/Chicago",
        "America/Los_Angeles",
      ],
    );
    assert.equal(sanitizeTimeZone("America/New_York"), "America/New_York");
    assert.equal(sanitizeTimeZone("Europe/Paris"), "system");
    assert.equal(sanitizeTimeZone(null), "system");
  });

  it("persists the selected time zone in the versioned local database", () => {
    const database = new LocalDatabase(createMemoryStorageDriver());

    assert.equal(readTimeZonePreference(database), "system");
    writeTimeZonePreference(database, "Asia/Hong_Kong");
    assert.equal(readTimeZonePreference(database), "Asia/Hong_Kong");
  });

  it("falls back to the system zone for an invalid persisted preference", () => {
    const database = new LocalDatabase(
      createMemoryStorageDriver({
        "quant-learning.preferences.time-zone": JSON.stringify({
          version: 0,
          data: "Europe/Paris",
          updatedAt: "2025-01-01T00:00:00.000Z",
        }),
      }),
    );

    assert.equal(readTimeZonePreference(database), "system");
  });

  it("formats the same instant in 24-hour time and follows daylight saving changes", () => {
    const winter = Date.UTC(2026, 0, 15, 15, 30);
    const summer = Date.UTC(2026, 6, 15, 15, 30);

    assert.equal(formatTime(winter, "en-US", "Asia/Shanghai", false), "23:30");
    assert.equal(formatTime(winter, "en-US", "America/New_York", false), "10:30");
    assert.equal(formatTime(summer, "en-US", "America/New_York", false), "11:30");
    assert.equal(formatTime(winter, "en-US", "Europe/London", false), "15:30");
    assert.equal(formatTime(summer, "en-US", "Europe/London", false), "16:30");
  });

  it("uses localized date order while applying the selected time zone", () => {
    const timestamp = Date.UTC(2026, 0, 15, 15, 30);

    assert.match(formatDateTime(timestamp, "zh-CN", "Asia/Shanghai"), /2026.*01.*15.*23:30/u);
    assert.match(formatDateTime(timestamp, "en-US", "America/New_York"), /01.*15.*2026.*10:30/u);
  });

  it("keeps daily trading dates stable while shifting intraday chart clocks", () => {
    const timestamp = Date.UTC(2026, 0, 15, 15, 30);

    assert.equal(
      formatChartTime(timestamp, "1d", "America/Los_Angeles", "2026-01-15"),
      "2026-01-15",
    );
    assert.equal(
      formatChartTime(timestamp, "1w", "America/Los_Angeles", "2026-01-12"),
      "2026-01-12",
    );
    assert.equal(
      formatChartTime(timestamp, "15m", "America/New_York", "2026-01-15 23:30"),
      "2026-01-15 10:30",
    );
    assert.equal(
      formatChartTime(timestamp, "realtime", "America/New_York", "2026-01-15 23:30:00"),
      "2026-01-15 10:30:00",
    );
  });
});
