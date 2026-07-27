import assert from "node:assert/strict";
import test from "node:test";
import { getResponsiveSvgViewBoxHeight } from "../src/responsiveSvg.ts";

test("responsive chart viewBox matches a wide pane without horizontal letterboxing", () => {
  const viewBoxHeight = getResponsiveSvgViewBoxHeight({
    cssHeight: 560,
    cssWidth: 1_600,
    fallbackHeight: 520,
    viewBoxWidth: 980,
  });

  assert.equal(viewBoxHeight, 343);
  assert.equal(980 / viewBoxHeight, 1_600 / 560);
});

test("main and secondary panes use the same horizontal screen scale", () => {
  const mainHeight = getResponsiveSvgViewBoxHeight({
    cssHeight: 560,
    cssWidth: 1_600,
    fallbackHeight: 520,
    viewBoxWidth: 980,
  });
  const secondaryHeight = getResponsiveSvgViewBoxHeight({
    cssHeight: 220,
    cssWidth: 1_600,
    fallbackHeight: 220,
    viewBoxWidth: 980,
  });

  assert.equal(1_600 / 980, 560 / mainHeight);
  assert.equal(1_600 / 980, 220 / secondaryHeight);
});

test("responsive chart viewBox keeps a safe fallback before measurement", () => {
  assert.equal(
    getResponsiveSvgViewBoxHeight({
      cssHeight: 0,
      cssWidth: 0,
      fallbackHeight: 520,
      viewBoxWidth: 980,
    }),
    520,
  );
});
