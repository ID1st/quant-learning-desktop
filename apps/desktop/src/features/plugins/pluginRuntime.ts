import type { StrategyDefinition } from "@quant/strategy-engine";
import type { ChartIndicatorDefinition } from "../chartIndicators/chartIndicators.ts";
import type { PluginRuntimeModule } from "../../electron/pluginManager.ts";

export interface PluginRuntimeLogEntry {
  readonly pluginId: string;
  readonly message: string;
}

export interface PluginRuntimeFailure {
  readonly pluginId: string;
  readonly message: string;
}

export interface PluginRuntimeActivationResult {
  readonly strategies: readonly StrategyDefinition[];
  readonly indicators: readonly ChartIndicatorDefinition[];
  readonly logs: readonly PluginRuntimeLogEntry[];
  readonly failures: readonly PluginRuntimeFailure[];
}

export interface PluginRuntimeActivationContext {
  registerStrategy(strategy: unknown): void;
  registerIndicator(indicator: unknown): void;
  log(message: string): void;
}

export type PluginModuleImporter = (source: string) => Promise<unknown>;

export interface PluginRuntimeOptions {
  readonly onRuntimeFailure?: (failure: PluginRuntimeFailure) => void | Promise<void>;
}

export async function activatePluginRuntimeModules(
  modules: readonly PluginRuntimeModule[],
  importer: PluginModuleImporter = importRuntimeModule,
  options: PluginRuntimeOptions = {},
): Promise<PluginRuntimeActivationResult> {
  const strategies = new Map<string, StrategyDefinition>();
  const indicators = new Map<string, ChartIndicatorDefinition>();
  const logs: PluginRuntimeLogEntry[] = [];
  const failures: PluginRuntimeFailure[] = [];

  for (const module of modules) {
    const pluginId = module.plugin.manifest.id;
    try {
      const runtimeModule = await importer(module.source);
      const activate = getActivateFunction(runtimeModule);
      if (!activate) {
        throw new Error("Plugin entry must export activate(context).");
      }

      await activate({
        registerStrategy(candidate) {
          const strategy = normalizePluginStrategy(candidate, pluginId, options);
          if (strategies.has(strategy.key)) {
            throw new Error(`Duplicate plugin strategy key: ${strategy.key}`);
          }
          strategies.set(strategy.key, strategy);
        },
        registerIndicator(candidate) {
          const indicator = normalizePluginIndicator(candidate, pluginId);
          if (indicators.has(indicator.id)) {
            throw new Error(`Duplicate plugin indicator id: ${indicator.id}`);
          }
          indicators.set(indicator.id, indicator);
        },
        log(message) {
          const normalized = typeof message === "string" ? message.trim() : "";
          if (normalized) {
            logs.push({ pluginId, message: normalized.slice(0, 800) });
          }
        },
      } satisfies PluginRuntimeActivationContext);
    } catch (error) {
      const failure = { pluginId, message: getErrorMessage(error) };
      failures.push(failure);
      await options.onRuntimeFailure?.(failure);
    }
  }

  return {
    strategies: Array.from(strategies.values()),
    indicators: Array.from(indicators.values()),
    logs,
    failures,
  };
}

async function importRuntimeModule(source: string) {
  const encoded = encodeRuntimeModule(source);
  return import(/* @vite-ignore */ `data:text/javascript;base64,${encoded}`);
}

function encodeRuntimeModule(source: string) {
  const bytes = new TextEncoder().encode(source);
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function getActivateFunction(value: unknown): ((context: PluginRuntimeActivationContext) => unknown) | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { activate?: unknown; default?: unknown };
  const activate = typeof candidate.activate === "function" ? candidate.activate : candidate.default;
  return typeof activate === "function" ? (activate as (context: PluginRuntimeActivationContext) => unknown) : null;
}

function normalizePluginStrategy(candidate: unknown, pluginId: string, options: PluginRuntimeOptions): StrategyDefinition {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Plugin strategy definition is invalid.");
  }

  const strategy = candidate as Partial<StrategyDefinition>;
  const keyPrefix = `${pluginId}:`;
  if (
    typeof strategy.key !== "string" ||
    !strategy.key.startsWith(keyPrefix) ||
    typeof strategy.name !== "string" ||
    typeof strategy.version !== "string" ||
    typeof strategy.description !== "string" ||
    typeof strategy.run !== "function" ||
    !Array.isArray(strategy.supportedMarkets) ||
    !Array.isArray(strategy.supportedTimeframes) ||
    !Array.isArray(strategy.parameterSchema)
  ) {
    throw new Error("Plugin strategy definition is invalid.");
  }

  const sourceStrategy = strategy as StrategyDefinition;
  return {
    ...sourceStrategy,
    sourceType: "plugin",
    sourceFile: pluginId,
    run(input) {
      try {
        return sourceStrategy.run(input);
      } catch (error) {
        void options.onRuntimeFailure?.({ pluginId, message: getErrorMessage(error) });
        throw error;
      }
    },
  };
}

function normalizePluginIndicator(candidate: unknown, pluginId: string): ChartIndicatorDefinition {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Plugin indicator definition is invalid.");
  }

  const indicator = candidate as Partial<ChartIndicatorDefinition>;
  if (
    typeof indicator.id !== "string" ||
    !indicator.id.startsWith(`${pluginId}:`) ||
    typeof indicator.name !== "string" ||
    !Array.isArray(indicator.parameters) ||
    typeof indicator.evaluate !== "function"
  ) {
    throw new Error("Plugin indicator definition is invalid.");
  }

  return indicator as ChartIndicatorDefinition;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "插件运行失败。";
}
