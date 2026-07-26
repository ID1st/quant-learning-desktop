import assert from "node:assert/strict";
import test from "node:test";
import {
  collectLongPortHistoricalCandlesticks,
  type LongPortCandlestickLike,
} from "../src/electron/longPortBridge.ts";

const minute = 60_000;
const endTime = Date.UTC(2026, 6, 24, 20, 0);

function candle(timestamp: number): LongPortCandlestickLike {
  const decimal = (value: number) => ({ toString: () => String(value) });
  return {
    timestamp: new Date(timestamp),
    open: decimal(100),
    high: decimal(101),
    low: decimal(99),
    close: decimal(100.5),
    turnover: decimal(1_000),
    volume: 100,
  };
}

test("paginates backward, removes overlaps, and stops at the requested count", async () => {
  const pages = [
    Array.from({ length: 1_000 }, (_, index) => candle(endTime - index * minute)),
    Array.from({ length: 1_000 }, (_, index) => candle(endTime - (999 + index) * minute)),
  ];
  const cursors: Array<number | undefined> = [];
  const result = await collectLongPortHistoricalCandlesticks({
    count: 1_500,
    endTime,
    fetchPage: async (cursor) => {
      cursors.push(cursor);
      return pages.shift() ?? [];
    },
  });

  assert.equal(result.length, 1_500);
  assert.equal(cursors.length, 2);
  assert.ok((cursors[1] ?? 0) < (cursors[0] ?? Number.POSITIVE_INFINITY));
  assert.equal(new Set(result.map((item) => item.timestamp.getTime())).size, 1_500);
});

test("stops safely when a historical page makes no cursor progress", async () => {
  const samePage = [candle(endTime), candle(endTime - minute)];
  let calls = 0;
  const result = await collectLongPortHistoricalCandlesticks({
    count: 10,
    endTime,
    fetchPage: async () => {
      calls += 1;
      return samePage;
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.length, 2);
});

test("retries one rate-limited page with an injected short delay", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await collectLongPortHistoricalCandlesticks({
    count: 1,
    endTime,
    fetchPage: async () => {
      calls += 1;
      if (calls === 1) throw new Error("429 too many requests");
      return [candle(endTime - minute)];
    },
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    random: () => 0,
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [200]);
  assert.equal(result.length, 1);
});
