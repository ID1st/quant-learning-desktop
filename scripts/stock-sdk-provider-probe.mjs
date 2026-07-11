import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createStockSdkGatewayProvider } from "../apps/desktop/src/features/marketData/stockSdkGatewayProvider.ts";
import { createStockSdkGatewayProviderOperations } from "../apps/desktop/src/features/marketData/stockSdkProviderOperations.ts";
import {
  createMarketDataGateway,
  createMarketDataProviderRegistry,
} from "../apps/desktop/src/features/marketData/marketDataProviderGateway.ts";
import { createYahooFinanceIntradayProvider } from "../apps/desktop/src/features/marketData/yahooFinanceIntradayProvider.ts";
import { createTencentFinanceBarsOperations } from "../apps/desktop/src/electron/tencentFinanceBars.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "docs", "generated", "stock-sdk-provider-probe-latest.json");

const symbols = [
  { market: "CN", symbol: "600519.SH", name: "贵州茅台" },
  { market: "HK", symbol: "00700.HK", name: "腾讯控股" },
  { market: "US", symbol: "AAPL.US", name: "Apple" },
];

// Exercise the same production adapter that Electron registers behind the IPC gateway.
const operations = createStockSdkGatewayProviderOperations(undefined, {
  tencentBars: createTencentFinanceBarsOperations(),
});

const provider = createStockSdkGatewayProvider(operations, { enabled: true, delayLevel: "unknown" });
const gateway = createMarketDataGateway(
  createMarketDataProviderRegistry([provider, createYahooFinanceIntradayProvider()]),
  ["stock-sdk", "yahoo-finance"],
);

const report = {
  generatedAt: new Date().toISOString(),
  package: {
    name: "stock-sdk",
    version: "2.3.0",
  },
  productionImpact: "production-adapter",
  historicalRoute: "electron-main/tencent-finance",
  symbols,
  checks: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
  },
};

await runCheck("quote.cn-hk-us", async () => {
  const result = await gateway.fetchQuoteSnapshot(symbols);
  if (!result.ok) throw new Error(result.error.message);
  const quotes = result.data;
  assertMinimumRows(quotes, symbols.length, "quote snapshots");
  return {
    provider: result.provider,
    upstream: result.health.upstream ?? null,
    rows: quotes.length,
    samples: quotes.map((quote) => ({
      market: quote.market,
      symbol: quote.symbol,
      price: quote.price,
      previousClose: quote.previousClose ?? null,
      timestamp: quote.timestamp,
      quoteAgeSeconds: Math.round((Date.now() - quote.timestamp) / 1000),
      fields: presentFields(quote, ["price", "previousClose", "openPrice", "highPrice", "lowPrice", "volume", "amount"]),
    })),
  };
});

for (const item of symbols) {
  await runBarCheck(`historical.${item.market}.1d`, item, "1d", "historical");
  await runBarCheck(`historical.${item.market}.1w`, item, "1w", "historical");
  await runBarCheck(`intraday.${item.market}.1m`, item, "1m", "intraday");
}

report.summary.total = report.checks.length;
report.summary.passed = report.checks.filter((check) => check.status === "passed").length;
report.summary.failed = report.checks.filter((check) => check.status === "failed").length;

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify(report.summary, null, 2));
console.log(`stock-sdk provider probe report written to ${outputPath}`);

if (report.summary.failed > 0) {
  process.exitCode = 1;
}

async function runBarCheck(name, item, timeframe, kind) {
  await runCheck(name, async () => {
    const request = { market: item.market, symbol: item.symbol, timeframe, count: 120 };
    const result = kind === "historical"
      ? await gateway.fetchHistoricalBars(request)
      : await gateway.fetchIntradayBars(request);
    if (!result.ok) throw new Error(result.error.message);
    const bars = result.data;
    assertMinimumRows(bars, 1, `${name} bars`);
    return {
      provider: result.provider,
      upstream: result.health.upstream ?? null,
      rows: bars.length,
      first: summarizeBar(bars[0]),
      last: summarizeBar(bars.at(-1)),
      zeroOpenCount: bars.filter((bar) => bar.open === 0).length,
      invalidOhlcCount: bars.filter((bar) => bar.high < bar.low || bar.high < bar.open || bar.low > bar.open).length,
    };
  });
}

async function runCheck(name, execute) {
  const startedAt = performance.now();
  try {
    const data = await execute();
    report.checks.push({
      name,
      status: "passed",
      latencyMs: Math.round(performance.now() - startedAt),
      data,
    });
  } catch (error) {
    report.checks.push({
      name,
      status: "failed",
      latencyMs: Math.round(performance.now() - startedAt),
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
      },
    });
  }
}

function assertMinimumRows(rows, minimum, label) {
  if (!Array.isArray(rows) || rows.length < minimum) {
    throw new Error(`Expected at least ${minimum} ${label}, received ${Array.isArray(rows) ? rows.length : "non-array"}.`);
  }
}

function summarizeBar(bar) {
  if (!bar) {
    return null;
  }

  return {
    market: bar.market,
    symbol: bar.symbol,
    timeframe: bar.timeframe,
    timestamp: bar.timestamp,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  };
}

function presentFields(record, fields) {
  return Object.fromEntries(fields.map((field) => [field, record[field] !== undefined && record[field] !== null]));
}
