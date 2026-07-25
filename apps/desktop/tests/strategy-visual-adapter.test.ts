import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toChartLayerElement } from "../src/features/strategies/strategyVisualAdapter.ts";

describe("strategy visual adapter", () => {
  it("preserves SMC label anchors and maps strategy labels to chart text", () => {
    const element = toChartLayerElement({
      id: "eqh-label",
      kind: "label",
      timestamp: 100,
      price: 112,
      text: "EQH",
      tone: "warning",
      color: "#F23645",
      lineStyle: "dotted",
      textSize: "tiny",
      labelAnchor: "above",
      placement: "over-candles",
      zIndex: 46,
    });

    assert.equal(element.kind, "text");
    assert.equal(element.color, "#F23645");
    assert.equal(element.labelAnchor, "above");
    assert.equal(element.placement, "over-candles");
  });

  it("passes candle styling through without changing its timestamp or z-index", () => {
    const element = toChartLayerElement({
      id: "trend-candle",
      kind: "candle-style",
      timestamp: 200,
      color: "#089981",
      zIndex: 35,
    });

    assert.deepEqual(element, {
      id: "trend-candle",
      kind: "candle-style",
      timestamp: 200,
      color: "#089981",
      zIndex: 35,
    });
  });
});
