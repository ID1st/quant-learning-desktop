import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alphaFeedMinuteBarsToRealtimeBars,
  getIntradayHistoryWindow,
  isMarketSessionOpen,
} from "../src/features/marketData/intradayHistoryService.ts";
import type { AlphaFeedMarketDataBar } from "@quant/api-client";

test("getIntradayHistoryWindow includes five US sessions of warmup while market is open", () => {
  const now = Date.UTC(2026, 6, 2, 15, 0); // 2026-07-02 11:00 New York
  const window = getIntradayHistoryWindow("US", now);

  assert.equal(window.isMarketOpen, true);
  assert.equal(window.startTime, Date.UTC(2026, 5, 26, 13, 30)); // fifth session including today, 09:30 EDT
  assert.equal(window.endTime, now);
  assert.equal(isMarketSessionOpen("US", now), true);
});

test("getIntradayHistoryWindow stops at close after a trading session ends", () => {
  const now = Date.UTC(2026, 6, 2, 22, 0); // 2026-07-02 18:00 New York
  const window = getIntradayHistoryWindow("US", now);

  assert.equal(window.isMarketOpen, false);
  assert.equal(window.startTime, Date.UTC(2026, 5, 26, 13, 30));
  assert.equal(window.endTime, Date.UTC(2026, 6, 2, 20, 0)); // 16:00 EDT
});

test("getIntradayHistoryWindow uses latest complete session on weekends", () => {
  const now = Date.UTC(2026, 6, 4, 14, 0); // Saturday
  const window = getIntradayHistoryWindow("US", now);

  assert.equal(window.isMarketOpen, false);
  assert.equal(window.startTime, Date.UTC(2026, 5, 29, 13, 30));
  assert.equal(window.endTime, Date.UTC(2026, 6, 3, 20, 0));
});

test("alphaFeedMinuteBarsToRealtimeBars keeps only requested window and converts timeframe", () => {
  const bars: AlphaFeedMarketDataBar[] = [
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1m",
      timestamp: Date.UTC(2026, 6, 2, 13, 29),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1,
      amount: 100,
      provider: "alphafeed",
    },
    {
      symbol: "AAPL.US",
      market: "US",
      timeframe: "1m",
      timestamp: Date.UTC(2026, 6, 2, 13, 30, 30),
      open: 101,
      high: 103,
      low: 100,
      close: 102,
      volume: 10,
      amount: 1020,
      provider: "alphafeed",
    },
  ];

  const realtimeBars = alphaFeedMinuteBarsToRealtimeBars(
    bars,
    { symbol: "AAPL.US", market: "US" },
    { startTime: Date.UTC(2026, 6, 2, 13, 30), endTime: Date.UTC(2026, 6, 2, 20, 0) },
  );

  assert.equal(realtimeBars.length, 1);
  assert.equal(realtimeBars[0]?.timeframe, "realtime");
  assert.equal(realtimeBars[0]?.timestamp, Date.UTC(2026, 6, 2, 13, 30));
  assert.equal(realtimeBars[0]?.close, 102);
});
