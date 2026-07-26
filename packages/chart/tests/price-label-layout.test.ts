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
    plotTop: 20,
    plotBottom: 470,
  });

  assert.ok(layout.width >= 60);
  assert.ok(layout.x >= 42);
  assert.ok(layout.x + layout.width <= 898);
});

test("projected price labels remain inside the visible vertical plot range", () => {
  const topLayout = getProjectedPriceLabelLayout({
    label: "目标 1",
    lineEndX: 880,
    priceY: 22,
    plotLeft: 40,
    plotRight: 900,
    plotTop: 20,
    plotBottom: 470,
  });
  const bottomLayout = getProjectedPriceLabelLayout({
    label: "目标 1",
    lineEndX: 880,
    priceY: 468,
    plotLeft: 40,
    plotRight: 900,
    plotTop: 20,
    plotBottom: 470,
  });

  assert.equal(topLayout.y, 22);
  assert.equal(bottomLayout.y, 448);
});
