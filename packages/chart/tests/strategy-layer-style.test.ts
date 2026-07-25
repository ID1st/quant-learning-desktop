import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getChartLabelPosition, getChartLineDasharray } from "../src/strategyLayerStyle.ts";

describe("strategy layer styles", () => {
  it("maps solid, dashed and dotted lines to stable SVG strokes", () => {
    assert.equal(getChartLineDasharray("solid"), undefined);
    assert.equal(getChartLineDasharray("dashed"), "8 7");
    assert.equal(getChartLineDasharray("dotted"), "2 5");
  });

  it("anchors structure labels around the middle of their price line", () => {
    assert.deepEqual(getChartLabelPosition("above", { x1: 100, x2: 300 }, 220), {
      x: 200,
      y: 212,
      textAnchor: "middle",
    });
    assert.deepEqual(getChartLabelPosition("below", { x1: 100, x2: 300 }, 220), {
      x: 200,
      y: 234,
      textAnchor: "middle",
    });
  });

  it("keeps right-extended high/low labels inside the plot edge", () => {
    assert.deepEqual(getChartLabelPosition("right", { x1: 100, x2: 894 }, 220), {
      x: 888,
      y: 216,
      textAnchor: "end",
    });
  });
});
