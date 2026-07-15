import vm from "node:vm";
import type { StrategyInput, StrategyOutput, StrategyParameterDefinition } from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";
import type {
  PluginRuntimeHostRequest,
  PluginRuntimeHostResponse,
  PluginRuntimeSnapshot,
  PluginStrategyRuntimeDescriptor,
} from "./pluginRuntimeProtocol.ts";

const executionTimeoutMs = 750;
const maxBars = 5_000;
const maxOutputBytes = 512 * 1024;

interface LoadedStrategy {
  readonly descriptor: PluginStrategyRuntimeDescriptor;
  readonly run: (input: StrategyInput) => unknown;
}

const runtime = createPluginUtilityRuntime((response) => process.parentPort?.postMessage(response));

process.parentPort?.on("message", (event) => {
  void runtime(event.data as PluginRuntimeHostRequest).catch((error) => {
    const id = getRequestId(event.data);
    if (id) post({ id, ok: false, message: sanitizeError(error) });
  });
});

export function createPluginUtilityRuntime(postResponse: (response: PluginRuntimeHostResponse) => void) {
  const strategies = new Map<string, LoadedStrategy>();
  return async (request: PluginRuntimeHostRequest) => {
    if (request.type === "refresh") {
      strategies.clear();
      const snapshot = activateModules(request.modules, strategies);
      postResponse({ id: request.id, ok: true, type: "refresh", snapshot });
      return;
    }

    const strategy = strategies.get(createStrategyId(request.pluginId, request.key));
    if (!strategy) {
      postResponse({ id: request.id, ok: false, message: "Plugin strategy is not available in the isolated runtime." });
      return;
    }

    try {
      const input = sanitizeStrategyInput(request.input);
      const output = strategy.run(input);
      if (isPromiseLike(output)) {
        throw new Error("Plugin strategies must return synchronously.");
      }
      postResponse({ id: request.id, ok: true, type: "run-strategy", output: sanitizeStrategyOutput(output, strategy.descriptor, input) });
    } catch (error) {
      postResponse({ id: request.id, ok: false, message: sanitizeError(error) });
    }
  };
}

function activateModules(modules: readonly { readonly plugin: { readonly manifest: { readonly id: string } }; readonly source: string }[], strategies: Map<string, LoadedStrategy>): PluginRuntimeSnapshot {
  const runtimeStrategies: PluginStrategyRuntimeDescriptor[] = [];
  const logs: Array<{ pluginId: string; message: string }> = [];
  const failures: Array<{ pluginId: string; message: string }> = [];

  for (const module of modules) {
    const pluginId = module.plugin.manifest.id;
    try {
      const registered = activateModule(pluginId, module.source, logs);
      const ids = new Set<string>();
      registered.forEach((strategy) => {
        const id = createStrategyId(pluginId, strategy.descriptor.key);
        if (strategies.has(id) || ids.has(id)) throw new Error(`Duplicate plugin strategy key: ${strategy.descriptor.key}`);
        ids.add(id);
      });
      // Activate a plugin atomically: an invalid second registration must not
      // leave the earlier strategy from the same package runnable.
      registered.forEach((strategy) => {
        const id = createStrategyId(pluginId, strategy.descriptor.key);
        strategies.set(id, strategy);
        runtimeStrategies.push(strategy.descriptor);
      });
    } catch (error) {
      failures.push({ pluginId, message: sanitizeError(error) });
    }
  }

  return { strategies: runtimeStrategies, logs, failures };
}

