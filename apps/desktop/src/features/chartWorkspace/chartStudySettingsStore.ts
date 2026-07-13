import { create } from "zustand";
import { defaultChartIndicatorSettings, sanitizeChartIndicatorSettings, type ChartIndicatorSettings } from "../chartIndicators/chartIndicators.ts";
import { appLocalDatabase, type LocalDatabase, type LocalDatabaseDriver } from "../persistence/localDatabase.ts";
import type { ChartStrategyWorkspaceState } from "../strategies/chartStrategyRuntime.ts";

const collection = "chart-study-settings";
const storageVersion = 2;
const legacyWorkspacePreferencesKey = "quant-learning.chart-workspace-preferences";

export interface ChartStudyStrategyDefinition {
  readonly key: string;
  readonly parameterSchema: readonly { readonly key: string; readonly defaultValue: unknown }[];
}

interface StoredChartStudySettings {
  readonly strategies: Record<string, ChartStrategyWorkspaceState>;
  readonly indicators: ChartIndicatorSettings;
}

export interface ChartStudySettingsStore {
  strategies: Record<string, ChartStrategyWorkspaceState>;
  indicators: ChartIndicatorSettings;
  initializeStrategies(strategies: readonly ChartStudyStrategyDefinition[]): void;
  updateStrategy(strategyKey: string, update: (current: ChartStrategyWorkspaceState) => ChartStrategyWorkspaceState): void;
  updateIndicators(update: (current: ChartIndicatorSettings) => ChartIndicatorSettings): void;
}

export interface ChartStudySettingsStoreOptions {
  readonly database?: LocalDatabase;
  readonly legacyStorage?: Pick<LocalDatabaseDriver, "getItem">;
}

export function createChartStudySettingsStore(options: ChartStudySettingsStoreOptions = {}) {
  const database = options.database ?? appLocalDatabase;
  const initial = readInitialSettings(database, options.legacyStorage ?? getLegacyStorage());

  return create<ChartStudySettingsStore>((set, get) => ({
    strategies: initial.strategies,
    indicators: initial.indicators,
    initializeStrategies(definitions) {
      const strategies = mergeStrategySettings(get().strategies, definitions);
      if (strategies === get().strategies) return;
      set({ strategies });
      writeSettings(database, { strategies, indicators: get().indicators });
    },
    updateStrategy(strategyKey, update) {
      const current = get().strategies[strategyKey];
      if (!current) return;
      const next = update(current);
      const strategies = { ...get().strategies, [strategyKey]: sanitizeStrategyState(next, current) };
      set({ strategies });
      writeSettings(database, { strategies, indicators: get().indicators });
    },
    updateIndicators(update) {
      const indicators = sanitizeIndicators(update(get().indicators));
      set({ indicators });
      writeSettings(database, { strategies: get().strategies, indicators });
    },
  }));
}

function getLegacyStorage(): Pick<LocalDatabaseDriver, "getItem"> | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function readInitialSettings(database: LocalDatabase, legacyStorage?: Pick<LocalDatabaseDriver, "getItem">): StoredChartStudySettings {
  const stored = database.readDocument<StoredChartStudySettings | null>(collection, {
    version: storageVersion,
    fallback: null,
    sanitize: sanitizeStoredSettings,
  });
  if (stored) return stored;

  const legacy = readLegacySettings(legacyStorage);
  if (legacy) {
    writeSettings(database, legacy);
    return legacy;
  }

  return { strategies: {}, indicators: defaultChartIndicatorSettings };
}

function readLegacySettings(legacyStorage?: Pick<LocalDatabaseDriver, "getItem">): StoredChartStudySettings | null {
  const raw = legacyStorage?.getItem(legacyWorkspacePreferencesKey);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as { strategies?: unknown; indicators?: unknown };
    const strategies = sanitizeStrategies(value.strategies);
    const indicators = sanitizeIndicators(value.indicators);
    return { strategies, indicators };
  } catch {
    return null;
  }
}

function writeSettings(database: LocalDatabase, settings: StoredChartStudySettings) {
  database.writeDocument(collection, storageVersion, settings);
}

function sanitizeStoredSettings(value: unknown): StoredChartStudySettings | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as { strategies?: unknown; indicators?: unknown };
  return {
    strategies: sanitizeStrategies(parsed.strategies),
    indicators: sanitizeIndicators(parsed.indicators),
  };
}

function sanitizeStrategies(value: unknown): Record<string, ChartStrategyWorkspaceState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, state]) => {
      if (!key || !state || typeof state !== "object" || Array.isArray(state)) return [];
      const parsed = state as Partial<ChartStrategyWorkspaceState>;
      if (!parsed.parameters || typeof parsed.parameters !== "object" || Array.isArray(parsed.parameters)) return [];
      return [[key, {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
        showLayer: typeof parsed.showLayer === "boolean" ? parsed.showLayer : true,
        parameters: { ...parsed.parameters },
      }]];
    }),
  );
}

function mergeStrategySettings(
  current: Record<string, ChartStrategyWorkspaceState>,
  definitions: readonly ChartStudyStrategyDefinition[],
) {
  let changed = false;
  const strategies = { ...current };

  definitions.forEach((definition, index) => {
    const fallback = createDefaultStrategyState(definition, index);
    const existing = current[definition.key];
    const next = existing ? normalizeStrategyForDefinition(existing, definition, fallback) : fallback;
    if (!existing || !isSameStrategyState(existing, next)) changed = true;
    strategies[definition.key] = next;
  });

  return changed ? strategies : current;
}

function createDefaultStrategyState(definition: ChartStudyStrategyDefinition, index: number): ChartStrategyWorkspaceState {
  return {
    enabled: index === 0,
    showLayer: true,
    parameters: Object.fromEntries(definition.parameterSchema.map((parameter) => [parameter.key, parameter.defaultValue])),
  };
}

function normalizeStrategyForDefinition(
  state: ChartStrategyWorkspaceState,
  definition: ChartStudyStrategyDefinition,
  fallback: ChartStrategyWorkspaceState,
): ChartStrategyWorkspaceState {
  const needsUtorbVisualMigration = definition.key === "utorb" && !("showTargetLabels" in state.parameters);

  return {
    enabled: state.enabled,
    showLayer: state.showLayer,
    parameters: Object.fromEntries(
      definition.parameterSchema.map((parameter) => [
        parameter.key,
        needsUtorbVisualMigration && parameter.key === "showVolumeProfile"
          ? false
          : state.parameters[parameter.key] ?? fallback.parameters[parameter.key],
      ]),
    ),
  };
}

function sanitizeStrategyState(value: ChartStrategyWorkspaceState, fallback: ChartStrategyWorkspaceState): ChartStrategyWorkspaceState {
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : fallback.enabled,
    showLayer: typeof value.showLayer === "boolean" ? value.showLayer : fallback.showLayer,
    parameters: value.parameters && typeof value.parameters === "object" ? { ...value.parameters } : fallback.parameters,
  };
}

function isSameStrategyState(left: ChartStrategyWorkspaceState, right: ChartStrategyWorkspaceState) {
  return left.enabled === right.enabled &&
    left.showLayer === right.showLayer &&
    JSON.stringify(left.parameters) === JSON.stringify(right.parameters);
}

function sanitizeIndicators(value: unknown): ChartIndicatorSettings {
  return sanitizeChartIndicatorSettings(value);
}

export const useChartStudySettingsStore = createChartStudySettingsStore();
