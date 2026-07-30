import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryStorageDriver,
  LocalDatabase,
} from "../src/features/persistence/localDatabase.ts";
import {
  drawingsToLayer,
  readChartDrawings,
  writeChartDrawings,
} from "../src/features/chartDrawings/chartDrawingStore.ts";

test("chart drawings persist by market symbol and timeframe and render through a drawing layer", () => {
  const database = new LocalDatabase(createMemoryStorageDriver());
  const context = { market: "US" as const, symbol: "AAPL.US", timeframe: "1d" as const };
  writeChartDrawings(
    context,
    [
      {
        id: "line",
        type: "horizontal-line",
        visible: true,
        createdAt: "2026-07-10T00:00:00.000Z",
        price: 100,
        label: "参考线",
      },
    ],
    database,
  );

  const drawings = readChartDrawings(context, database);
  assert.equal(drawings.length, 1);
  assert.deepEqual(drawingsToLayer(drawings).elements, [
    { id: "line", kind: "price-line", price: 100, label: "参考线", tone: "neutral" },
  ]);
  assert.deepEqual(readChartDrawings({ ...context, timeframe: "1w" }, database), []);
});
