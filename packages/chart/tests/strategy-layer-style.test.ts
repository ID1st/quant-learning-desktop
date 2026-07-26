import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getChartHudRightOffset,
  getChartTextSize,
  getChartLabelPosition,
  getChartLineDasharray,
  getSignalMarkerLabelWidth,
  shouldExtendTimedElementToPlotRight,
} from "../src/strategyLayerStyle.ts";

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

  it("keeps HUD panels left of the responsive price axis with a readable gap", () => {
    assert.equal(getChartHudRightOffset(), "calc(8.7755% + 32px)");
  });

  it("expands text signal markers beyond the icon-only width without growing unbounded", () => {
    assert.equal(getSignalMarkerLabelWidth("▲"), 26);
    assert.equal(getSignalMarkerLabelWidth("向上突破（高量）"), 84);
    assert.equal(getSignalMarkerLabelWidth("A".repeat(100)), 180);
  });

  it("uses compact chart-layer typography by default", () => {
    assert.equal(getChartTextSize(undefined), 10);
    assert.equal(getChartTextSize("tiny"), 8);
    assert.equal(getChartTextSize("small"), 9);
    assert.equal(getChartTextSize("normal"), 10);
    assert.equal(getChartTextSize("large"), 12);
  });

  it("stops a timed strategy line at the latest candle instead of the price axis", () => {
    assert.equal(
      shouldExtendTimedElementToPlotRight({
        extendRight: false,
        hasToTimestamp: true,
        toTimestamp: 200,
        visibleEndTimestamp: 200,
      }),
      false,
    );
    assert.equal(
      shouldExtendTimedElementToPlotRight({
        extendRight: false,
        hasToTimestamp: true,
        toTimestamp: 201,
        visibleEndTimestamp: 200,
      }),
      true,
    );
  });
});
