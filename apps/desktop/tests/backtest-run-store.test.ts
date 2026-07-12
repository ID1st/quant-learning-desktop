import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStorageDriver, LocalDatabase } from "../src/features/persistence/localDatabase.ts";
import { deleteStrategyBacktestRun, readStrategyBacktestRuns, saveStrategyBacktestRun, type StrategyBacktestRun } from "../src/features/strategies/backtestRunStore.ts";

function createRun(id: string): StrategyBacktestRun {
  return {
    id,
    createdAt: "2026-07-12T00:00:00.000Z",
    strategyKey: "utorb",
    strategyName: "UTORB",
    strategyVersion: "1.0.0",
    symbol: "AAPL.US",
    market: "US",
    timeframe: "1d",
    parameters: { openingRangeMinutes: 30 },
    result: {
      settings: { initialCapital: 100000, feeRate: 0.0005, slippageRate: 0.0005, allowShort: true },
      summary: { initialCapital: 100000, finalCapital: 101000, totalReturnPct: 1, maxDrawdownPct: 0.5, tradeCount: 1, winningTradeCount: 1, winRate: 100, profitFactor: null },
      trades: [],
      equityCurve: [],
      warnings: [],
    },
  };
}

test("backtest run store persists newest runs and supports deletion", () => {
  const database = new LocalDatabase(createMemoryStorageDriver(), "backtest-test");
  saveStrategyBacktestRun(createRun("one"), database);
  saveStrategyBacktestRun(createRun("two"), database);

  assert.deepEqual(readStrategyBacktestRuns(database).map((run) => run.id), ["two", "one"]);
  assert.deepEqual(deleteStrategyBacktestRun("two", database).map((run) => run.id), ["one"]);
});
