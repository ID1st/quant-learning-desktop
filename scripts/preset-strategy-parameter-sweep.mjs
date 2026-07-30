import {
  createPresetStrategyRegistry,
  runRegisteredStrategy,
  runStrategyBacktest,
} from "../packages/strategy-engine/src/index.ts";

const symbols = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "JPM", "XOM"];
const backtestSettings = { initialCapital: 100_000, feeRate: 0.0005, slippageRate: 0.0005 };
const registry = createPresetStrategyRegistry();

const datasets = { trend: [], utorb: [] };
for (const symbol of symbols) {
  process.stderr.write(`Fetching ${symbol}...\n`);
  datasets.trend.push({ symbol, bars: await fetchYahooBars(symbol, "1d", "5y") });
  await delay(350);
  datasets.utorb.push({ symbol, bars: await fetchYahooBars(symbol, "5m", "60d") });
  await delay(350);
}

const trendSegments = createSegments(datasets.trend[0].bars);
const utorbSegments = createSegments(datasets.utorb[0].bars);
const trendParameters = cartesian({
  supertrendFactor: [2, 4, 6, 8, 12],
  supertrendAtrPeriod: [14, 30, 60, 90],
  wmaLength: [10, 20, 40, 60],
  emaLength: [5, 10, 14, 21],
});
const utorbParameters = cartesian({
  // The 60-day sample is entirely inside US daylight saving time. Treat the
  // exchange timezone as data alignment, not as a profit-tuning parameter.
  timezoneOffsetHours: [-4],
  openingRangeMinutes: [15, 30, 45, 60],
  rangeSource: ["high-low", "close"],
  trailingStopAtrMultiplier: [1, 1.5, 2, 2.5, 3],
  trailingStopAtrPeriod: [7, 14, 21],
}).map((parameters) => ({
  ...parameters,
  sessionStartHour: 9,
  sessionStartMinute: 30,
  sessionDays: "23456",
  stopPlotting: true,
  plottingEndType: "new-york-close",
  showTargets: false,
  showVolumeProfile: false,
  showTrailingStop: false,
  showOptimizer: false,
}));

const trendLongShort = sweep({
  strategyKey: "trend-targets",
  timeframe: "1d",
  datasets: datasets.trend,
  segments: trendSegments,
  candidates: trendParameters,
  defaultParameters: {
    supertrendFactor: 12,
    supertrendAtrPeriod: 90,
    wmaLength: 40,
    emaLength: 14,
  },
  minimumTradesPerSymbol: 2,
  allowShort: true,
});
const trendLongOnly = sweep({
  strategyKey: "trend-targets",
  timeframe: "1d",
  datasets: datasets.trend,
  segments: trendSegments,
  candidates: trendParameters,
  defaultParameters: {
    supertrendFactor: 12,
    supertrendAtrPeriod: 90,
    wmaLength: 40,
    emaLength: 14,
  },
  minimumTradesPerSymbol: 2,
  allowShort: false,
});
process.stderr.write("Trend Targets sweeps complete.\n");

const utorbLongShort = sweep({
  strategyKey: "utorb",
  timeframe: "5m",
  datasets: datasets.utorb,
  segments: utorbSegments,
  candidates: utorbParameters,
  defaultParameters: {
    sessionStartHour: 9,
    sessionStartMinute: 30,
    openingRangeMinutes: 30,
    sessionDays: "23456",
    timezoneOffsetHours: -5,
    rangeSource: "high-low",
    trailingStopAtrMultiplier: 2,
    trailingStopAtrPeriod: 14,
    stopPlotting: true,
    plottingEndType: "new-york-close",
    showTargets: false,
    showVolumeProfile: false,
    showTrailingStop: false,
    showOptimizer: false,
  },
  minimumTradesPerSymbol: 5,
  allowShort: true,
});
const utorbLongOnly = sweep({
  strategyKey: "utorb",
  timeframe: "5m",
  datasets: datasets.utorb,
  segments: utorbSegments,
  candidates: utorbParameters,
  defaultParameters: {
    sessionStartHour: 9,
    sessionStartMinute: 30,
    openingRangeMinutes: 30,
    sessionDays: "23456",
    timezoneOffsetHours: -5,
    rangeSource: "high-low",
    trailingStopAtrMultiplier: 2,
    trailingStopAtrPeriod: 14,
    stopPlotting: true,
    plottingEndType: "new-york-close",
    showTargets: false,
    showVolumeProfile: false,
    showTrailingStop: false,
    showOptimizer: false,
  },
  minimumTradesPerSymbol: 3,
  allowShort: false,
});
process.stderr.write("UTORB sweeps complete.\n");

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      dataSource: "Yahoo Finance chart endpoint (regular session only)",
      symbols,
      settings: { ...backtestSettings, executionModes: ["long-short", "long-only"] },
      split: "60% train / 20% validation / 20% untouched test",
      datasets: {
        trend: summarizeDatasets(datasets.trend),
        utorb: summarizeDatasets(datasets.utorb),
      },
      trend: { longShort: trendLongShort, longOnly: trendLongOnly },
      utorb: { longShort: utorbLongShort, longOnly: utorbLongOnly },
    },
    null,
    2,
  ),
);

