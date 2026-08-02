import { useEffect, useMemo, useState } from "react";
import {
  createEmptyStrategyRegistry,
  createRunnableUserStrategyDefinition,
  createUserStrategyDraftDefinition,
  preflightPineStrategySource,
  runStrategyBacktest,
  runRegisteredStrategy,
  type BacktestSettings,
  type StrategyParameterDefinition,
} from "@quant/strategy-engine";
import { formatStrategyDisplayName } from "../features/strategies/chartStrategyRuntime";
import { useUserStrategyDraftStore } from "../features/strategies/userStrategyDraftStore";
import { usePluginRuntimeStore } from "../features/plugins/pluginRuntimeStore";
import { useChartStudySettingsStore } from "../features/chartWorkspace/chartStudySettingsStore";
import {
  builtInChartIndicatorDefinitions,
  getIndicatorInstance,
} from "../features/chartIndicators/chartIndicators";
import { useAppStore } from "../state/appStore";
import { useToastStore } from "../features/feedback/toastStore";
import { marketBarsToStrategyBars } from "../features/marketData/chartBarAdapter";
import { getMarketBarCacheRepository } from "../features/marketData/marketBarCacheClient";
import type { MarketBarCacheMetadata } from "../features/marketData/marketBarCacheService";
import {
  deleteStrategyBacktestRun,
  readStrategyBacktestRuns,
  saveStrategyBacktestRun,
  type StrategyBacktestRun,
} from "../features/strategies/backtestRunStore";

import {
  type StrategyFilter,
  presetRegistry,
  strategyPreviewSymbol,
  strategyPreviewTimeframe,
  type BacktestContext,
  defaultBacktestSettings,
  samplePineSource,
  coerceParameterValue,
  createBacktestContextId,
  formatBacktestTimeframe,
} from "./strategyManagementModel";

import { StrategyManagementView } from "./StrategyManagementView";

