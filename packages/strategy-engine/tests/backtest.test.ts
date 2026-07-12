import assert from "node:assert/strict";
import test from "node:test";
import { runStrategyBacktest, type Bar } from "../src/index.ts";

function bar(timestamp: number, open: number, close = open): Bar {
  return { timestamp, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 100 };
}

test("backtest uses the next bar open and reverses between long and short", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 110, 111), bar(3, 120), bar(4, 90)],
    signals: [
      { timestamp: 1, type: "buy" },
      { timestamp: 2, type: "sell" },
    ],
    settings: { initialCapital: 1000, feeRate: 0, slippageRate: 0 },
  });

  assert.equal(result.trades.length, 2);
  assert.equal(result.trades[0]?.direction, "long");
  assert.equal(result.trades[0]?.entryTimestamp, 2);
  assert.equal(result.trades[0]?.entryPrice, 110);
  assert.equal(result.trades[0]?.exitTimestamp, 3);
  assert.equal(result.trades[1]?.direction, "short");
  assert.equal(result.trades[1]?.entryTimestamp, 3);
  assert.equal(result.trades[1]?.exitPrice, 90);
  assert.ok(Math.abs(result.summary.finalCapital - 1363.6363636363635) < 0.000001);
});

test("backtest applies fees and slippage, and can disable short entries", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 110)],
    signals: [
      { timestamp: 1, type: "buy" },
      { timestamp: 2, type: "sell" },
    ],
    settings: { initialCapital: 1000, feeRate: 0.01, slippageRate: 0.01, allowShort: false },
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0]?.entryPrice, 101);
  assert.equal(result.trades[0]?.exitPrice, 108.9);
  assert.equal(result.trades[0]?.direction, "long");
  assert.equal(result.trades[0]?.exitSignalTimestamp, 2);
  assert.equal(result.warnings.some((warning) => warning.includes("强制平仓")), false);
  assert.equal(result.summary.finalCapital < 1078, true);
});

test("backtest ignores a final-bar signal without a future open", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 101)],
    signals: [{ timestamp: 2, type: "buy" }],
  });

  assert.equal(result.summary.tradeCount, 0);
  assert.equal(result.warnings.some((warning) => warning.includes("最后一根")), true);
});
