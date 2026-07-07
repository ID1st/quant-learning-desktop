import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
  type GatewayMarketDataProvider,
  type GatewayMarketQuoteSnapshot,
  type MarketDataProviderCapability,
  type MarketDataProviderHealthStatus,
} from "../src/features/marketData/marketDataProviderGateway.ts";

const baseCapability: MarketDataProviderCapability = {
  realtimeQuote: true,
  historicalBars: false,
  intradayBars: false,
  websocket: false,
  batchQuote: true,
  markets: ["US"],
  timeframes: ["realtime"],
  delayLevel: "realtime",
};

function createProvider(
  id: GatewayMarketDataProvider["id"],
  status: MarketDataProviderHealthStatus,
  capability: MarketDataProviderCapability = baseCapability,
  fetchQuoteSnapshot: GatewayMarketDataProvider["fetchQuoteSnapshot"] = async () => [],
): GatewayMarketDataProvider {
  return {
    id,
    displayName: id,
    capability,
    getHealth: async () => ({
      provider: id,
      status,
      message: status,
      checkedAt: "2026-07-07T00:00:00.000Z",
      capability,
    }),
    fetchQuoteSnapshot,
  };
}

describe("MarketDataProviderRegistry", () => {
  it("registers providers and filters by declared capability", () => {
    const registry = createMarketDataProviderRegistry();
    registry.register(createProvider("stock-sdk", "healthy"));
    registry.register(
      createProvider("longbridge", "healthy", { ...baseCapability, realtimeQuote: false, historicalBars: true }),
    );

    assert.equal(registry.get("stock-sdk")?.displayName, "stock-sdk");
    assert.deepEqual(
      registry.listByCapability("realtimeQuote").map((provider) => provider.id),
      ["stock-sdk"],
    );
    assert.deepEqual(
      registry.listByCapability("historicalBars").map((provider) => provider.id),
      ["longbridge"],
    );
  });

  it("rejects duplicate provider ids", () => {
    const registry = createMarketDataProviderRegistry([createProvider("alphafeed-rest", "healthy")]);

    assert.throws(() => {
      registry.register(createProvider("alphafeed-rest", "healthy"));
    }, /already registered/);
  });
});

describe("MarketDataGateway", () => {
  it("returns a structured error when no provider supports the capability", async () => {
    const gateway = createMarketDataGateway(createMarketDataProviderRegistry());

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "NO_CAPABLE_PROVIDER");
    assert.deepEqual(result.triedProviders, []);
  });

  it("uses the first healthy provider from priority order", async () => {
    const quote: GatewayMarketQuoteSnapshot = {
      provider: "alphafeed-rest",
      market: "US",
      symbol: "AAPL.US",
      price: 294.28,
      timestamp: 1_788_288_000_000,
    };
    const registry = createMarketDataProviderRegistry([
      createProvider("longbridge", "healthy", baseCapability, async () => [{ ...quote, provider: "longbridge" }]),
      createProvider("alphafeed-rest", "healthy", baseCapability, async () => [quote]),
    ]);
    const gateway = createMarketDataGateway(registry, ["alphafeed-rest", "longbridge"]);

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "alphafeed-rest");
    assert.deepEqual(result.triedProviders, ["alphafeed-rest"]);
    assert.deepEqual(result.data, [quote]);
  });

  it("falls back when the higher priority provider is unavailable", async () => {
    const quote: GatewayMarketQuoteSnapshot = {
      provider: "longbridge",
      market: "US",
      symbol: "AAPL.US",
      price: 294.28,
      timestamp: 1_788_288_000_000,
    };
    const registry = createMarketDataProviderRegistry([
      createProvider("alphafeed-rest", "unavailable"),
      createProvider("longbridge", "healthy", baseCapability, async () => [quote]),
    ]);
    const gateway = createMarketDataGateway(registry, ["alphafeed-rest", "longbridge"]);

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "longbridge");
    assert.deepEqual(result.triedProviders, ["alphafeed-rest", "longbridge"]);
    assert.deepEqual(result.data, [quote]);
  });

  it("falls back when the selected provider throws", async () => {
    const quote: GatewayMarketQuoteSnapshot = {
      provider: "longbridge",
      market: "US",
      symbol: "AAPL.US",
      price: 294.28,
      timestamp: 1_788_288_000_000,
    };
    const registry = createMarketDataProviderRegistry([
      createProvider("alphafeed-rest", "healthy", baseCapability, async () => {
        throw new Error("rate limited");
      }),
      createProvider("longbridge", "healthy", baseCapability, async () => [quote]),
    ]);
    const gateway = createMarketDataGateway(registry, ["alphafeed-rest", "longbridge"]);

    const result = await gateway.fetchQuoteSnapshot([{ market: "US", symbol: "AAPL.US" }]);

    assert.equal(result.ok, true);
    assert.equal(result.provider, "longbridge");
    assert.deepEqual(result.triedProviders, ["alphafeed-rest", "longbridge"]);
    assert.deepEqual(result.data, [quote]);
  });
});