function activateModule(pluginId: string, source: string, logs: Array<{ pluginId: string; message: string }>): LoadedStrategy[] {
  if (source.length > 256 * 1024) throw new Error("Plugin runtime entry is too large.");
  if (/\b(?:import|require)\b/u.test(source)) throw new Error("Plugin runtime modules cannot import other modules.");

  const registered: LoadedStrategy[] = [];
  const sandbox = Object.create(null) as Record<string, unknown>;
  Object.assign(sandbox, {
    Array,
    Boolean,
    Date,
    JSON,
    Math,
    Number,
    Object,
    String,
    globalThis: sandbox,
  });
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  const transformed = transformPluginModule(source);
  vm.runInContext(transformed, context, { timeout: executionTimeoutMs, displayErrors: false });
  const activate = sandbox.__pluginActivate;
  if (typeof activate !== "function") throw new Error("Plugin entry must export activate(context).");

  const activationContext = Object.freeze({
    registerStrategy(candidate: unknown) {
      registered.push(normalizeStrategy(candidate, pluginId));
    },
    registerIndicator() {
      throw new Error("Indicator plugins are not enabled in the isolated runtime yet.");
    },
    log(message: unknown) {
      const normalized = typeof message === "string" ? message.trim().replace(/\s+/gu, " ") : "";
      if (normalized) logs.push({ pluginId, message: normalized.slice(0, 800) });
    },
  });
  const activationResult = (activate as (context: unknown) => unknown)(activationContext);
  if (isPromiseLike(activationResult)) throw new Error("Plugin activation must finish synchronously.");
  return registered;
}

function transformPluginModule(source: string) {
  const transformed = source.replace(/\bexport\s+function\s+activate\s*\(/u, "globalThis.__pluginActivate = function activate(");
  if (transformed === source || /\bexport\b/u.test(transformed)) {
    throw new Error("Plugin entry may only export activate(context).");
  }
  return transformed;
}

function normalizeStrategy(candidate: unknown, pluginId: string): LoadedStrategy {
  if (!candidate || typeof candidate !== "object") throw new Error("Plugin strategy definition is invalid.");
  const strategy = candidate as Partial<PluginStrategyRuntimeDescriptor> & { run?: unknown };
  if (
    typeof strategy.key !== "string" || !strategy.key.startsWith(`${pluginId}:`) ||
    typeof strategy.name !== "string" || typeof strategy.version !== "string" || typeof strategy.description !== "string" ||
    !Array.isArray(strategy.supportedMarkets) || !Array.isArray(strategy.supportedTimeframes) ||
    !Array.isArray(strategy.parameterSchema) || typeof strategy.run !== "function"
  ) {
    throw new Error("Plugin strategy definition is invalid.");
  }

  const descriptor: PluginStrategyRuntimeDescriptor = {
    kind: "strategy",
    pluginId,
    key: strategy.key,
    name: strategy.name.slice(0, 120),
    version: strategy.version.slice(0, 40),
    description: strategy.description.slice(0, 800),
    supportedMarkets: sanitizeMarkets(strategy.supportedMarkets),
    supportedTimeframes: sanitizeTimeframes(strategy.supportedTimeframes),
    parameterSchema: sanitizeParameters(strategy.parameterSchema),
  };
  return { descriptor, run: strategy.run as (input: StrategyInput) => unknown };
}

function sanitizeMarkets(value: readonly unknown[]): Market[] {
  const allowed = new Set<Market>(["US", "HK", "CN"]);
  const values = value.filter((item): item is Market => typeof item === "string" && allowed.has(item as Market));
  if (values.length === 0) throw new Error("Plugin strategy must declare supported markets.");
  return [...new Set(values)];
}

function sanitizeTimeframes(value: readonly unknown[]): Timeframe[] {
  const allowed = new Set<Timeframe>(["realtime", "1m", "5m", "15m", "30m", "1h", "1d", "1w"]);
  const values = value.filter((item): item is Timeframe => typeof item === "string" && allowed.has(item as Timeframe));
  if (values.length === 0) throw new Error("Plugin strategy must declare supported timeframes.");
  return [...new Set(values)];
}

function sanitizeParameters(value: readonly unknown[]): StrategyParameterDefinition[] {
  if (value.length > 32) throw new Error("Plugin strategy declares too many parameters.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Plugin parameter definition is invalid.");
    const parameter = item as Partial<StrategyParameterDefinition>;
    if (
      typeof parameter.key !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(parameter.key) ||
      typeof parameter.label !== "string" ||
      (parameter.type !== "number" && parameter.type !== "boolean" && parameter.type !== "select") ||
      (typeof parameter.defaultValue !== "number" && typeof parameter.defaultValue !== "boolean" && typeof parameter.defaultValue !== "string")
    ) throw new Error("Plugin parameter definition is invalid.");
    return {
      key: parameter.key,
      label: parameter.label.slice(0, 120),
      type: parameter.type,
      defaultValue: parameter.defaultValue,
      ...(typeof parameter.description === "string" ? { description: parameter.description.slice(0, 300) } : {}),
      ...(Array.isArray(parameter.options) ? { options: parameter.options.slice(0, 32).flatMap((option) => option && typeof option.label === "string" && typeof option.value === "string" ? [{ label: option.label.slice(0, 120), value: option.value.slice(0, 120) }] : []) } : {}),
    };
  });
}

