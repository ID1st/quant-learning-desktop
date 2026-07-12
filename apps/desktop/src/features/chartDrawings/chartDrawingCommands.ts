import type { ChartDrawing } from "./chartDrawingStore.ts";

export type ChartDrawingCommand =
  | { readonly type: "add"; readonly drawing: ChartDrawing }
  | { readonly type: "update"; readonly drawingId: string; readonly drawing: ChartDrawing }
  | { readonly type: "delete"; readonly drawingId: string }
  | { readonly type: "clear" }
  | { readonly type: "replace"; readonly drawings: readonly ChartDrawing[] };

export interface ChartDrawingCommandState {
  readonly drawings: readonly ChartDrawing[];
  readonly undoStack: readonly ChartDrawingCommand[];
  readonly redoStack: readonly ChartDrawingCommand[];
}

export function createChartDrawingCommandState(drawings: readonly ChartDrawing[]): ChartDrawingCommandState {
  return { drawings, undoStack: [], redoStack: [] };
}

export function executeChartDrawingCommand(state: ChartDrawingCommandState, command: ChartDrawingCommand): ChartDrawingCommandState {
  const inverse = createInverseCommand(state.drawings, command);
  if (!inverse) return state;
  return {
    drawings: applyChartDrawingCommand(state.drawings, command),
    undoStack: [...state.undoStack, inverse],
    redoStack: [],
  };
}

export function undoChartDrawingCommand(state: ChartDrawingCommandState): ChartDrawingCommandState {
  const command = state.undoStack[state.undoStack.length - 1];
  if (!command) return state;
  const redo = createInverseCommand(state.drawings, command);
  if (!redo) return state;
  return {
    drawings: applyChartDrawingCommand(state.drawings, command),
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, redo],
  };
}

export function redoChartDrawingCommand(state: ChartDrawingCommandState): ChartDrawingCommandState {
  const command = state.redoStack[state.redoStack.length - 1];
  if (!command) return state;
  const undo = createInverseCommand(state.drawings, command);
  if (!undo) return state;
  return {
    drawings: applyChartDrawingCommand(state.drawings, command),
    undoStack: [...state.undoStack, undo],
    redoStack: state.redoStack.slice(0, -1),
  };
}

export function applyChartDrawingCommand(drawings: readonly ChartDrawing[], command: ChartDrawingCommand): ChartDrawing[] {
  if (command.type === "add") return drawings.some((drawing) => drawing.id === command.drawing.id) ? [...drawings] : [...drawings, command.drawing];
  if (command.type === "update") return drawings.map((drawing) => drawing.id === command.drawingId ? command.drawing : drawing);
  if (command.type === "delete") return drawings.filter((drawing) => drawing.id !== command.drawingId);
  if (command.type === "replace") return [...command.drawings];
  return [];
}

function createInverseCommand(drawings: readonly ChartDrawing[], command: ChartDrawingCommand): ChartDrawingCommand | null {
  if (command.type === "add") return { type: "delete", drawingId: command.drawing.id };
  if (command.type === "delete") {
    const drawing = drawings.find((item) => item.id === command.drawingId);
    return drawing ? { type: "add", drawing } : null;
  }
  if (command.type === "update") {
    const drawing = drawings.find((item) => item.id === command.drawingId);
    return drawing ? { type: "update", drawingId: drawing.id, drawing } : null;
  }
  return { type: "replace", drawings: [...drawings] };
}