function sweep({
  strategyKey,
  timeframe,
  datasets: strategyDatasets,
  segments,
  candidates,
  defaultParameters,
  minimumTradesPerSymbol,
  allowShort,
}) {
  const trainRanked = candidates
    .map((parameters) => ({
      parameters,
      train: evaluate(
        strategyKey,
        timeframe,
        strategyDatasets,
        segments.train,
        parameters,
        minimumTradesPerSymbol,
        allowShort,
      ),
    }))
    .sort((left, right) => right.train.score - left.train.score);
  const validationRanked = trainRanked
    .slice(0, 30)
    .map((candidate) => ({
      ...candidate,
      validation: evaluate(
        strategyKey,
        timeframe,
        strategyDatasets,
        segments.validation,
        candidate.parameters,
        minimumTradesPerSymbol,
        allowShort,
      ),
    }))
    .sort((left, right) => right.validation.score - left.validation.score);
  const finalists = validationRanked.slice(0, 5).map((candidate) => ({
    parameters: compactParameters(strategyKey, candidate.parameters),
    full: evaluate(
      strategyKey,
      timeframe,
      strategyDatasets,
      segments.full,
      candidate.parameters,
      minimumTradesPerSymbol,
      allowShort,
    ),
    train: candidate.train,
    validation: candidate.validation,
    test: evaluate(
      strategyKey,
      timeframe,
      strategyDatasets,
      segments.test,
      candidate.parameters,
      minimumTradesPerSymbol,
      allowShort,
    ),
  }));

  return {
    searchedParameterSets: candidates.length,
    allowShort,
    segments: Object.fromEntries(
      Object.entries(segments).map(([key, segment]) => [
        key,
        {
          start: new Date(segment.start).toISOString(),
          end: new Date(segment.end).toISOString(),
        },
      ]),
    ),
    default: {
      parameters: compactParameters(strategyKey, defaultParameters),
      full: evaluate(
        strategyKey,
        timeframe,
        strategyDatasets,
        segments.full,
        defaultParameters,
        minimumTradesPerSymbol,
        allowShort,
      ),
      train: evaluate(
        strategyKey,
        timeframe,
        strategyDatasets,
        segments.train,
        defaultParameters,
        minimumTradesPerSymbol,
        allowShort,
      ),
      validation: evaluate(
        strategyKey,
        timeframe,
        strategyDatasets,
        segments.validation,
        defaultParameters,
        minimumTradesPerSymbol,
        allowShort,
      ),
      test: evaluate(
        strategyKey,
        timeframe,
        strategyDatasets,
        segments.test,
        defaultParameters,
        minimumTradesPerSymbol,
        allowShort,
      ),
    },
    selectedBeforeTest: finalists[0],
    finalists,
  };
}

