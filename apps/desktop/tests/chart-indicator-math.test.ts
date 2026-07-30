import assert from "node:assert/strict";
import test from "node:test";
import type { CandlePoint } from "@quant/chart";
import {
  calculateBbi,
  calculateBoll,
  calculateCci,
  calculateEma,
  calculateEne,
  calculateKdj,
  calculateMa,
  calculateMacd,
  calculateRsi,
  calculateSar,
  calculateVolumeMa,
  calculateWr,
} from "../src/features/chartIndicators/indicatorMath.ts";

function candlesFromCloses(
  closes: readonly number[],
  volumes: readonly number[] = [],
): CandlePoint[] {
  return closes.map((close, index) => ({
    time: String(index),
    timestamp: index,
    open: close - 0.25,
    high: close + 1,
    low: close - 1,
    close,
    volume: volumes[index] ?? (index + 1) * 100,
  }));
}

function assertFiniteSeries(series: readonly { value: number }[]) {
  series.forEach((point) => assert.equal(Number.isFinite(point.value), true));
}

test("MA, BOLL, BBI and ENE wait for complete windows", () => {
  const candles = candlesFromCloses(Array.from({ length: 24 }, (_, index) => index + 1));

  assert.deepEqual(
    calculateMa(candles, 5).map((point) => point.timestamp),
    Array.from({ length: 20 }, (_, index) => index + 4),
  );
  assert.equal(calculateMa(candles, 5)[0]?.value, 3);
  assert.equal(calculateBoll(candles, 20, 2)[0]?.timestamp, 19);
  assert.equal(calculateBbi(candles)[0]?.timestamp, 23);
  assert.equal(calculateEne(candles, 10, 11, 9)[0]?.timestamp, 9);
});

test("EMA uses the first complete SMA window as its seed", () => {
  const candles = candlesFromCloses([1, 2, 3, 4, 5, 6]);
  const result = calculateEma(candles, 3);

  assert.deepEqual(
    result.map((point) => point.timestamp),
    [2, 3, 4, 5],
  );
  assert.deepEqual(
    result.map((point) => point.value),
    [2, 3, 4, 5],
  );
});

test("BOLL uses population deviation and ENE applies asymmetric bands", () => {
  const candles = candlesFromCloses([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const boll = calculateBoll(candles, 5, 2)[0];
  const ene = calculateEne(candles, 10, 11, 9)[0];

  assert.ok(boll);
  assert.equal(boll.mid, 3);
  assert.ok(Math.abs(boll.upper - (3 + Math.sqrt(2) * 2)) < 1e-12);
  assert.ok(Math.abs(boll.lower - (3 - Math.sqrt(2) * 2)) < 1e-12);
  assert.deepEqual(ene, { timestamp: 9, mid: 5.5, upper: 6.105, lower: 5.005 });
});

test("SAR produces one finite dot per candle after initialization", () => {
  const result = calculateSar(candlesFromCloses([10, 11, 12, 13, 12, 11]), 0.02, 0.02, 0.2);

  assert.equal(result.length, 5);
  assertFiniteSeries(result);
});

test("MAVOL waits for its volume windows", () => {
  const candles = candlesFromCloses([1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]);

  assert.deepEqual(calculateVolumeMa(candles, 5), [
    { timestamp: 4, value: 30 },
    { timestamp: 5, value: 40 },
  ]);
});

test("MACD shares DIF and DEA while A-share doubles only the histogram", () => {
  const candles = candlesFromCloses(Array.from({ length: 60 }, (_, index) => index + 1));
  const cross = calculateMacd(candles, 12, 26, 9, "cross-market");
  const aShare = calculateMacd(candles, 12, 26, 9, "a-share");

  assert.ok(cross.length > 0);
  assert.equal(aShare.length, cross.length);
  assert.ok(Math.abs(aShare.at(-1)!.dif - cross.at(-1)!.dif) < 1e-12);
  assert.ok(Math.abs(aShare.at(-1)!.dea - cross.at(-1)!.dea) < 1e-12);
  assert.ok(Math.abs(aShare.at(-1)!.histogram - cross.at(-1)!.histogram * 2) < 1e-12);
});

test("KDJ starts K and D at 50 and stays neutral on zero amplitude", () => {
  const flat = candlesFromCloses(Array.from({ length: 12 }, () => 10)).map((candle) => ({
    ...candle,
    open: 10,
    high: 10,
    low: 10,
  }));
  const result = calculateKdj(flat, 9, 3, 3);

  assert.equal(result[0]?.timestamp, 8);
  assert.deepEqual(result[0], { timestamp: 8, k: 50, d: 50, j: 50 });
  result.forEach((point) => {
    assert.equal(Number.isFinite(point.k), true);
    assert.equal(Number.isFinite(point.d), true);
    assert.equal(Number.isFinite(point.j), true);
  });
});

test("RSI returns neutral 50 for flat data and 100 for zero-loss rises", () => {
  const flat = calculateRsi(candlesFromCloses(Array.from({ length: 30 }, () => 10)), 14);
  const rising = calculateRsi(
    candlesFromCloses(Array.from({ length: 30 }, (_, index) => index + 1)),
    14,
  );

  assert.equal(flat[0]?.timestamp, 14);
  assert.equal(flat[0]?.value, 50);
  assert.equal(rising[0]?.value, 100);
  assertFiniteSeries(flat);
  assertFiniteSeries(rising);
});

test("WR and CCI use stable neutral values on flat data", () => {
  const flat = candlesFromCloses(Array.from({ length: 30 }, () => 10)).map((candle) => ({
    ...candle,
    open: 10,
    high: 10,
    low: 10,
  }));
  const wr = calculateWr(flat, 14);
  const cci = calculateCci(flat, 14, 0.015);

  assert.equal(wr[0]?.value, -50);
  assert.equal(cci[0]?.value, 0);
  assertFiniteSeries(wr);
  assertFiniteSeries(cci);
});

test("all calculations ignore non-finite output opportunities", () => {
  const malformed = candlesFromCloses([
    1,
    2,
    Number.NaN,
    4,
    Number.POSITIVE_INFINITY,
    6,
    7,
    8,
    9,
    10,
  ]);
  const values = [
    ...calculateMa(malformed, 3),
    ...calculateEma(malformed, 3),
    ...calculateRsi(malformed, 3),
    ...calculateWr(malformed, 3),
    ...calculateCci(malformed, 3, 0.015),
  ];

  assertFiniteSeries(values);
});
