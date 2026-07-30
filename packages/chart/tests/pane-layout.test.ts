import assert from "node:assert/strict";
import test from "node:test";
import { clampSecondaryPaneRatio, getChartPaneGridTemplate } from "../src/paneLayout.ts";

test("secondary pane ratio is constrained to a readable 18 to 45 percent", () => {
  assert.equal(clampSecondaryPaneRatio(0.1), 0.18);
  assert.equal(clampSecondaryPaneRatio(0.26), 0.26);
  assert.equal(clampSecondaryPaneRatio(0.8), 0.45);
});

test("pane grid does not include a separator when no secondary pane is mounted", () => {
  assert.equal(getChartPaneGridTemplate(undefined), "minmax(0, 1fr)");
  assert.equal(getChartPaneGridTemplate(0.26), "minmax(0, 74fr) 7px minmax(0, 26fr)");
});
