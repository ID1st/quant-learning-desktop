import assert from "node:assert/strict";
import test from "node:test";
import { runStrategyBacktest, type Bar } from "../src/index.ts";

function bar(timestamp: number, open: number, close = open): Bar {
  return {
    timestamp,
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 100,
  };
}

test("backtest disables short entries by default", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 90)],
    signals: [{ timestamp: 1, type: "sell" }],
  });

  assert.equal(result.settings.allowShort, false);
  assert.equal(result.summary.tradeCount, 0);
});

test("backtest uses the next bar open and reverses between long and short", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 110, 111), bar(3, 120), bar(4, 90)],
    signals: [
      { timestamp: 1, type: "buy" },
      { timestamp: 2, type: "sell" },
    ],
    settings: { initialCapital: 1000, feeRate: 0, slippageRate: 0, allowShort: true },
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

test("backtest honors explicit strategy actions without reversing on observational signals", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 90), bar(4, 110), bar(5, 120)],
    signals: [
      { timestamp: 1, type: "buy", backtestAction: "enter-long" },
      { timestamp: 2, type: "sell", backtestAction: "none" },
      { timestamp: 3, type: "exit", backtestAction: "exit-long" },
    ],
    settings: { initialCapital: 1_000, feeRate: 0, slippageRate: 0, allowShort: true },
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0]?.direction, "long");
  assert.equal(result.trades[0]?.entryTimestamp, 2);
  assert.equal(result.trades[0]?.exitTimestamp, 4);
  assert.equal(result.trades[0]?.exitSignalTimestamp, 3);
});

test("backtest does not reinterpret a disabled explicit short entry as a long exit", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 90), bar(4, 110), bar(5, 120)],
    signals: [
      { timestamp: 1, type: "buy", backtestAction: "enter-long" },
      { timestamp: 2, type: "sell", backtestAction: "enter-short" },
      { timestamp: 3, type: "exit", backtestAction: "exit-long" },
    ],
    settings: { initialCapital: 1_000, feeRate: 0, slippageRate: 0, allowShort: false },
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0]?.direction, "long");
  assert.equal(result.trades[0]?.exitTimestamp, 4);
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
  assert.equal(
    result.warnings.some((warning) => warning.includes("强制平仓")),
    false,
  );
  assert.equal(result.summary.finalCapital < 1078, true);
});

test("backtest ignores a final-bar signal without a future open", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 101)],
    signals: [{ timestamp: 2, type: "buy" }],
  });

  assert.equal(result.summary.tradeCount, 0);
  assert.equal(
    result.warnings.some((warning) => warning.includes("最后一根")),
    true,
  );
});

test("backtest skips a short entry when its required next-bar price is zero", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 0), bar(3, 90), bar(4, 80)],
    signals: [{ timestamp: 1, type: "sell" }],
    settings: { allowShort: true },
  });

  assert.equal(result.summary.tradeCount, 0);
  assert.ok(
    result.trades.every((trade) =>
      [trade.entryPrice, trade.exitPrice, trade.quantity, trade.netPnl].every(Number.isFinite),
    ),
  );
  assert.ok(result.equityCurve.every((point) => Number.isFinite(point.equity)));
  assert.ok(Number.isFinite(result.summary.finalCapital));
  assert.ok(Number.isFinite(result.summary.totalReturnPct));
});

test("backtest falls back from a non-executable slippage rate", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 90)],
    signals: [{ timestamp: 1, type: "sell" }],
    settings: { allowShort: true, slippageRate: 1 },
  });

  assert.equal(result.settings.slippageRate, 0.0005);
  assert.ok(
    result.trades.every((trade) => Number.isFinite(trade.entryPrice) && trade.entryPrice > 0),
  );
});

test("backtest settles an open short against the last valid close when the final bar is invalid", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 0)],
    signals: [{ timestamp: 1, type: "sell" }],
    settings: { allowShort: true },
  });

  assert.equal(result.summary.tradeCount, 1);
  assert.ok(
    result.trades.every((trade) =>
      [trade.entryPrice, trade.exitPrice, trade.quantity, trade.netPnl].every(Number.isFinite),
    ),
  );
  assert.ok(result.equityCurve.every((point) => Number.isFinite(point.equity)));
  assert.ok(Number.isFinite(result.summary.finalCapital));
});

test("backtest stops opening positions after capital is exhausted", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 300), bar(4, 300), bar(5, 200)],
    signals: [
      { timestamp: 1, type: "sell" },
      { timestamp: 2, type: "buy" },
    ],
    settings: { initialCapital: 100_000, feeRate: 0, slippageRate: 0, allowShort: true },
  });

  assert.equal(result.trades.length, 1);
  assert.ok(result.trades.every((trade) => trade.quantity > 0));
  assert.equal(result.summary.finalCapital, -100_000);
  assert.ok(result.warnings.some((warning) => warning.includes("capital is exhausted")));
});

test("backtest entry sizing reserves the entry fee", () => {
  const initialCapital = 1_000;
  const feeRate = 0.01;
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 100)],
    signals: [{ timestamp: 1, type: "buy" }],
    settings: { initialCapital, feeRate, slippageRate: 0 },
  });

  const trade = result.trades[0];
  assert.ok(trade);
  assert.ok(
    trade.entryPrice * trade.quantity + trade.entryPrice * trade.quantity * feeRate <=
      initialCapital + Number.EPSILON,
  );
});

test("backtest rejects a fee rate that can consume the full notional", () => {
  const result = runStrategyBacktest({
    bars: [bar(1, 100), bar(2, 100), bar(3, 100)],
    signals: [{ timestamp: 1, type: "buy" }],
    settings: { feeRate: 1 },
  });

  assert.equal(result.settings.feeRate, 0.0005);
});
