import assert from "node:assert/strict";
import test from "node:test";
import { shouldRenderChartLayer } from "../src/layerVisibility.ts";

test("strategy visibility switch does not hide indicator or drawing layers", () => {
  assert.equal(
    shouldRenderChartLayer({ enabled: true, visible: true, source: "strategy" }, false),
    false,
  );
  assert.equal(
    shouldRenderChartLayer({ enabled: true, visible: true, source: "indicator" }, false),
    true,
  );
  assert.equal(
    shouldRenderChartLayer({ enabled: true, visible: true, source: "drawing" }, false),
    true,
  );
});
