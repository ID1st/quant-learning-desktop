import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScaleDomain,
  createDefaultVisibleRange,
  createSmoothPath,
  formatPrice,
  generateCandles,
  resolveCandleTimeLabel,
} from "../src/chartPrimitives.ts";

test("chart scale contains visible prices with padding and survives missing data", () => {
  const candles = generateCandles({ symbol: "AAPL", market: "US", timeframe: "1d" });
  const domain = calculateScaleDomain(candles, { start: 20, end: 40 });
  assert.ok(domain.minPrice < Math.min(...candles.slice(20, 40).map((c) => c.low)));
  assert.ok(domain.maxPrice > Math.max(...candles.slice(20, 40).map((c) => c.high)));
  for (const values of [
    [],
    [{ ...candles[0], high: NaN, low: NaN, close: 10 }],
    [{ ...candles[0], high: NaN, low: NaN, close: NaN }],
  ]) {
    const scale = calculateScaleDomain(values, { start: 0, end: 100 });
    assert.ok(Number.isFinite(scale.minPrice) && scale.maxPrice > scale.minPrice);
  }
  assert.deepEqual(createDefaultVisibleRange(0), { start: 0, end: 0 });
  assert.deepEqual(createDefaultVisibleRange(100, 1), { start: 88, end: 100 });
});

test("paths and price labels handle empty and small inputs", () => {
  assert.equal(createSmoothPath([]), "");
  assert.equal(createSmoothPath([{ x: 0, y: 2 }]), "M 0 2");
  assert.equal(
    createSmoothPath([
      { x: 0, y: 2 },
      { x: 4, y: 6 },
    ]),
    "M 0 2 Q 2 2 4 6",
  );
  assert.equal(formatPrice(1.234), "1.23");
  const candle = { time: "stored", open: 1, high: 1, low: 1, close: 1, volume: 1 };
  assert.equal(
    resolveCandleTimeLabel(candle, "1d", () => "custom"),
    "stored",
  );
  assert.equal(
    resolveCandleTimeLabel({ ...candle, timestamp: 1 }, "1d", () => "custom"),
    "custom",
  );
  assert.equal(resolveCandleTimeLabel(candle, "1d"), "stored");
});

test("demo candles have valid OHLC and timeframe labels", () => {
  for (const timeframe of ["1d", "1w", "realtime", "5m"] as const) {
    const candles = generateCandles({ symbol: "MSFT", market: "US", timeframe });
    assert.equal(candles.length, 64);
    assert.ok(
      candles.every(
        (c) => c.high >= Math.max(c.open, c.close) && c.low <= Math.min(c.open, c.close),
      ),
    );
    assert.match(
      candles[0].time,
      timeframe === "1w" || timeframe === "1d"
        ? /^\d{4}-\d{2}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/,
    );
  }
});
