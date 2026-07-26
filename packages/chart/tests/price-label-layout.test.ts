import assert from "node:assert/strict";
import test from "node:test";
import { getProjectedPriceLabelLayout } from "../src/priceLabelLayout.ts";

test("projected price labels use enough width for Chinese text without escaping the plot", () => {
  const layout = getProjectedPriceLabelLayout({
    label: "上方目标 3",
    lineEndX: 160,
    priceY: 100,
    plotLeft: 40,
    plotRight: 900,
  });

  assert.ok(layout.width >= 60);
  assert.ok(layout.x >= 42);
  assert.ok(layout.x + layout.width <= 898);
  assert.equal(layout.lineEndX, layout.x);
});

test("projected price labels keep their price position instead of pinning to plot edges", () => {
  const topLayout = getProjectedPriceLabelLayout({
    label: "目标 1",
    lineEndX: 880,
    priceY: -43,
    plotLeft: 40,
    plotRight: 900,
  });
  const bottomLayout = getProjectedPriceLabelLayout({
    label: "目标 1",
    lineEndX: 880,
    priceY: 1007,
    plotLeft: 40,
    plotRight: 900,
  });

  assert.equal(topLayout.y, -54);
  assert.equal(bottomLayout.y, 996);
});
