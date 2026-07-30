import assert from "node:assert/strict";
import test from "node:test";
import {
  createChartDrawingCommandState,
  executeChartDrawingCommand,
  redoChartDrawingCommand,
  undoChartDrawingCommand,
} from "../src/features/chartDrawings/chartDrawingCommands.ts";

const drawing = {
  id: "line-1",
  type: "horizontal-line" as const,
  visible: true,
  createdAt: "2026-07-12T00:00:00.000Z",
  price: 100,
  label: "参考线",
};

test("drawing commands support add update delete with undo and redo", () => {
  let state = createChartDrawingCommandState([]);
  state = executeChartDrawingCommand(state, { type: "add", drawing });
  state = executeChartDrawingCommand(state, {
    type: "update",
    drawingId: drawing.id,
    drawing: { ...drawing, price: 120 },
  });
  assert.equal(state.drawings[0]?.type === "horizontal-line" ? state.drawings[0].price : 0, 120);
  state = undoChartDrawingCommand(state);
  assert.equal(state.drawings[0]?.type === "horizontal-line" ? state.drawings[0].price : 0, 100);
  state = redoChartDrawingCommand(state);
  assert.equal(state.drawings[0]?.type === "horizontal-line" ? state.drawings[0].price : 0, 120);
  state = executeChartDrawingCommand(state, { type: "delete", drawingId: drawing.id });
  assert.equal(state.drawings.length, 0);
  state = undoChartDrawingCommand(state);
  assert.equal(state.drawings.length, 1);
});
