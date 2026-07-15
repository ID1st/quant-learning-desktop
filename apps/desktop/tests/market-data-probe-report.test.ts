import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyMarketDataProbeFailure,
  evaluateMarketDataProbeFreshness,
  evaluateMarketDataProbeSeries,
} from "../src/features/marketData/marketDataProbeReport.ts";

test("market data probe classifies actionable upstream failures without exposing raw errors", () => {
  assert.equal(classifyMarketDataProbeFailure("Tencent Finance request failed with HTTP 429."), "rate-limited");
  assert.equal(classifyMarketDataProbeFailure("AlphaFeed permission denied."), "unauthorized");
  assert.equal(classifyMarketDataProbeFailure("Tencent Finance returned no usable historical data for AAPL.US."), "no-data");
  assert.equal(classifyMarketDataProbeFailure("Partial weekly historical series: 5 of 26 rows."), "insufficient-history");
  assert.equal(classifyMarketDataProbeFailure("Partial 1w series: 5 of 26 rows."), "insufficient-history");
  assert.equal(classifyMarketDataProbeFailure("Discontinuous daily historical series: gap is 300 days."), "discontinuous-history");
  assert.equal(classifyMarketDataProbeFailure("Discontinuous 1d series: gap is 300 days."), "discontinuous-history");
  assert.equal(classifyMarketDataProbeFailure("Expected at least 1 bars, received 0."), "no-data");
  assert.equal(classifyMarketDataProbeFailure("Stock SDK request failed: fetch failed."), "network");
  assert.equal(classifyMarketDataProbeFailure("Invalid OHLC values."), "invalid-data");
});

test("market data probe reports freshness without treating closed-market data as a request failure", () => {
  assert.equal(evaluateMarketDataProbeFreshness(Date.now() - 5_000).status, "fresh");
  assert.equal(evaluateMarketDataProbeFreshness(Date.now() - 20 * 60_000).status, "delayed");
  assert.equal(evaluateMarketDataProbeFreshness(undefined).status, "unknown");
});

test("market data probe rejects sparse or discontinuous daily and weekly history", () => {
  const weekly = Array.from({ length: 5 }, (_, index) => ({ timestamp: Date.UTC(2026, 0, 1 + index * 7) }));
  assert.equal(evaluateMarketDataProbeSeries(weekly, "1w").status, "partial");

  const dailyWithGap = Array.from({ length: 60 }, (_, index) => ({
    timestamp: Date.UTC(2026, 0, index < 30 ? index + 1 : index + 365),
  }));
  assert.equal(evaluateMarketDataProbeSeries(dailyWithGap, "1d").status, "discontinuous");
});
