import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getLongPortConfigOptions,
  mapLongPortCandlesticksToBars,
  sanitizeLongPortCandlestickCount,
} from "../src/electron/longPortBridge.ts";

test("default LongBridge endpoint lets the SDK select the regional access point", () => {
  assert.deepEqual(getLongPortConfigOptions("https://openapi.longbridge.com/"), { language: 0 });
  assert.deepEqual(getLongPortConfigOptions("https://openapi.longbridge.cn"), {
    httpUrl: "https://openapi.longbridge.cn",
    language: 0,
  });
});

function decimal(value: string) {
  return {
    toString: () => value,
  };
}

test("mapLongPortCandlesticksToBars converts 1m history into realtime bars", () => {
  const bars = mapLongPortCandlesticksToBars(
    [
      {
        timestamp: new Date("2026-07-01T13:30:00.000Z"),
        open: decimal("100.1"),
        high: decimal("101.2"),
        low: decimal("99.8"),
        close: decimal("100.9"),
        volume: 1200,
        turnover: decimal("120000.5"),
      },
    ],
    { symbol: "AAPL.US", market: "US", timeframe: "1m" },
  );

  assert.deepEqual(bars, [
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      timestamp: Date.parse("2026-07-01T13:30:00.000Z"),
      open: 100.1,
      high: 101.2,
      low: 99.8,
      close: 100.9,
      volume: 1200,
      amount: 120000.5,
      provider: "longport",
    },
  ]);
});

test("mapLongPortCandlesticksToBars filters by requested time window", () => {
  const bars = mapLongPortCandlesticksToBars(
    [
      {
        timestamp: new Date("2026-07-01T13:29:00.000Z"),
        open: decimal("99"),
        high: decimal("99"),
        low: decimal("99"),
        close: decimal("99"),
        volume: 100,
        turnover: decimal("9900"),
      },
      {
        timestamp: new Date("2026-07-01T13:30:00.000Z"),
        open: decimal("100"),
        high: decimal("101"),
        low: decimal("99"),
        close: decimal("100.5"),
        volume: 200,
        turnover: decimal("20000"),
      },
    ],
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "realtime",
      startTime: Date.parse("2026-07-01T13:30:00.000Z"),
      endTime: Date.parse("2026-07-01T13:31:00.000Z"),
    },
  );

  assert.equal(bars.length, 1);
  assert.equal(bars[0]?.timestamp, Date.parse("2026-07-01T13:30:00.000Z"));
});

test("sanitizeLongPortCandlestickCount caps 1m requests below provider limits", () => {
  assert.equal(sanitizeLongPortCandlestickCount("1m", 2_000), 1_000);
  assert.equal(sanitizeLongPortCandlestickCount("realtime"), 1_000);
  assert.equal(sanitizeLongPortCandlestickCount("1d", 600), 600);
});