function sanitizeStrategyInput(value: StrategyInput): StrategyInput {
  if (!value || !Array.isArray(value.bars) || value.bars.length > maxBars) throw new Error("Plugin strategy input exceeds the runtime limit.");
  const bars = value.bars.map((bar) => {
    if (![bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)) throw new Error("Plugin strategy input contains invalid bars.");
    return { timestamp: bar.timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
  });
  return { ...value, bars, parameters: sanitizeJsonRecord(value.parameters) };
}

function sanitizeStrategyOutput(value: unknown, descriptor: PluginStrategyRuntimeDescriptor, input: StrategyInput): StrategyOutput {
  if (!value || typeof value !== "object" || !isJsonValue(value)) throw new Error("Plugin strategy returned invalid output.");
  const encoded = JSON.stringify(value);
  if (encoded.length > maxOutputBytes) throw new Error("Plugin strategy output exceeds the runtime limit.");
  const output = JSON.parse(encoded) as Partial<StrategyOutput>;
  if (!Array.isArray(output.signals) || !Array.isArray(output.overlays) || !output.render || typeof output.render !== "object" || !Array.isArray(output.logs) || !Array.isArray(output.alerts) || !output.metrics || typeof output.metrics !== "object") {
    throw new Error("Plugin strategy returned an incomplete output.");
  }
  return {
    signals: output.signals,
    overlays: output.overlays,
    render: { ...output.render, strategyId: descriptor.key, strategyName: descriptor.name, enabled: input.enabled !== false, zIndex: Number.isFinite(output.render.zIndex) ? output.render.zIndex : 20, elements: output.render.elements ?? output.overlays },
    metrics: output.metrics as Record<string, number>,
    logs: output.logs.filter((item): item is string => typeof item === "string").slice(0, 128),
    alerts: output.alerts.filter((item): item is string => typeof item === "string").slice(0, 128),
  } as StrategyOutput;
}

function sanitizeJsonRecord(value: Record<string, unknown>) {
  if (!value || typeof value !== "object" || !isJsonValue(value)) throw new Error("Plugin strategy parameters are invalid.");
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10_000 && value.every(isJsonValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).every(isJsonValue);
  return false;
}

function createStrategyId(pluginId: string, key: string) { return `${pluginId}:${key}`; }
function isPromiseLike(value: unknown): value is PromiseLike<unknown> { return Boolean(value && typeof (value as { then?: unknown }).then === "function"); }
function getRequestId(value: unknown) { return value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : null; }
function sanitizeError(error: unknown) { return (error instanceof Error && error.message.trim() ? error.message : "Plugin runtime failed.").replace(/\s+/gu, " ").slice(0, 800); }
function post(response: PluginRuntimeHostResponse) { process.parentPort?.postMessage(response); }
