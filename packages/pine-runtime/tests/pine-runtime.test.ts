import assert from "node:assert/strict";
import test from "node:test";
import { atr, cross, crossover, crossunder, ema, highest, history, lowest, nz, sma, wma } from "../src/index.ts";

const priceSeries = [1, 2, 3, 4, 5, 6];

test("nz replaces missing values", () => {
  assert.equal(nz(null), 0);
  assert.equal(nz(undefined, 7), 7);
  assert.equal(nz(Number.NaN, 3), 3);
  assert.equal(nz(12), 12);
});

test("history reads previous bars with Pine-like offset", () => {
  assert.equal(history(priceSeries, 4, 1), 4);
  assert.equal(history(priceSeries, 4, 2), 3);
  assert.equal(history(priceSeries, 0, 1), undefined);
});

test("moving averages are deterministic", () => {
  assert.deepEqual(sma(priceSeries, 3), [null, null, 2, 3, 4, 5]);
  assert.deepEqual(wma(priceSeries, 3), [null, null, 14 / 6, 20 / 6, 26 / 6, 32 / 6]);
  assert.deepEqual(ema(priceSeries, 3), [null, null, 2, 3, 4, 5]);
});

test("highest and lowest use rolling windows", () => {
  assert.deepEqual(highest([3, 1, 5, 2, 4], 3), [null, null, 5, 5, 5]);
  assert.deepEqual(lowest([3, 1, 5, 2, 4], 3), [null, null, 1, 1, 2]);
});

test("atr uses true range smoothed by ema", () => {
  const bars = [
    { high: 10, low: 8, close: 9 },
    { high: 12, low: 9, close: 11 },
    { high: 13, low: 10, close: 12 },
    { high: 14, low: 12, close: 13 },
  ];

  const result = atr(bars, 3);
  assert.deepEqual(result.slice(0, 2), [null, null]);
  assert.ok(Math.abs((result[2] ?? 0) - 8 / 3) < 0.000001);
  assert.ok(Math.abs((result[3] ?? 0) - 7 / 3) < 0.000001);
});

test("cross helpers detect directional changes", () => {
  const left = [1, 2, 3, 2, 1, 2];
  const right = [2, 2, 2, 2, 2, 2];

  assert.deepEqual(crossover(left, right), [false, false, true, false, false, false]);
  assert.deepEqual(crossunder(left, right), [false, false, false, false, true, false]);
  assert.deepEqual(cross(left, right), [false, false, true, false, true, false]);
});
