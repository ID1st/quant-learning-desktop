import type { CandlePoint, ChartPaneModel, ChartRenderLayer } from "@quant/chart";
import type { Market } from "@quant/shared";
import type { IndicatorConvention } from "./indicatorMath.ts";
import { builtInChartIndicatorDefinitions } from "./builtInChartIndicators.ts";
import type {
  ChartIndicatorDefinition,
  ChartIndicatorEvaluation,
  ChartIndicatorEvaluationResult,
  ChartIndicatorInstanceSettings,
  ChartIndicatorParameterValue,
  ChartIndicatorRegistry,
  ChartIndicatorSettings,
  IndicatorConventionMode,
} from "./chartIndicatorContracts.ts";

export * from "./chartIndicatorContracts.ts";
export { builtInChartIndicatorDefinitions } from "./builtInChartIndicators.ts";

const builtInById = new Map(
  builtInChartIndicatorDefinitions.map((definition) => [definition.id, definition]),
);

export const defaultChartIndicatorSettings: ChartIndicatorSettings = {
  conventionMode: "auto",
  instances: Object.fromEntries(
    builtInChartIndicatorDefinitions.map((definition) => [
      definition.id,
      createDefaultIndicatorInstance(definition),
    ]),
  ),
};

export function createChartIndicatorRegistry(
  initialDefinitions: readonly ChartIndicatorDefinition[] = [],
): ChartIndicatorRegistry {
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

function defaultParameters(definition: ChartIndicatorDefinition, convention: IndicatorConvention) {
  return Object.fromEntries(
    definition.parameters.map((parameter) => [
      parameter.key,
      convention === "a-share"
        ? (parameter.aShareDefaultValue ?? parameter.defaultValue)
        : parameter.defaultValue,
    ]),
  );
}

export function createDefaultIndicatorInstance(
  definition: ChartIndicatorDefinition,
  enabled = false,
): ChartIndicatorInstanceSettings {
  return {
    available: true,
    enabled,
    visible: true,
    parametersByConvention: {
      "a-share": defaultParameters(definition, "a-share"),
      "cross-market": defaultParameters(definition, "cross-market"),
    },
  };
}

export function getIndicatorInstance(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  definition?: ChartIndicatorDefinition,
): ChartIndicatorInstanceSettings {
  const instances =
    settings &&
    typeof settings === "object" &&
    settings.instances &&
    typeof settings.instances === "object"
      ? settings.instances
      : {};
  const resolvedDefinition = definition ?? builtInById.get(indicatorId);
  return (
    instances[indicatorId] ??
    (resolvedDefinition
      ? createDefaultIndicatorInstance(resolvedDefinition)
      : {
          available: true,
          enabled: false,
          visible: true,
          parametersByConvention: { "a-share": {}, "cross-market": {} },
        })
  );
}

export function resolveIndicatorConvention(
  mode: IndicatorConventionMode,
  market: Market,
): IndicatorConvention {
  if (mode !== "auto") return mode;
  return market === "CN" ? "a-share" : "cross-market";
}

export function getIndicatorParameters(
  instance: ChartIndicatorInstanceSettings,
  convention: IndicatorConvention,
): Readonly<Record<string, ChartIndicatorParameterValue>> {
  return instance.parametersByConvention[convention] ?? {};
}

export function updateIndicatorInstance(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  update: (current: ChartIndicatorInstanceSettings) => ChartIndicatorInstanceSettings,
  definition?: ChartIndicatorDefinition,
): ChartIndicatorSettings {
  const current = getIndicatorInstance(settings, indicatorId, definition);
  return { ...settings, instances: { ...settings.instances, [indicatorId]: update(current) } };
}

export function setIndicatorEnabled(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  enabled: boolean,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
): ChartIndicatorSettings {
  const definition =
    definitions.find((item) => item.id === indicatorId) ?? builtInById.get(indicatorId);
  const instances = { ...settings.instances };
  if (enabled && definition?.placement === "pane") {
    definitions
      .filter((item) => item.placement === "pane" && item.id !== indicatorId)
      .forEach((item) => {
        const current = getIndicatorInstance(settings, item.id, item);
        instances[item.id] = { ...current, enabled: false };
      });
  }
  const current = getIndicatorInstance({ ...settings, instances }, indicatorId, definition);
  instances[indicatorId] = { ...current, available: true, enabled, visible: true };
  return { ...settings, instances };
}

export function updateIndicatorParameter(
  settings: ChartIndicatorSettings,
  indicatorId: string,
  convention: IndicatorConvention,
  key: string,
  value: ChartIndicatorParameterValue,
  definitionOverride?: ChartIndicatorDefinition,
): ChartIndicatorSettings {
  const definition = definitionOverride ?? builtInById.get(indicatorId);
  if (!definition) return settings;
  return updateIndicatorInstance(
    settings,
    indicatorId,
    (current) => ({
      ...current,
      parametersByConvention: {
        ...current.parametersByConvention,
        [convention]: sanitizeIndicatorParameters(
          { ...current.parametersByConvention[convention], [key]: value },
          definition,
          convention,
        ),
      },
    }),
    definition,
  );
}

export function ensureChartIndicatorSettings(
  settings: ChartIndicatorSettings,
  definitions: readonly ChartIndicatorDefinition[],
): ChartIndicatorSettings {
  const instances = { ...settings.instances };
  definitions.forEach((definition) => {
    instances[definition.id] = sanitizeIndicatorInstance(instances[definition.id], definition);
  });
  let paneFound = false;
  definitions
    .filter((definition) => definition.placement === "pane")
    .forEach((definition) => {
      const instance = instances[definition.id]!;
      if (!instance.enabled) return;
      instances[definition.id] = { ...instance, enabled: !paneFound };
      paneFound = true;
    });
  return {
    conventionMode: sanitizeConventionMode(settings.conventionMode),
    instances,
  };
}

function normalizeEvaluation(
  result: ChartIndicatorEvaluationResult | ChartRenderLayer,
  definition: ChartIndicatorDefinition,
): ChartIndicatorEvaluationResult {
  if ("placement" in result && (result.placement === "overlay" || result.placement === "pane"))
    return result as ChartIndicatorEvaluationResult;
  return {
    placement: definition.placement === "pane" ? "pane" : "overlay",
    layer: result as ChartRenderLayer,
  } as ChartIndicatorEvaluationResult;
}

export function createChartIndicatorEvaluations(
  candles: readonly CandlePoint[],
  settings: ChartIndicatorSettings,
  convention: IndicatorConvention,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
): ChartIndicatorEvaluation[] {
  const evaluations: ChartIndicatorEvaluation[] = [];
  definitions.forEach((definition) => {
    const instance = getIndicatorInstance(settings, definition.id, definition);
    if (!instance.available || !instance.enabled) return;
    try {
      const evaluated = definition.evaluate(
        candles,
        sanitizeIndicatorParameters(
          getIndicatorParameters(instance, convention),
          definition,
          convention,
        ),
        convention,
      );
      if (!evaluated) return;
      const result = normalizeEvaluation(evaluated, definition);
      if (result.placement === "pane") {
        evaluations.push({
          id: definition.id,
          placement: "pane",
          visible: instance.visible,
          pane: result.pane,
        });
        return;
      }
      evaluations.push({
        id: definition.id,
        placement: "overlay",
        visible: instance.visible,
        layer: { ...result.layer, visible: instance.visible, zIndex: result.layer.zIndex ?? 20 },
      });
    } catch {
      return;
    }
  });
  return evaluations;
}

export function createChartIndicatorLayers(
  candles: readonly CandlePoint[],
  settings: ChartIndicatorSettings,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
  convention: IndicatorConvention = "cross-market",
): ChartRenderLayer[] {
  return createChartIndicatorEvaluations(candles, settings, convention, definitions).flatMap(
    (evaluation) => (evaluation.placement === "overlay" ? [evaluation.layer] : []),
  );
}

export function createChartSecondaryPane(
  candles: readonly CandlePoint[],
  settings: ChartIndicatorSettings,
  convention: IndicatorConvention,
  definitions: readonly ChartIndicatorDefinition[] = builtInChartIndicatorDefinitions,
): ChartPaneModel | undefined {
  const evaluation = createChartIndicatorEvaluations(
    candles,
    settings,
    convention,
    definitions,
  ).find(
    (item): item is Extract<ChartIndicatorEvaluation, { placement: "pane" }> =>
      item.placement === "pane" && item.visible,
  );
  return evaluation?.pane;
}

export function createPluginIndicatorLayers(
  candles: readonly CandlePoint[],
  definitions: readonly ChartIndicatorDefinition[],
  settings: ChartIndicatorSettings,
  convention: IndicatorConvention = "cross-market",
): ChartRenderLayer[] {
  return createChartIndicatorLayers(candles, settings, definitions, convention);
}

export function sanitizeChartIndicatorSettings(value: unknown): ChartIndicatorSettings {
  if (value && typeof value === "object" && "instances" in value) {
    const parsed = value as { conventionMode?: unknown; instances?: unknown };
    const rawInstances =
      parsed.instances && typeof parsed.instances === "object" && !Array.isArray(parsed.instances)
        ? (parsed.instances as Record<string, unknown>)
        : {};
    const migratedInstances = { ...rawInstances };
    if (!migratedInstances.ma && migratedInstances.sma)
      migratedInstances.ma = migrateSmaInstance(migratedInstances.sma);
    migratedInstances.ema = migrateLegacyWindowParameters(migratedInstances.ema, "ema");
    migratedInstances.boll = migrateLegacyWindowParameters(migratedInstances.boll, "boll");
    const instances = Object.fromEntries(
      builtInChartIndicatorDefinitions.map((definition) => [
        definition.id,
        sanitizeIndicatorInstance(migratedInstances[definition.id], definition),
      ]),
    );
    Object.entries(migratedInstances).forEach(([id, instance]) => {
      if (id !== "sma" && !builtInById.has(id))
        instances[id] = sanitizeUnknownIndicatorInstance(instance);
    });
    return ensureChartIndicatorSettings(
      {
        conventionMode: sanitizeConventionMode(parsed.conventionMode),
        instances,
      },
      builtInChartIndicatorDefinitions,
    );
  }

  const legacy =
    value && typeof value === "object"
      ? (value as {
          movingAverage?: Partial<{
            available: boolean;
            enabled: boolean;
            visible: boolean;
            window: number;
          }>;
          bollingerBands?: Partial<{
            available: boolean;
            enabled: boolean;
            visible: boolean;
            window: number;
            multiplier: number;
          }>;
        })
      : {};
  const instances = Object.fromEntries(
    builtInChartIndicatorDefinitions.map((definition) => [
      definition.id,
      createDefaultIndicatorInstance(definition),
    ]),
  );
  if (legacy.movingAverage)
    instances.ma = sanitizeIndicatorInstance(
      migrateSmaInstance(legacy.movingAverage),
      builtInById.get("ma")!,
    );
  if (legacy.bollingerBands) {
    const legacyBoll = {
      ...legacy.bollingerBands,
      parameters: {
        period: legacy.bollingerBands.window,
        multiplier: legacy.bollingerBands.multiplier,
      },
    };
    instances.boll = sanitizeIndicatorInstance(legacyBoll, builtInById.get("boll")!);
  }
  return { conventionMode: "auto", instances };
}

function migrateSmaInstance(value: unknown) {
  const parsed =
    value && typeof value === "object"
      ? (value as {
          available?: boolean;
          enabled?: boolean;
          visible?: boolean;
          window?: number;
          parameters?: { window?: number };
        })
      : {};
  const first = Number.isFinite(parsed.parameters?.window)
    ? parsed.parameters!.window!
    : Number.isFinite(parsed.window)
      ? parsed.window!
      : 5;
  const periods = [first, 10, 20, 60].filter((period, index, all) => all.indexOf(period) === index);
  [5, 10, 20, 60].forEach((period) => {
    if (periods.length < 4 && !periods.includes(period)) periods.push(period);
  });
  return {
    available: parsed.available,
    enabled: parsed.enabled,
    visible: parsed.visible,
    parameters: Object.fromEntries(
      periods.slice(0, 4).map((period, index) => [`period${index + 1}`, period]),
    ),
  };
}

function migrateLegacyWindowParameters(value: unknown, indicatorId: "ema" | "boll") {
  if (!value || typeof value !== "object") return value;
  const parsed = value as {
    parameters?: Readonly<Record<string, unknown>>;
    parametersByConvention?: unknown;
  };
  if (
    parsed.parametersByConvention ||
    !parsed.parameters ||
    !Number.isFinite(parsed.parameters.window)
  )
    return value;
  const parameters =
    indicatorId === "ema"
      ? { period1: parsed.parameters.window, period2: 10, period3: 20, period4: 60 }
      : { period: parsed.parameters.window, multiplier: parsed.parameters.multiplier };
  return { ...parsed, parameters };
}

function sanitizeConventionMode(value: unknown): IndicatorConventionMode {
  return value === "a-share" || value === "cross-market" ? value : "auto";
}

function sanitizeUnknownIndicatorInstance(value: unknown): ChartIndicatorInstanceSettings {
  const parsed =
    value && typeof value === "object"
      ? (value as {
          available?: unknown;
          enabled?: unknown;
          visible?: unknown;
          parameters?: unknown;
          parametersByConvention?: Partial<Record<IndicatorConvention, unknown>>;
        })
      : {};
  const sanitizeParameters = (parameters: unknown) =>
    parameters && typeof parameters === "object" && !Array.isArray(parameters)
      ? Object.fromEntries(
          Object.entries(parameters).flatMap(([key, candidate]) =>
            typeof candidate === "boolean" ||
            (typeof candidate === "number" && Number.isFinite(candidate))
              ? [[key, candidate]]
              : [],
          ),
        )
      : {};
  const legacy = sanitizeParameters(parsed.parameters);
  return {
    available: typeof parsed.available === "boolean" ? parsed.available : true,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
    visible: typeof parsed.visible === "boolean" ? parsed.visible : true,
    parametersByConvention: {
      "a-share": sanitizeParameters(parsed.parametersByConvention?.["a-share"] ?? legacy),
      "cross-market": sanitizeParameters(parsed.parametersByConvention?.["cross-market"] ?? legacy),
    },
  };
}

function sanitizeIndicatorInstance(
  value: unknown,
  definition: ChartIndicatorDefinition,
): ChartIndicatorInstanceSettings {
  const parsed =
    value && typeof value === "object"
      ? (value as {
          available?: unknown;
          enabled?: unknown;
          visible?: unknown;
          parameters?: Readonly<Record<string, unknown>>;
          parametersByConvention?: Partial<
            Record<IndicatorConvention, Readonly<Record<string, unknown>>>
          >;
        })
      : {};
  const legacyParameters = parsed.parameters ?? {};
  return {
    available: typeof parsed.available === "boolean" ? parsed.available : true,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
    visible: typeof parsed.visible === "boolean" ? parsed.visible : true,
    parametersByConvention: {
      "a-share": sanitizeIndicatorParameters(
        parsed.parametersByConvention?.["a-share"] ?? legacyParameters,
        definition,
        "a-share",
      ),
      "cross-market": sanitizeIndicatorParameters(
        parsed.parametersByConvention?.["cross-market"] ?? legacyParameters,
        definition,
        "cross-market",
      ),
    },
  };
}

function sanitizeIndicatorParameters(
  value: Readonly<Record<string, unknown>>,
  definition: ChartIndicatorDefinition,
  convention: IndicatorConvention,
): Record<string, ChartIndicatorParameterValue> {
  return Object.fromEntries(
    definition.parameters.map((parameter) => {
      const fallback =
        convention === "a-share"
          ? (parameter.aShareDefaultValue ?? parameter.defaultValue)
          : parameter.defaultValue;
      const candidate = value[parameter.key];
      if (parameter.type === "boolean")
        return [parameter.key, typeof candidate === "boolean" ? candidate : fallback];
      const number =
        typeof candidate === "number" && Number.isFinite(candidate) ? candidate : Number(fallback);
      return [
        parameter.key,
        Math.min(
          parameter.maximum ?? Number.POSITIVE_INFINITY,
          Math.max(parameter.minimum ?? Number.NEGATIVE_INFINITY, number),
        ),
      ];
    }),
  );
}
