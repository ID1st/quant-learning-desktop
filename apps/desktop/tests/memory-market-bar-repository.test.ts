import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryMarketBarRepository } from "../src/features/marketData/memoryMarketBarRepository.ts";
import type {
  MarketBarCacheKey,
  MarketDataBar,
} from "../src/features/marketData/marketBarCacheService.ts";

const key: MarketBarCacheKey = {
  market: "CN",
  symbol: "600519.CN",
  timeframe: "1d",
  adjust: "forward",
};

function bar(timestamp: number, close: number): MarketDataBar {
  return {
    market: key.market,
    symbol: key.symbol,
    timeframe: key.timeframe,
    timestamp,
    open: close,
    high: close,
    low: close,
    close,
    volume: 10,
    provider: "stock-sdk",
  };
}

test("browser memory market cache follows the async repository contract", async () => {
  const repository = createMemoryMarketBarRepository();
  const day = 24 * 60 * 60 * 1_000;
  await repository.write(key, [bar(2 * day, 2), bar(day, 1)]);
  await repository.write(key, [bar(3 * day, 3)], { mergeExisting: true });

  assert.deepEqual(
    (await repository.read(key)).map((item) => item.close),
    [1, 2, 3],
  );
  assert.equal((await repository.summary()).totalBarCount, 3);
  assert.equal(await repository.clear(key), true);
  assert.deepEqual(await repository.read(key), []);
});
