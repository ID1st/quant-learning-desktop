import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
} from "../apps/desktop/src/features/marketData/marketDataProviderGateway.ts";
import { createStockSdkGatewayProvider } from "../apps/desktop/src/features/marketData/stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "../apps/desktop/src/features/marketData/stockSdkProviderOperations.ts";
import { createTencentFinanceBarsOperations } from "../apps/desktop/src/electron/tencentFinanceBars.ts";
import { inspectMarketDataBars } from "../apps/desktop/src/features/marketData/marketDataQuality.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(
  path.resolve(__dirname, ".."),
  "docs",
  "generated",
  "market-data-stability-drill-latest.json",
);
const symbols = [
  { market: "CN", symbol: "600519.SH" },
  { market: "HK", symbol: "00700.HK" },
  { market: "US", symbol: "AAPL.US" },
];

const checks = [];

function createStockSdkGateway() {
  const stockSdk = createStockSdkGatewayProvider(
    createStockSdkGatewayProviderOperations(undefined, {
      tencentBars: createTencentFinanceBarsOperations(),
    }),
    { enabled: true, delayLevel: "unknown" },
  );
  return {
    provider: stockSdk,
    gateway: createMarketDataGateway(createMarketDataProviderRegistry([stockSdk]), ["stock-sdk"]),
  };
}

await runCheck("live.quote.cn-hk-us", async () => {
  const { gateway } = createStockSdkGateway();
  const result = await gateway.fetchQuoteSnapshot(symbols);
  if (!result.ok || result.data.length !== symbols.length)
    throw new Error(result.ok ? "Quote batch is incomplete." : result.error.message);
  return {
    provider: result.provider,
    upstream: result.health.upstream ?? null,
    rows: result.data.length,
    triedProviders: result.triedProviders,
  };
});

for (const symbol of symbols) {
  await runCheck(`live.history.${symbol.market}.1d`, async () => {
    const { gateway } = createStockSdkGateway();
    return loadBars(gateway, "historical", { ...symbol, timeframe: "1d", count: 120 });
  });
  await runCheck(
    `live.intraday.${symbol.market}.1m`,
    async () => {
      const { gateway } = createStockSdkGateway();
      return loadBars(gateway, "intraday", { ...symbol, timeframe: "1m", count: 120 });
    },
    symbol.market === "US" ? classifyClosedUsIntraday : undefined,
  );
}

await runCheck("drill.forced-primary-failure-falls-back-to-stock-sdk", async () => {
  const failingProvider = createDeliberatelyFailingHistoryProvider();
  const { provider: stockSdk } = createStockSdkGateway();
  const drillGateway = createMarketDataGateway(
    createMarketDataProviderRegistry([failingProvider, stockSdk]),
    ["yahoo-finance", "stock-sdk"],
  );
  const result = await drillGateway.fetchHistoricalBars({
    market: "CN",
    symbol: "600519.SH",
    timeframe: "1d",
    count: 120,
  });
  if (
    !result.ok ||
    result.provider !== "stock-sdk" ||
    result.triedProviders.join(",") !== "yahoo-finance,stock-sdk"
  ) {
    throw new Error(
      result.ok ? "Fallback provider order was not preserved." : result.error.message,
    );
  }
  return {
    simulatedFailure: "yahoo-finance",
    provider: result.provider,
    upstream: result.health.upstream ?? null,
    rows: result.data.length,
    triedProviders: result.triedProviders,
  };
});

await runCheck("drill.failed-refresh-retains-real-history-snapshot", async () => {
  const { gateway } = createStockSdkGateway();
  const initial = await gateway.fetchHistoricalBars({
    market: "HK",
    symbol: "00700.HK",
    timeframe: "1d",
    count: 120,
  });
  if (!initial.ok) throw new Error(initial.error.message);
  const snapshot = JSON.stringify(initial.data);
  const failedGateway = createMarketDataGateway(
    createMarketDataProviderRegistry([createDeliberatelyFailingHistoryProvider()]),
    ["yahoo-finance"],
  );
  const refresh = await failedGateway.fetchHistoricalBars({
    market: "HK",
    symbol: "00700.HK",
    timeframe: "1d",
    count: 120,
  });
  if (refresh.ok || JSON.stringify(initial.data) !== snapshot)
    throw new Error("A failed refresh changed the retained history snapshot.");
  return {
    retainedRows: initial.data.length,
    retainedProvider: initial.provider,
    refreshError: refresh.error.code,
  };
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  purpose: "live-provider-connectivity-with-explicit-fallback-and-cache-retention-drills",
  checks,
  summary: {
    total: checks.length,
    passed: checks.filter((check) => check.status === "passed").length,
    observed: checks.filter((check) => check.status === "observed").length,
    failed: checks.filter((check) => check.status === "failed").length,
  },
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));
console.log(`market-data stability drill report written to ${outputPath}`);
if (report.summary.failed > 0) process.exitCode = 1;

async function loadBars(gateway, kind, request) {
  const result =
    kind === "historical"
      ? await gateway.fetchHistoricalBars(request)
      : await gateway.fetchIntradayBars(request);
  if (!result.ok) throw new Error(result.error.message);
  const quality = inspectMarketDataBars(result.data);
  if (quality.rejectedCount > 0) throw new Error(`Live ${kind} route returned invalid bars.`);
  return {
    provider: result.provider,
    upstream: result.health.upstream ?? null,
    rows: result.data.length,
    firstTimestamp: result.data[0]?.timestamp ?? null,
    lastTimestamp: result.data.at(-1)?.timestamp ?? null,
    triedProviders: result.triedProviders,
  };
}

async function runCheck(name, operation, onError) {
  const startedAt = performance.now();
  try {
    const data = await operation();
    checks.push({
      name,
      status: "passed",
      latencyMs: Math.round(performance.now() - startedAt),
      data,
    });
  } catch (error) {
    const observation = onError?.(error);
    if (observation) {
      checks.push({
        name,
        status: "observed",
        latencyMs: Math.round(performance.now() - startedAt),
        observation,
      });
      return;
    }
    checks.push({
      name,
      status: "failed",
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function classifyClosedUsIntraday(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Tencent Finance returned no usable intraday data/u.test(message)
    ? "Tencent Finance has no complete US minute history in the current closed-market window; the production route must retain cache or use a configured fallback."
    : undefined;
}

function createDeliberatelyFailingHistoryProvider() {
  let failed = false;
  const capability = {
    realtimeQuote: false,
    historicalBars: true,
    intradayBars: false,
    websocket: false,
    batchQuote: false,
    markets: ["US", "HK", "CN"],
    timeframes: ["1d", "1w"],
    delayLevel: "unknown",
  };
  return {
    id: "yahoo-finance",
    displayName: "Drill Failure Provider",
    capability,
    async getHealth() {
      return {
        provider: "yahoo-finance",
        status: failed ? "unavailable" : "healthy",
        message: failed
          ? "Deliberate fallback drill failure."
          : "Ready for deliberate fallback drill.",
        checkedAt: new Date().toISOString(),
        capability,
      };
    },
    async fetchHistoricalBars() {
      failed = true;
      throw new Error("Deliberate fallback drill failure.");
    },
  };
}
