import type { CandlePoint, ChartRenderLayer } from "@quant/chart";

export type ChartIndicatorPlacement = "overlay" | "pane";
export type ChartIndicatorParameterValue = number | boolean;

export interface ChartIndicatorParameter {
  readonly key: string;
  readonly label: string;
  readonly type: "number" | "boolean";
  readonly defaultValue: ChartIndicatorParameterValue;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly step?: number;
}

export interface ChartIndicatorDefinition {
  readonly id: string;
  readonly name: string;
  readonly placement: ChartIndicatorPlacement;
  readonly parameters: readonly ChartIndicatorParameter[];
  evaluate(candles: readonly CandlePoint[], parameters: Readonly<Record<string, ChartIndicatorParameterValue>>): ChartRenderLayer | null;
}

export interface ChartIndicatorRegistry {
  register(definition: ChartIndicatorDefinition): void;
  get(id: string): ChartIndicatorDefinition | undefined;
  list(): readonly ChartIndicatorDefinition[];
}

export interface ChartIndicatorInstanceSettings {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly parameters: Readonly<Record<string, ChartIndicatorParameterValue>>;
}

export interface ChartIndicatorSettings {
  readonly instances: Readonly<Record<string, ChartIndicatorInstanceSettings>>;
}

export const builtInChartIndicatorDefinitions: readonly ChartIndicatorDefinition[] = [
  {
    id: "sma",
    name: "均线",
    placement: "overlay",
    parameters: [{ key: "window", label: "均线周期", type: "number", defaultValue: 9, minimum: 2, maximum: 240, step: 1 }],
    evaluate: (candles, parameters) => createMovingAverageLayer("sma", "均线", candles, Number(parameters.window), movingAverage),
  },
  {
    id: "ema",
    name: "指数均线",
    placement: "overlay",
    parameters: [{ key: "window", label: "EMA 周期", type: "number", defaultValue: 20, minimum: 2, maximum: 240, step: 1 }],
    evaluate: (candles, parameters) => createMovingAverageLayer("ema", "EMA", candles, Number(parameters.window), exponentialMovingAverage),
  },
  {
    id: "boll",
    name: "布林带",
    placement: "overlay",
    parameters: [
      { key: "window", label: "布林周期", type: "number", defaultValue: 20, minimum: 2, maximum: 240, step: 1 },
      { key: "multiplier", label: "标准差倍数", type: "number", defaultValue: 2, minimum: 0.1, maximum: 6, step: 0.1 },
    ],
    evaluate: (candles, parameters) => {
      const points = candles.map((candle, index) => ({ timestamp: candle.timestamp ?? index, close: candle.close }));
      const bands = bollingerBands(points, Number(parameters.window), Number(parameters.multiplier));
      return {
        id: "indicator-boll",
        name: "布林带",
        source: "indicator",
        enabled: true,
        visible: true,
        zIndex: 18,
        elements: [
          { id: "boll-upper", kind: "trend-line", tone: "bearish", points: bands.map((point) => ({ timestamp: point.timestamp, price: point.upper })) },
          { id: "boll-mid", kind: "trend-line", tone: "neutral", points: bands.map((point) => ({ timestamp: point.timestamp, price: point.mid })) },
          { id: "boll-lower", kind: "trend-line", tone: "bullish", points: bands.map((point) => ({ timestamp: point.timestamp, price: point.lower })) },
        ],
      };
    },
  },
];

export const defaultChartIndicatorSettings: ChartIndicatorSettings = {
  instances: Object.fromEntries(builtInChartIndicatorDefinitions.map((definition) => [
    definition.id,
    createDefaultIndicatorInstance(definition, definition.id === "sma"),
  ])),
};

export function createChartIndicatorRegistry(initialDefinitions: readonly ChartIndicatorDefinition[] = []): ChartIndicatorRegistry {
  const definitions = new Map<string, ChartIndicatorDefinition>();
  initialDefinitions.forEach((definition) => definitions.set(definition.id, definition));
  return {
    register(definition) {
      if (definitions.has(definition.id)) throw new Error(`重复指标注册：${definition.id}`);
      definitions.set(definition.id, definition);
    },
    get: (id) => definitions.get(id),
    list: () => Array.from(definitions.values()),
  };
}

export function createDefaultIndicatorInstance(definition: ChartIndicatorDefinition, enabled = false): ChartIndicatorInstanceSettings {
  return {
    available: true,
    enabled,
    visible: true,
    parameters: Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.defaultValue])),
  };
}

export function getIndicatorInstance(settings: ChartIndicatorSettings, indicatorId: string, definition?: ChartIndicatorDefinition): ChartIndicatorInstanceSettings {
  const instances = settings && typeof settings === "object" && settings.instances && typeof settings.instances === "object" ? settings.instances : {};
  return instances[indicatorId] ?? (definition ? createDefaultIndicatorInstance(definition) : { available: true, enabled: false, visible: true, parameters: {} });
}

export function ensureChartIndicatorSettings(settings: ChartIndicatorSettings, definitions: readonly ChartIndicatorDefinition[]): ChartIndicatorSettings {
  let changed = false;
  const instances = { ...settings.instances };
  definitions.forEach((definition) => {
    const current = instances[definition.id];
    const next = sanitizeIndicatorInstance(current, definition, definition.id === "sma");
    if (!current || JSON.stringify(current) !== JSON.stringify(next)) changed = true;
    instances[definition.id] = next;
  });
  return changed ? { instances } : settings;
}

export function updateIndicatorInstance(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  update: (current: ChartIndicatorInstanceSettings) => ChartIndicatorInstanceSettings,
  definition?: ChartIndicatorDefinition,
): ChartIndicatorSettings {
  const current = getIndicatorInstance(settings, indicatorId, definition);
  return { instances: { ...settings.instances, [indicatorId]: update(current) } };
}