export function useStrategyManagementController() {
  const navigate = useAppStore((state) => state.navigate);
  const pluginStrategies = usePluginRuntimeStore((state) => state.strategies);
  const refreshPluginRuntime = usePluginRuntimeStore((state) => state.refresh);
  useEffect(() => {
    void refreshPluginRuntime();
  }, [refreshPluginRuntime]);
  const strategies = useMemo(
    () => [...presetRegistry.list(), ...pluginStrategies],
    [pluginStrategies],
  );
  const strategyRegistry = useMemo(() => {
    const nextRegistry = createEmptyStrategyRegistry();
    strategies.forEach((strategy) => nextRegistry.register(strategy));
    return nextRegistry;
  }, [strategies]);
  const studyStrategySettings = useChartStudySettingsStore((state) => state.strategies);
  const studyIndicatorSettings = useChartStudySettingsStore((state) => state.indicators);
  const initializeStudyStrategies = useChartStudySettingsStore(
    (state) => state.initializeStrategies,
  );
  const updateStudyStrategy = useChartStudySettingsStore((state) => state.updateStrategy);
  const enabledIndicatorNames = builtInChartIndicatorDefinitions
    .filter(
      (definition) =>
        getIndicatorInstance(studyIndicatorSettings, definition.id, definition).enabled,
    )
    .map((definition) => definition.name);
  useEffect(() => {
    initializeStudyStrategies(strategies);
  }, [initializeStudyStrategies, strategies]);
  const [selectedKey, setSelectedKey] = useState(strategies[0]?.key ?? "");
  const [filter, setFilter] = useState<StrategyFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [pineSourceDraft, setPineSourceDraft] = useState(samplePineSource);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const importedDrafts = useUserStrategyDraftStore((state) => state.drafts);
  const selectedDraftId = useUserStrategyDraftStore((state) => state.selectedDraftId);
  const addImportedDraft = useUserStrategyDraftStore((state) => state.addDraft);
  const duplicateImportedDraft = useUserStrategyDraftStore((state) => state.duplicateDraft);
  const updateDraftMeta = useUserStrategyDraftStore((state) => state.updateDraftMeta);
  const updateDraftParameter = useUserStrategyDraftStore((state) => state.updateDraftParameter);
  const deleteImportedDraft = useUserStrategyDraftStore((state) => state.deleteDraft);
  const setSelectedDraftId = useUserStrategyDraftStore((state) => state.setSelectedDraftId);
  const pushToast = useToastStore((state) => state.push);
  const [isBacktestDialogOpen, setIsBacktestDialogOpen] = useState(false);
  const [backtestContextRevision, setBacktestContextRevision] = useState(0);
  const [marketCacheEntries, setMarketCacheEntries] = useState<MarketBarCacheMetadata[]>([]);
  const [strategyPreviewBars, setStrategyPreviewBars] = useState<
    ReturnType<typeof marketBarsToStrategyBars>
  >([]);
  const [selectedBacktestContextId, setSelectedBacktestContextId] = useState("");
  const [backtestSettings, setBacktestSettings] =
    useState<BacktestSettings>(defaultBacktestSettings);
  const [backtestRuns, setBacktestRuns] = useState<StrategyBacktestRun[]>(() =>
    readStrategyBacktestRuns(),
  );
  const [selectedBacktestRunId, setSelectedBacktestRunId] = useState<string | null>(
    () => readStrategyBacktestRuns()[0]?.id ?? null,
  );
  const selectedStrategy =
    strategies.find((strategy) => strategy.key === selectedKey) ?? strategies[0];
  const enabledCount = strategies.filter(
    (strategy) => studyStrategySettings[strategy.key]?.enabled,
  ).length;
  const userDraftReadyCount = importedDrafts.filter(
    (draft) => draft.definition.translation.status === "ready",
  ).length;
  const userDraftReviewCount = importedDrafts.filter(
    (draft) => draft.definition.translation.status === "manual-review",
  ).length;
  useEffect(() => {
    let cancelled = false;
    void getMarketBarCacheRepository()
      .summary()
      .then((summary) => {
        if (!cancelled) {
          setMarketCacheEntries(summary.entries);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarketCacheEntries([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [backtestContextRevision]);
  const availableBacktestContexts = useMemo<BacktestContext[]>(() => {
    if (!selectedStrategy) {
      return [];
    }

    return marketCacheEntries
      .filter(
        (entry) =>
          entry.barCount >= 2 &&
          selectedStrategy.supportedMarkets.includes(entry.market) &&
          selectedStrategy.supportedTimeframes.includes(entry.timeframe),
      )
      .map((entry) => ({
        id: createBacktestContextId(entry),
        symbol: entry.symbol,
        market: entry.market,
        timeframe: entry.timeframe,
        barCount: entry.barCount,
      }))
      .sort((left, right) => right.barCount - left.barCount);
  }, [marketCacheEntries, selectedStrategy]);
  const selectedBacktestContext =
    availableBacktestContexts.find((item) => item.id === selectedBacktestContextId) ??
    availableBacktestContexts[0];
  const selectedBacktestRun =
    backtestRuns.find((run) => run.id === selectedBacktestRunId) ?? backtestRuns[0] ?? null;
  useEffect(() => {
    setSelectedBacktestContextId((current) =>
      availableBacktestContexts.some((context) => context.id === current)
        ? current
        : (availableBacktestContexts[0]?.id ?? ""),
    );
  }, [availableBacktestContexts]);
  useEffect(() => {
    let cancelled = false;
    void getMarketBarCacheRepository()
      .read({
        symbol: strategyPreviewSymbol.symbol,
        market: strategyPreviewSymbol.market,
        timeframe: strategyPreviewTimeframe,
      })
      .then((bars) => {
        if (!cancelled) {
          setStrategyPreviewBars(marketBarsToStrategyBars(bars));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStrategyPreviewBars([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const strategyRuns = useMemo(
    () =>
      strategies.map((strategy) => {
        const result = runRegisteredStrategy(strategyRegistry, {
          strategyKey: strategy.key,
          symbol: strategyPreviewSymbol.symbol,
          market: strategyPreviewSymbol.market,
          timeframe: strategyPreviewTimeframe,
          bars: strategyPreviewBars,
          runMode: "backtest",
          enabled: studyStrategySettings[strategy.key]?.enabled ?? false,
          parameters: studyStrategySettings[strategy.key]?.parameters,
        });

        return {
          strategy,
          status: studyStrategySettings[strategy.key]?.enabled ? "enabled" : "disabled",
          result,
        };
      }),
    [strategies, strategyPreviewBars, strategyRegistry, studyStrategySettings],
  );
  const totalSignalCount = strategyRuns.reduce(
    (total, item) => total + item.result.output.signals.length,
    0,
  );
  const totalLayerElementCount = strategyRuns.reduce(
    (total, item) => total + item.result.output.render.elements.length,
    0,
  );
  const pinePreflight = useMemo(
    () =>
      preflightPineStrategySource({ fileName: "user-strategy.pine", sourceText: pineSourceDraft }),
    [pineSourceDraft],
  );
  const userStrategyDraft = useMemo(
    () =>
      createUserStrategyDraftDefinition({
        fileName: "user-strategy.pine",
        sourceText: pineSourceDraft,
      }),
    [pineSourceDraft],
  );
  const selectedDraft =
    importedDrafts.find((draft) => draft.id === selectedDraftId) ?? importedDrafts[0] ?? null;
  const selectedDraftRuntimePreview = useMemo(() => {
    if (!selectedDraft) {
      return null;
    }

    const runnable = createRunnableUserStrategyDefinition(selectedDraft.definition);
    if (!runnable.ok) {
      return { runnable, result: null };
    }

    const draftRegistry = createEmptyStrategyRegistry();
    draftRegistry.register(runnable.strategy);

    return {
      runnable,
      result: runRegisteredStrategy(draftRegistry, {
        strategyKey: runnable.strategy.key,
        symbol: strategyPreviewSymbol.symbol,
        market: strategyPreviewSymbol.market,
        timeframe: strategyPreviewTimeframe,
        bars: strategyPreviewBars,
        runMode: "backtest",
        enabled: true,
      }),
    };
  }, [selectedDraft, strategyPreviewBars]);
  const filteredStrategies = strategies.filter((strategy) => {
    const status = studyStrategySettings[strategy.key]?.enabled ? "enabled" : "disabled";
    const normalizedKeyword = keyword.trim().toLowerCase();
    const matchesFilter = filter === "all" || status === filter;
    const matchesKeyword =
      normalizedKeyword.length === 0 ||
      strategy.name.toLowerCase().includes(normalizedKeyword) ||
      strategy.key.toLowerCase().includes(normalizedKeyword) ||
      (strategy.sourceFile?.toLowerCase().includes(normalizedKeyword) ?? false);

    return matchesFilter && matchesKeyword;
  });
  const runResult = selectedStrategy
    ? runRegisteredStrategy(strategyRegistry, {
        strategyKey: selectedStrategy.key,
        symbol: strategyPreviewSymbol.symbol,
        market: strategyPreviewSymbol.market,
        timeframe: strategyPreviewTimeframe,
        bars: strategyPreviewBars,
        runMode: "backtest",
        enabled: studyStrategySettings[selectedStrategy.key]?.enabled ?? false,
        parameters: studyStrategySettings[selectedStrategy.key]?.parameters,
      })
    : null;

  const toggleStrategy = (strategyKey: string) => {
    const nextStatus = studyStrategySettings[strategyKey]?.enabled ? "disabled" : "enabled";
    const strategyName = formatStrategyDisplayName(
      strategies.find((strategy) => strategy.key === strategyKey)?.name ?? "策略",
    );
    updateStudyStrategy(strategyKey, (current) => ({
      ...current,
      enabled: nextStatus === "enabled",
    }));
    pushToast({
      tone: nextStatus === "enabled" ? "success" : "info",
      title: `${strategyName}已${nextStatus === "enabled" ? "启用" : "停用"}`,
      detail: nextStatus === "enabled" ? "策略会在超级图表中生成图层。" : "策略图层已停止输出。",
      durationMs: 2800,
    });
  };

  const updateStrategyParameter = (
    parameter: StrategyParameterDefinition,
    value: string | boolean,
  ) => {
    if (!selectedStrategy) return;
    updateStudyStrategy(selectedStrategy.key, (current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        [parameter.key]: coerceParameterValue(parameter, value),
      },
    }));
  };

  const openBacktestDialog = () => {
    setBacktestContextRevision((value) => value + 1);
    setIsBacktestDialogOpen(true);
  };

  const runSelectedStrategyBacktest = async () => {
    if (!selectedStrategy || !selectedBacktestContext) {
      pushToast({
        tone: "warning",
        title: "没有可用于回测的行情缓存",
        detail: "请先在超级图表加载该策略支持的标的和周期。",
        durationMs: 3200,
      });
      return;
    }

    try {
      const bars = marketBarsToStrategyBars(
        await getMarketBarCacheRepository().read({
          symbol: selectedBacktestContext.symbol,
          market: selectedBacktestContext.market,
          timeframe: selectedBacktestContext.timeframe,
        }),
      );
      if (bars.length < 2) {
        pushToast({
          tone: "warning",
          title: "行情数据不足",
          detail: "精简回测至少需要两根有效 K 线。",
          durationMs: 2800,
        });
        return;
      }

      const strategyRun = runRegisteredStrategy(strategyRegistry, {
        strategyKey: selectedStrategy.key,
        symbol: selectedBacktestContext.symbol,
        market: selectedBacktestContext.market,
        timeframe: selectedBacktestContext.timeframe,
        bars,
        runMode: "backtest",
        enabled: true,
        parameters: studyStrategySettings[selectedStrategy.key]?.parameters,
      });
      const result = runStrategyBacktest({
        bars,
        signals: strategyRun.output.signals,
        settings: backtestSettings,
      });
      const run: StrategyBacktestRun = {
        id:
          globalThis.crypto?.randomUUID?.() ??
          `backtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        strategyKey: selectedStrategy.key,
        strategyName: formatStrategyDisplayName(selectedStrategy.name),
        strategyVersion: selectedStrategy.version,
        symbol: selectedBacktestContext.symbol,
        market: selectedBacktestContext.market,
        timeframe: selectedBacktestContext.timeframe,
        parameters: strategyRun.input.parameters,
        result,
      };
      const nextRuns = saveStrategyBacktestRun(run);
      setBacktestRuns(nextRuns);
      setSelectedBacktestRunId(run.id);
      setIsBacktestDialogOpen(false);
      pushToast({
        tone: "success",
        title: `${formatStrategyDisplayName(selectedStrategy.name)} 回测完成`,
        detail: `${run.symbol} ${formatBacktestTimeframe(run.timeframe)}，生成 ${result.summary.tradeCount} 笔双向成交记录。`,
        durationMs: 3200,
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "回测未完成",
        detail: error instanceof Error ? error.message : "回测发生未知错误，请检查行情缓存后重试。",
        durationMs: 4200,
      });
    }
  };

  const removeBacktestRun = (runId: string) => {
    const nextRuns = deleteStrategyBacktestRun(runId);
    setBacktestRuns(nextRuns);
    setSelectedBacktestRunId(nextRuns[0]?.id ?? null);
  };

  const handleCreateDraft = () => {
    if (!pinePreflight.ok || !userStrategyDraft.ok || !pinePreflight.summary.canCreateDraft) {
      return;
    }

    addImportedDraft(userStrategyDraft.draft);
  };

  const handleDuplicateDraft = (draftId: string) => {
    duplicateImportedDraft(draftId);
  };

  const handleDeleteDraft = (draftId: string) => {
    deleteImportedDraft(draftId);
  };

  return {
    navigate,
    strategies,
    studyStrategySettings,
    enabledIndicatorNames,
    importedDrafts,
    updateDraftMeta,
    updateDraftParameter,
    setSelectedDraftId,
    selectedStrategy,
    enabledCount,
    userDraftReadyCount,
    userDraftReviewCount,
    availableBacktestContexts,
    selectedBacktestContext,
    selectedBacktestRun,
    totalSignalCount,
    totalLayerElementCount,
    pinePreflight,
    selectedDraft,
    selectedDraftRuntimePreview,
    filteredStrategies,
    runResult,
    toggleStrategy,
    updateStrategyParameter,
    openBacktestDialog,
    runSelectedStrategyBacktest,
    removeBacktestRun,
    handleCreateDraft,
    handleDuplicateDraft,
    handleDeleteDraft,
    setSelectedKey,
    filter,
    setFilter,
    keyword,
    setKeyword,
    pineSourceDraft,
    setPineSourceDraft,
    isImportDialogOpen,
    setIsImportDialogOpen,
    isBacktestDialogOpen,
    setIsBacktestDialogOpen,
    setSelectedBacktestContextId,
    backtestSettings,
    setBacktestSettings,
    backtestRuns,
    setSelectedBacktestRunId,
  };
}

export type StrategyManagementController = ReturnType<typeof useStrategyManagementController>;

export function StrategyManagementPage() {
  const controller = useStrategyManagementController();
  return <StrategyManagementView controller={controller} />;
}
