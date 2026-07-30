import type { ChartRenderLayer } from "@quant/chart";
import type { Market, Timeframe } from "@quant/shared";
import { appLocalDatabase, type LocalDatabase } from "../persistence/localDatabase.ts";

export type ChartDrawing =
  | {
      id: string;
      type: "trend-line";
      visible: boolean;
      createdAt: string;
      points: [{ timestamp: number; price: number }, { timestamp: number; price: number }];
    }
  | {
      id: string;
      type: "horizontal-line";
      visible: boolean;
      createdAt: string;
      price: number;
      label: string;
    }
  | {
      id: string;
      type: "text";
      visible: boolean;
      createdAt: string;
      timestamp: number;
      price: number;
      text: string;
    };

const version = 1;

function collection(market: Market, symbol: string, timeframe: Timeframe) {
  return `chart-drawings:${market}:${symbol}:${timeframe}`;
}

export function readChartDrawings(
  context: { market: Market; symbol: string; timeframe: Timeframe },
  database: LocalDatabase = appLocalDatabase,
): ChartDrawing[] {
  return database.readDocument(collection(context.market, context.symbol, context.timeframe), {
    version,
    fallback: [],
    sanitize: sanitizeDrawings,
  });
}

export function writeChartDrawings(
  context: { market: Market; symbol: string; timeframe: Timeframe },
  drawings: readonly ChartDrawing[],
  database: LocalDatabase = appLocalDatabase,
) {
  database.writeDocument(
    collection(context.market, context.symbol, context.timeframe),
    version,
    drawings,
  );
}

export function drawingsToLayer(drawings: readonly ChartDrawing[]): ChartRenderLayer {
  return {
    id: "user-drawings",
    name: "我的画线",
    source: "drawing",
    enabled: true,
    visible: true,
    zIndex: 8,
    elements: drawings
      .filter((drawing) => drawing.visible)
      .map((drawing) => {
        if (drawing.type === "trend-line")
          return {
            id: drawing.id,
            kind: "trend-line" as const,
            tone: "neutral" as const,
            points: drawing.points,
          };
        if (drawing.type === "horizontal-line")
          return {
            id: drawing.id,
            kind: "price-line" as const,
            price: drawing.price,
            label: drawing.label,
            tone: "neutral" as const,
          };
        return {
          id: drawing.id,
          kind: "text" as const,
          timestamp: drawing.timestamp,
          price: drawing.price,
          text: drawing.text,
        };
      }),
  };
}

function sanitizeDrawings(value: unknown): ChartDrawing[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is ChartDrawing =>
    Boolean(
      item &&
      typeof item === "object" &&
      "id" in item &&
      "type" in item &&
      "visible" in item &&
      "createdAt" in item,
    ),
  );
}