export function createChartIndicatorLayers(candles: readonly CandlePoint[], settings: ChartIndicatorSettings, definitions = builtInChartIndicatorDefinitions): ChartRenderLayer[] {
  return definitions.flatMap((definition) => {
    const instance = getIndicatorInstance(settings, definition.id, definition);
    if (!instance.available || !instance.enabled) return [];
    try {
      const layer = definition.evaluate(candles, sanitizeIndicatorParameters(instance.parameters, definition));
      return layer ? [{ ...layer, visible: instance.visible, zIndex: layer.zIndex ?? 20 }] : [];
    } catch {
      return [];
    }
  });
}

export function createPluginIndicatorLayers(candles: readonly CandlePoint[], definitions: readonly ChartIndicatorDefinition[], settings: ChartIndicatorSettings): ChartRenderLayer[] {
  return createChartIndicatorLayers(candles, settings, definitions);
}

export function sanitizeChartIndicatorSettings(value: unknown): ChartIndicatorSettings {
  if (value && typeof value === "object" && "instances" in value) {
    const instances = (value as { instances?: unknown }).instances;
    const parsed = instances && typeof instances === "object" && !Array.isArray(instances) ? instances as Record<string, unknown> : {};
    return ensureChartIndicatorSettings({ instances: Object.fromEntries(builtInChartIndicatorDefinitions.map((definition) => [definition.id, sanitizeIndicatorInstance(parsed[definition.id], definition, definition.id === "sma")])) }, builtInChartIndicatorDefinitions);
  }

  const legacy = value && typeof value === "object" ? value as {
    movingAverage?: Partial<{ available: boolean; enabled: boolean; visible: boolean; window: number }>;
    bollingerBands?: Partial<{ available: boolean; enabled: boolean; visible: boolean; window: number; multiplier: number }>;
  } : {};
  return {
    instances: {
      sma: sanitizeIndicatorInstance({ ...legacy.movingAverage, parameters: { window: legacy.movingAverage?.window } }, builtInChartIndicatorDefinitions[0]!, true),
      ema: createDefaultIndicatorInstance(builtInChartIndicatorDefinitions[1]!),
      boll: sanitizeIndicatorInstance({ ...legacy.bollingerBands, parameters: { window: legacy.bollingerBands?.window, multiplier: legacy.bollingerBands?.multiplier } }, builtInChartIndicatorDefinitions[2]!),
    },
  };
}

function sanitizeIndicatorInstance(value: unknown, definition: ChartIndicatorDefinition, defaultEnabled = false): ChartIndicatorInstanceSettings {
  const parsed = value && typeof value === "object" ? value as Partial<ChartIndicatorInstanceSettings> : {};
  return {
    available: typeof parsed.available === "boolean" ? parsed.available : true,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultEnabled,
    visible: typeof parsed.visible === "boolean" ? parsed.visible : true,
    parameters: sanitizeIndicatorParameters(parsed.parameters ?? {}, definition),
  };
}

function sanitizeIndicatorParameters(value: Readonly<Record<string, unknown>>, definition: ChartIndicatorDefinition): Record<string, ChartIndicatorParameterValue> {
  return Object.fromEntries(definition.parameters.map((parameter) => {
    const candidate = value[parameter.key];
    if (parameter.type === "boolean") return [parameter.key, typeof candidate === "boolean" ? candidate : parameter.defaultValue];
    const number = typeof candidate === "number" && Number.isFinite(candidate) ? candidate : Number(parameter.defaultValue);
    return [parameter.key, Math.min(parameter.maximum ?? Number.POSITIVE_INFINITY, Math.max(parameter.minimum ?? Number.NEGATIVE_INFINITY, number))];
  }));
}

function createMovingAverageLayer(id: string, name: string, candles: readonly CandlePoint[], window: number, evaluator: typeof movingAverage): ChartRenderLayer {
  const points = candles.map((candle, index) => ({ timestamp: candle.timestamp ?? index, close: candle.close }));
  return { id: `indicator-${id}`, name: `${name} ${window}`, source: "indicator", enabled: true, visible: true, zIndex: 20, elements: [{ id: `${id}-line`, kind: "trend-line", tone: "bullish", points: evaluator(points, window) }] };
}

function movingAverage(points: readonly { timestamp: number; close: number }[], window: number) {
  const size = Math.max(2, Math.min(240, Math.round(window)));
  return points.map((point, index) => {
    const values = points.slice(Math.max(0, index - size + 1), index + 1);
    return { timestamp: point.timestamp, price: values.reduce((total, item) => total + item.close, 0) / values.length };
  });
}

function exponentialMovingAverage(points: readonly { timestamp: number; close: number }[], window: number) {
  const size = Math.max(2, Math.min(240, Math.round(window)));
  const multiplier = 2 / (size + 1);
  let previous = points[0]?.close ?? 0;
  return points.map((point) => {
    previous = point.close * multiplier + previous * (1 - multiplier);
    return { timestamp: point.timestamp, price: previous };
  });
}

function bollingerBands(points: readonly { timestamp: number; close: number }[], window: number, multiplier: number) {
  const size = Math.max(2, Math.min(240, Math.round(window)));
  const factor = Math.max(0.1, Math.min(6, multiplier));
  return points.map((point, index) => {
    const values = points.slice(Math.max(0, index - size + 1), index + 1).map((item) => item.close);
    const mid = values.reduce((total, value) => total + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((total, value) => total + (value - mid) ** 2, 0) / values.length);
    return { timestamp: point.timestamp, mid, upper: mid + deviation * factor, lower: mid - deviation * factor };
  });
}