function evaluate(
  strategyKey,
  timeframe,
  strategyDatasets,
  segment,
  parameters,
  minimumTradesPerSymbol,
  allowShort,
) {
  const results = strategyDatasets.map(({ symbol, bars }) => {
    const contextBars = bars.filter((bar) => bar.timestamp <= segment.end);
    const segmentBars = contextBars.filter((bar) => bar.timestamp >= segment.start);
    const strategyRun = runRegisteredStrategy(registry, {
      strategyKey,
      symbol,
      market: "US",
      timeframe,
      runMode: "backtest",
      enabled: true,
      bars: contextBars,
      parameters,
    });
    const backtest = runStrategyBacktest({
      bars: segmentBars,
      signals: strategyRun.output.signals.filter((signal) => signal.timestamp >= segment.start),
      settings: { ...backtestSettings, allowShort },
    });
    return { symbol, summary: backtest.summary, trades: backtest.trades };
  });

  const returns = results.map((result) => result.summary.totalReturnPct);
  const drawdowns = results.map((result) => result.summary.maxDrawdownPct);
  const trades = results.flatMap((result) => result.trades);
  const totalTrades = trades.length;
  const grossProfit = trades
    .filter((trade) => trade.netPnl > 0)
    .reduce((total, trade) => total + trade.netPnl, 0);
  const grossLoss = Math.abs(
    trades.filter((trade) => trade.netPnl < 0).reduce((total, trade) => total + trade.netPnl, 0),
  );
  const positiveSymbolRatio = returns.filter((value) => value > 0).length / returns.length;
  const minimumTrades = strategyDatasets.length * minimumTradesPerSymbol;
  const lowTradePenalty = (Math.max(0, minimumTrades - totalTrades) / minimumTrades) * 8;
  const meanReturnPct = mean(returns);
  const medianReturnPct = median(returns);
  const worstReturnPct = Math.min(...returns);
  const meanDrawdownPct = mean(drawdowns);
  const score =
    medianReturnPct +
    meanReturnPct * 0.25 +
    worstReturnPct * 0.2 -
    meanDrawdownPct * 0.5 +
    (positiveSymbolRatio - 0.5) * 4 -
    lowTradePenalty;

  return roundObject({
    score,
    meanReturnPct,
    medianReturnPct,
    worstReturnPct,
    meanDrawdownPct,
    positiveSymbolRatio,
    totalTrades,
    winRate:
      totalTrades > 0 ? (trades.filter((trade) => trade.netPnl > 0).length / totalTrades) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
    perSymbolReturnPct: Object.fromEntries(
      results.map((result) => [result.symbol, result.summary.totalReturnPct]),
    ),
  });
}

function createSegments(bars) {
  const trainIndex = Math.floor(bars.length * 0.6);
  const validationIndex = Math.floor(bars.length * 0.8);
  return {
    full: { start: bars[0].timestamp, end: bars.at(-1).timestamp },
    train: { start: bars[0].timestamp, end: bars[trainIndex - 1].timestamp },
    validation: { start: bars[trainIndex].timestamp, end: bars[validationIndex - 1].timestamp },
    test: { start: bars[validationIndex].timestamp, end: bars.at(-1).timestamp },
  };
}

async function fetchYahooBars(symbol, interval, range) {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
  );
  url.search = new URLSearchParams({ interval, range, includePrePost: "false", events: "history" });
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    if (attempt < 2) await delay(500 * (attempt + 1));
  }
  if (!response?.ok)
    throw new Error(`${symbol} ${interval} returned HTTP ${response?.status ?? "unknown"}.`);

  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const bars = (result?.timestamp ?? []).flatMap((seconds, index) => {
    const values = [
      quote?.open?.[index],
      quote?.high?.[index],
      quote?.low?.[index],
      quote?.close?.[index],
      quote?.volume?.[index] ?? 0,
    ];
    if (!values.every(Number.isFinite)) return [];
    const [open, high, low, close, volume] = values;
    if (
      open <= 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      high < low ||
      volume < 0
    )
      return [];
    return [{ timestamp: seconds * 1_000, open, high, low, close, volume }];
  });
  if (bars.length < 100)
    throw new Error(`${symbol} ${interval} returned only ${bars.length} valid bars.`);
  return bars;
}

function cartesian(source) {
  return Object.entries(source).reduce(
    (rows, [key, values]) =>
      rows.flatMap((row) => values.map((value) => ({ ...row, [key]: value }))),
    [{}],
  );
}

function compactParameters(strategyKey, parameters) {
  const keys =
    strategyKey === "trend-targets"
      ? ["supertrendFactor", "supertrendAtrPeriod", "wmaLength", "emaLength"]
      : [
          "timezoneOffsetHours",
          "openingRangeMinutes",
          "rangeSource",
          "trailingStopAtrMultiplier",
          "trailingStopAtrPeriod",
        ];
  return Object.fromEntries(keys.map((key) => [key, parameters[key]]));
}

function summarizeDatasets(items) {
  return items.map(({ symbol, bars }) => ({
    symbol,
    barCount: bars.length,
    first: new Date(bars[0].timestamp).toISOString(),
    last: new Date(bars.at(-1).timestamp).toISOString(),
  }));
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function roundObject(value) {
  if (typeof value === "number") return Number(value.toFixed(4));
  if (Array.isArray(value)) return value.map(roundObject);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundObject(item)]));
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
