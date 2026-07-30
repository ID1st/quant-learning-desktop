import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatFallbackLabel,
  formatMarketDataCapability,
  formatMarketDataProviderLabel,
  formatMarketDataProviderStatus,
  summarizeMarketDataProviderHealth,
} from "../src/features/marketData/marketDataProviderDiagnostics.ts";
import type {
  MarketDataProviderCapability,
  MarketDataProviderHealthView,
} from "../src/features/marketData/marketDataProviderGateway.ts";

const capability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: true,
  intradayBars: true,
  websocket: false,
  batchQuote: true,
  markets: ["US", "HK", "CN"],
  timeframes: ["realtime", "1d", "1w"],
  delayLevel: "realtime",
};

function createHealth(
  overrides: Partial<MarketDataProviderHealthView> = {},
): MarketDataProviderHealthView {
  return {
    provider: "stock-sdk",
    status: "healthy",
    message: "ready",
    checkedAt: "2026-07-08T00:00:00.000Z",
    capability,
    ...overrides,
  };
}

describe("market data provider diagnostics", () => {
  it("formats provider, status and capability labels", () => {
    assert.equal(formatMarketDataProviderLabel("stock-sdk"), "Stock SDK");
    assert.equal(formatMarketDataProviderLabel("alphafeed-rest"), "AlphaFeed REST");
    assert.equal(formatMarketDataProviderStatus("rateLimited"), "请求受限");
    assert.equal(formatMarketDataCapability("intradayBars"), "分时数据");
  });

  it("summarizes active provider health for chart badges", () => {
    const summary = summarizeMarketDataProviderHealth(createHealth(), {
      capability: "realtimeQuote",
      message: "批量轮询成功",
    });

    assert.equal(summary.providerLabel, "Stock SDK");
    assert.equal(summary.statusLabel, "可用");
    assert.equal(summary.message, "实时快照：Stock SDK · 可用 · 批量轮询成功");
  });

  it("describes fallback when a higher priority provider was tried first", () => {
    const summary = summarizeMarketDataProviderHealth(
      createHealth({ provider: "alphafeed-rest", status: "degraded" }),
      {
        capability: "realtimeQuote",
        triedProviders: ["stock-sdk", "alphafeed-rest"],
        message: "fallback ok",
      },
    );

    assert.equal(
      formatFallbackLabel("alphafeed-rest", ["stock-sdk", "alphafeed-rest"]),
      "已从 Stock SDK 降级",
    );
    assert.equal(summary.fallbackLabel, "已从 Stock SDK 降级");
    assert.equal(
      summary.message,
      "实时快照：AlphaFeed REST · 降级可用 · 已从 Stock SDK 降级 · fallback ok",
    );
  });
});
