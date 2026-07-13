import { useEffect, useMemo, useState } from "react";
import {
  createEmptyStrategyRegistry,
  createPresetStrategyRegistry,
  createRunnableUserStrategyDefinition,
  createUserStrategyDraftDefinition,
  preflightPineStrategySource,
  runStrategyBacktest,
  runRegisteredStrategy,
  type BacktestSettings,
  type StrategyDefinition,
  type StrategyParameterDefinition,
} from "@quant/strategy-engine";
import type { Market, Timeframe } from "@quant/shared";
import { useUserStrategyDraftStore } from "../features/strategies/userStrategyDraftStore";
import { usePluginRuntimeStore } from "../features/plugins/pluginRuntimeStore";
import { useChartStudySettingsStore } from "../features/chartWorkspace/chartStudySettingsStore";
import { builtInChartIndicatorDefinitions, getIndicatorInstance, updateIndicatorInstance } from "../features/chartIndicators/chartIndicators";
import { useToastStore } from "../features/feedback/toastStore";
import { marketBarsToStrategyBars } from "../features/marketData/chartBarAdapter";
import { readMarketBarCache, readMarketBarCacheSummary } from "../features/marketData/marketBarCacheService";
import { deleteStrategyBacktestRun, readStrategyBacktestRuns, saveStrategyBacktestRun, type StrategyBacktestRun } from "../features/strategies/backtestRunStore";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileCode2,
  FilePlus2,
  Layers3,
  LineChart,
  ListChecks,
  Play,
  Power,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Trash2,
  X,
} from "lucide-react";

type StrategyFilter = "all" | "enabled" | "disabled";

const presetRegistry = createPresetStrategyRegistry();
const strategyPreviewSymbol = { symbol: "AAPL.US", displaySymbol: "AAPL", market: "US" as const };
const strategyPreviewTimeframe: Timeframe = "realtime";

interface BacktestContext {
  id: string;
  symbol: string;
  market: Market;
  timeframe: Timeframe;
  barCount: number;
}

const defaultBacktestSettings: BacktestSettings = {
  initialCapital: 100_000,
  feeRate: 0.0005,
  slippageRate: 0.0005,
  allowShort: true,
};

const samplePineSource = `//@version=5
indicator("用户策略示例", overlay=true)
length = input.int(20, "均线长度")
basis = ta.sma(close, length)
plot(basis)
alertcondition(close > basis, "上穿均线")
`;

function formatTranslationStatus(status: string) {
  if (status === "ready") {
    return "待转译";
  }

  if (status === "manual-review") {
    return "需人工复核";
  }

  return "暂不支持";
}

function formatDeclaration(type: string) {
  if (type === "strategy") {
    return "策略脚本";
  }

  if (type === "indicator") {
    return "指标脚本";
  }

  return "Pine 脚本";
}

function formatOverlay(overlay: boolean | null) {
  if (overlay === null) {
    return "未声明";
  }

  return overlay ? "是" : "否";
}

function coerceParameterValue(parameter: StrategyParameterDefinition, value: string | boolean) {
  if (parameter.type === "boolean") {
    return Boolean(value);
  }

  if (parameter.type === "number") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  return String(value);
}

function createBacktestContextId(context: Pick<BacktestContext, "symbol" | "market" | "timeframe">) {
  return `${context.market}:${context.symbol}:${context.timeframe}`;
}

function formatBacktestTimeframe(timeframe: Timeframe) {
  return timeframe === "realtime" ? "分时" : timeframe;
}

function formatBacktestNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function formatBacktestPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatBacktestDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date(value));
}

export function StrategyManagementPage() {
  const pluginStrategies = usePluginRuntimeStore((state) => state.strategies);
  const refreshPluginRuntime = usePluginRuntimeStore((state) => state.refresh);
  useEffect(() => {
    void refreshPluginRuntime();
  }, [refreshPluginRuntime]);
  const strategies = useMemo(() => [...presetRegistry.list(), ...pluginStrategies], [pluginStrategies]);
  const strategyRegistry = useMemo(() => {
    const nextRegistry = createEmptyStrategyRegistry();
    strategies.forEach((strategy) => nextRegistry.register(strategy));
    return nextRegistry;
  }, [strategies]);
  const studyStrategySettings = useChartStudySettingsStore((state) => state.strategies);
  const studyIndicatorSettings = useChartStudySettingsStore((state) => state.indicators);
  const initializeStudyStrategies = useChartStudySettingsStore((state) => state.initializeStrategies);
  const updateStudyStrategy = useChartStudySettingsStore((state) => state.updateStrategy);
  const updateStudyIndicators = useChartStudySettingsStore((state) => state.updateIndicators);
  const smaIndicator = getIndicatorInstance(studyIndicatorSettings, "sma", builtInChartIndicatorDefinitions[0]);
  const emaIndicator = getIndicatorInstance(studyIndicatorSettings, "ema", builtInChartIndicatorDefinitions[1]);
  const bollIndicator = getIndicatorInstance(studyIndicatorSettings, "boll", builtInChartIndicatorDefinitions[2]);
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
  const [selectedBacktestContextId, setSelectedBacktestContextId] = useState("");
  const [backtestSettings, setBacktestSettings] = useState<BacktestSettings>(defaultBacktestSettings);
  const [backtestRuns, setBacktestRuns] = useState<StrategyBacktestRun[]>(() => readStrategyBacktestRuns());
  const [selectedBacktestRunId, setSelectedBacktestRunId] = useState<string | null>(() => readStrategyBacktestRuns()[0]?.id ?? null);
  const selectedStrategy = strategies.find((strategy) => strategy.key === selectedKey) ?? strategies[0];
  const enabledCount = strategies.filter((strategy) => studyStrategySettings[strategy.key]?.enabled).length;
  const userDraftReadyCount = importedDrafts.filter((draft) => draft.definition.translation.status === "ready").length;
  const userDraftReviewCount = importedDrafts.filter((draft) => draft.definition.translation.status === "manual-review").length;
  const availableBacktestContexts = useMemo<BacktestContext[]>(() => {
    if (!selectedStrategy) {
      return [];
    }

    return readMarketBarCacheSummary().entries
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
  }, [backtestContextRevision, selectedStrategy]);
  const selectedBacktestContext = availableBacktestContexts.find((item) => item.id === selectedBacktestContextId) ?? availableBacktestContexts[0];
  const selectedBacktestRun = backtestRuns.find((run) => run.id === selectedBacktestRunId) ?? backtestRuns[0] ?? null;
  useEffect(() => {
    setSelectedBacktestContextId((current) =>
      availableBacktestContexts.some((context) => context.id === current) ? current : availableBacktestContexts[0]?.id ?? "",
    );
  }, [availableBacktestContexts]);
  const strategyPreviewBars = useMemo(
    () =>
      marketBarsToStrategyBars(
        readMarketBarCache({
          symbol: strategyPreviewSymbol.symbol,
          market: strategyPreviewSymbol.market,
          timeframe: strategyPreviewTimeframe,
        }),
      ),
    [],
  );
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
  const totalSignalCount = strategyRuns.reduce((total, item) => total + item.result.output.signals.length, 0);
  const totalLayerElementCount = strategyRuns.reduce((total, item) => total + item.result.output.render.elements.length, 0);
  const pinePreflight = useMemo(
    () => preflightPineStrategySource({ fileName: "user-strategy.pine", sourceText: pineSourceDraft }),
    [pineSourceDraft],
  );
  const userStrategyDraft = useMemo(
    () => createUserStrategyDraftDefinition({ fileName: "user-strategy.pine", sourceText: pineSourceDraft }),
    [pineSourceDraft],
  );
  const selectedDraft = importedDrafts.find((draft) => draft.id === selectedDraftId) ?? importedDrafts[0] ?? null;
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
    const strategyName = strategies.find((strategy) => strategy.key === strategyKey)?.name ?? "策略";
    updateStudyStrategy(strategyKey, (current) => ({ ...current, enabled: nextStatus === "enabled" }));
    pushToast({
      tone: nextStatus === "enabled" ? "success" : "info",
      title: `${strategyName}已${nextStatus === "enabled" ? "启用" : "停用"}`,
      detail: nextStatus === "enabled" ? "策略会在超级图表中生成图层。" : "策略图层已停止输出。",
      durationMs: 2800,
    });
  };

  const updateStrategyParameter = (parameter: StrategyParameterDefinition, value: string | boolean) => {
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

  const runSelectedStrategyBacktest = () => {
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
        readMarketBarCache({
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
        id: globalThis.crypto?.randomUUID?.() ?? `backtest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        strategyKey: selectedStrategy.key,
        strategyName: selectedStrategy.name,
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
        title: `${selectedStrategy.name} 回测完成`,
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

  return (
    <section className="strategy-page">
      <header className="module-header">
        <div className="strategy-page-heading">
        <p>策略管理</p>
        <h1>策略库与运行管理</h1>
        <span>集中管理预制策略、用户 Pine 草稿和后续插件策略。当前用户草稿仅进入管理与转译准备阶段，不执行用户代码。</span>
        </div>
        <div className="strategy-header-status" aria-label="策略概览">
          <span>预制 {strategies.length}</span>
          <span>启用 {enabledCount}</span>
          <span>草稿 {importedDrafts.length}</span>
        </div>
        <div className="strategy-header-actions">
          <button className="strategy-backtest-trigger" onClick={openBacktestDialog} type="button">
            <LineChart size={16} />
            精简回测
          </button>
          <button className="strategy-import-trigger" onClick={() => setIsImportDialogOpen(true)} type="button">
          <FilePlus2 size={16} />
          导入 Pine
          </button>
        </div>
      </header>

      {isBacktestDialogOpen && (
        <div className="strategy-import-backdrop" role="presentation" onClick={() => setIsBacktestDialogOpen(false)}>
          <section aria-label="精简回测配置" className="module-card strategy-import-dialog backtest-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="关闭精简回测" className="strategy-import-close" onClick={() => setIsBacktestDialogOpen(false)} type="button">
              <X size={16} />
            </button>
            <div className="module-card-header">
              <LineChart size={20} />
              <div>
                <h2>精简回测</h2>
                <p>策略信号在下一根 K 线开盘成交；买入做多、卖出做空，结束时按最后收盘价结算。</p>
              </div>
            </div>
            <div className="backtest-form-grid">
              <label>
                <span>行情缓存</span>
                <select onChange={(event) => setSelectedBacktestContextId(event.currentTarget.value)} value={selectedBacktestContext?.id ?? ""}>
                  {availableBacktestContexts.map((context) => (
                    <option key={context.id} value={context.id}>
                      {context.market} · {context.symbol} · {formatBacktestTimeframe(context.timeframe)} · {context.barCount} 根
                    </option>
                  ))}
                </select>
                <small>{availableBacktestContexts.length > 0 ? "仅使用本地已缓存的标准化行情，不触发新的数据请求。" : "当前策略没有可用缓存，请先在超级图表加载支持的标的和周期。"}</small>
              </label>
              <label>
                <span>初始资金</span>
                <input min="1" onChange={(event) => setBacktestSettings((current) => ({ ...current, initialCapital: Number(event.currentTarget.value) }))} type="number" value={backtestSettings.initialCapital} />
                <small>默认 100,000</small>
              </label>
              <label>
                <span>单边费率</span>
                <input min="0" onChange={(event) => setBacktestSettings((current) => ({ ...current, feeRate: Number(event.currentTarget.value) / 100 }))} step="0.001" type="number" value={(backtestSettings.feeRate ?? 0) * 100} />
                <small>百分比，例如 0.05</small>
              </label>
              <label>
                <span>单边滑点</span>
                <input min="0" onChange={(event) => setBacktestSettings((current) => ({ ...current, slippageRate: Number(event.currentTarget.value) / 100 }))} step="0.001" type="number" value={(backtestSettings.slippageRate ?? 0) * 100} />
                <small>百分比，例如 0.05</small>
              </label>
              <label className="backtest-switch">
                <span>允许做空</span>
                <input checked={backtestSettings.allowShort ?? true} onChange={(event) => setBacktestSettings((current) => ({ ...current, allowShort: event.currentTarget.checked }))} type="checkbox" />
                <small>关闭后，卖出信号仅用于平多。</small>
              </label>
            </div>
            <div className="backtest-dialog-footer">
              <button className="secondary-action" onClick={() => setIsBacktestDialogOpen(false)} type="button">取消</button>
              <button className="primary-auth-action" disabled={!selectedBacktestContext} onClick={runSelectedStrategyBacktest} type="button">
                <Play size={16} />
                运行回测
              </button>
            </div>
          </section>
        </div>
      )}

      <div className="strategy-summary-grid">
        <div className="module-card strategy-stat-card">
          <Activity size={20} />
          <span>预制策略</span>
          <strong>{strategies.length}</strong>
        </div>
        <div className="module-card strategy-stat-card">
          <Power size={20} />
          <span>已启用</span>
          <strong>{enabledCount}</strong>
        </div>
        <div className="module-card strategy-stat-card">
          <FilePlus2 size={20} />
          <span>用户草稿</span>
          <strong>{importedDrafts.length}</strong>
        </div>
        <div className="module-card strategy-stat-card">
          <Layers3 size={20} />
          <span>图层元素</span>
          <strong>{totalLayerElementCount}</strong>
        </div>
        <div className="module-card strategy-stat-card">
          <ShieldCheck size={20} />
          <span>样例信号</span>
          <strong>{totalSignalCount}</strong>
        </div>
      </div>

      {isImportDialogOpen && (
        <div className="strategy-import-backdrop" role="presentation" onClick={() => setIsImportDialogOpen(false)}>
          <section
            aria-label="导入 Pine 策略"
            className="module-card strategy-import-panel strategy-import-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button aria-label="关闭导入" className="strategy-import-close" onClick={() => setIsImportDialogOpen(false)} type="button">
              <X size={16} />
            </button>
        <div className="module-card-header">
          <FilePlus2 size={20} />
          <div>
            <h2>Pine 策略导入预检</h2>
            <p>先做源码结构检查和草稿登记，不进行 Pine 编译、不注册运行器、不执行用户代码。</p>
          </div>
        </div>

        <div className="strategy-source-groups">
          <span>预制策略：{strategies.length}</span>
          <span>用户策略草稿：{importedDrafts.length}</span>
          <span>插件策略：待接入</span>
          <span>待转译：{userDraftReadyCount}</span>
          <span>需复核：{userDraftReviewCount}</span>
        </div>

        <div className="strategy-import-grid">
          <label className="pine-source-editor">
            <span>Pine Script 源码</span>
            <textarea aria-label="Pine Script 源码" onChange={(event) => setPineSourceDraft(event.currentTarget.value)} spellCheck={false} value={pineSourceDraft} />
          </label>

          <div className={pinePreflight.ok ? "pine-preflight-result valid" : "pine-preflight-result invalid"}>
            {pinePreflight.ok ? (
              <>
                <CheckCircle2 size={20} />
                <strong>源码预检通过</strong>
                <span>{formatDeclaration(pinePreflight.summary.declaration)}</span>
                <dl>
                  <div>
                    <dt>名称</dt>
                    <dd>{pinePreflight.summary.title}</dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>{pinePreflight.summary.version ?? "-"}</dd>
                  </div>
                  <div>
                    <dt>输入</dt>
                    <dd>{pinePreflight.summary.inputCount}</dd>
                  </div>
                  <div>
                    <dt>绘图</dt>
                    <dd>{pinePreflight.summary.plotCount}</dd>
                  </div>
                  <div>
                    <dt>告警</dt>
                    <dd>{pinePreflight.summary.alertCount}</dd>
                  </div>
                  <div>
                    <dt>转译状态</dt>
                    <dd>{formatTranslationStatus(pinePreflight.summary.translationPlan.status)}</dd>
                  </div>
                </dl>
                {pinePreflight.summary.inputs.length > 0 && (
                  <div className="pine-input-draft-list">
                    {pinePreflight.summary.inputs.map((input) => (
                      <span key={input.key}>
                        {input.label}
                        <small>{input.type}</small>
                      </span>
                    ))}
                  </div>
                )}
                {pinePreflight.summary.warnings.length > 0 && (
                  <div className="pine-warning-list">
                    {pinePreflight.summary.warnings.map((warning) => (
                      <span key={warning}>{warning}</span>
                    ))}
                  </div>
                )}
                <button disabled={!pinePreflight.summary.canCreateDraft} onClick={handleCreateDraft} type="button">
                  {pinePreflight.summary.canCreateDraft ? "加入导入草稿" : "暂不能导入"}
                </button>
              </>
            ) : (
              <>
                <AlertTriangle size={20} />
                <strong>源码预检未通过</strong>
                <span>{pinePreflight.error.message}</span>
              </>
            )}
          </div>
        </div>

        <div className="strategy-subsection-title">
          <h3>用户策略草稿</h3>
          <span>仅保存草稿与转译元信息，当前不可直接运行。</span>
        </div>

        <div className="imported-draft-list">
          {importedDrafts.length > 0 ? (
            importedDrafts.map((draft) => (
              <button
                className={draft.id === selectedDraft?.id ? "imported-draft-row active" : "imported-draft-row"}
                key={draft.id}
                onClick={() => setSelectedDraftId(draft.id)}
                type="button"
              >
                <FileCode2 size={16} />
                <span>
                  <strong>{draft.definition.name}</strong>
                  <small>
                    {draft.definition.sourceFile} / Pine v{draft.definition.translation.ir.declaration.version ?? "-"} / {draft.definition.translation.ir.declaration.type}
                  </small>
                </span>
                <em>{formatTranslationStatus(draft.definition.translation.status)}</em>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="strategy-empty-state">暂无用户策略草稿。</div>
          )}
        </div>

        {selectedDraft && (
          <div className="draft-detail-panel">
            <div className="draft-detail-heading">
              <span>
                <strong>{selectedDraft.definition.name}</strong>
                <small>{selectedDraft.definition.translation.reasons[0]}</small>
              </span>
              <div className="draft-detail-actions">
                <button aria-label="复制草稿" onClick={() => handleDuplicateDraft(selectedDraft.id)} type="button">
                  <Copy size={15} />
                </button>
                <button aria-label="删除草稿" onClick={() => handleDeleteDraft(selectedDraft.id)} type="button">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="draft-edit-grid">
              <label>
                <span>草稿名称</span>
                <input
                  aria-label="草稿名称"
                  onChange={(event) =>
                    updateDraftMeta(selectedDraft.id, {
                      name: event.currentTarget.value,
                      description: selectedDraft.definition.description,
                    })
                  }
                  value={selectedDraft.definition.name}
                />
              </label>
              <label>
                <span>草稿描述</span>
                <textarea
                  aria-label="草稿描述"
                  onChange={(event) =>
                    updateDraftMeta(selectedDraft.id, {
                      name: selectedDraft.definition.name,
                      description: event.currentTarget.value,
                    })
                  }
                  value={selectedDraft.definition.description}
                />
              </label>
            </div>

            <div className="draft-detail-grid">
              <span>状态：{formatTranslationStatus(selectedDraft.definition.translation.status)}</span>
              <span>运行：{selectedDraft.definition.runnable ? "可运行" : "不可运行"}</span>
              <span>Overlay：{formatOverlay(selectedDraft.definition.translation.ir.declaration.overlay)}</span>
              <span>参数：{selectedDraft.definition.parameterSchema.length}</span>
              <span>绘图：{selectedDraft.definition.translation.ir.visuals.length}</span>
              <span>创建时间：{new Date(selectedDraft.createdAt).toLocaleString("zh-CN")}</span>
            </div>

            {selectedDraftRuntimePreview && (
              <div className={`draft-runtime-preview ${selectedDraftRuntimePreview.runnable.ok ? "ready" : "blocked"}`}>
                <div className="draft-runtime-preview-heading">
                  {selectedDraftRuntimePreview.runnable.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>
                    <strong>{selectedDraftRuntimePreview.runnable.ok ? "可生成运行草案" : "暂不可运行"}</strong>
                    <small>
                      {selectedDraftRuntimePreview.runnable.ok
                        ? "已通过 Pine 最小子集检查，可用样例 K 线试运行。"
                        : selectedDraftRuntimePreview.runnable.error.message}
                    </small>
                  </span>
                </div>

                {selectedDraftRuntimePreview.runnable.ok && selectedDraftRuntimePreview.result ? (
                  <>
                    <dl>
                      <div>
                        <dt>参数</dt>
                        <dd>{Object.keys(selectedDraftRuntimePreview.result.input.parameters).length}</dd>
                      </div>
                      <div>
                        <dt>信号</dt>
                        <dd>{selectedDraftRuntimePreview.result.output.signals.length}</dd>
                      </div>
                      <div>
                        <dt>图层</dt>
                        <dd>{selectedDraftRuntimePreview.result.output.render.elements.length}</dd>
                      </div>
                      <div>
                        <dt>告警</dt>
                        <dd>{selectedDraftRuntimePreview.result.output.alerts.length}</dd>
                      </div>
                    </dl>

                    <div className="draft-runtime-signal-list">
                      {selectedDraftRuntimePreview.result.output.signals.length > 0 ? (
                        selectedDraftRuntimePreview.result.output.signals.slice(0, 3).map((signal, index) => (
                          <span key={`${signal.timestamp}-${signal.type}-${index}`}>
                            {new Date(signal.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} / {signal.type} /{" "}
                            {signal.price === undefined ? "-" : signal.price.toFixed(2)}
                          </span>
                        ))
                      ) : (
                        <span>样例 K 线未触发信号。</span>
                      )}
                    </div>
                  </>
                ) : null}

                {!selectedDraftRuntimePreview.runnable.ok ? (
                  <div className="draft-runtime-error-list">
                    {selectedDraftRuntimePreview.runnable.error.details.map((detail) => (
                      <code key={detail}>{detail}</code>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="draft-parameter-schema-list">
              {selectedDraft.definition.parameterSchema.length > 0 ? (
                selectedDraft.definition.parameterSchema.map((parameter) => (
                  <label key={parameter.key}>
                    <span>
                      <strong>{parameter.label}</strong>
                      <small>{parameter.key} / {parameter.type}</small>
                    </span>
                    {parameter.type === "boolean" ? (
                      <input
                        checked={Boolean(parameter.defaultValue)}
                        onChange={(event) => updateDraftParameter(selectedDraft.id, parameter.key, event.currentTarget.checked)}
                        type="checkbox"
                      />
                    ) : parameter.type === "select" && parameter.options ? (
                      <select
                        onChange={(event) => updateDraftParameter(selectedDraft.id, parameter.key, coerceParameterValue(parameter, event.currentTarget.value))}
                        value={String(parameter.defaultValue)}
                      >
                        {parameter.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        onChange={(event) => updateDraftParameter(selectedDraft.id, parameter.key, coerceParameterValue(parameter, event.currentTarget.value))}
                        type="number"
                        value={String(parameter.defaultValue)}
                      />
                    )}
                  </label>
                ))
              ) : (
                <small>暂无参数 Schema。</small>
              )}
            </div>

            <div className="draft-ir-grid">
              <section>
                <h4>可视化声明</h4>
                {selectedDraft.definition.translation.ir.visuals.length > 0 ? (
                  selectedDraft.definition.translation.ir.visuals.map((visual, index) => (
                    <code key={`${visual.kind}-${index}`}>
                      {visual.kind}({visual.expression})
                    </code>
                  ))
                ) : (
                  <small>未发现可视化声明。</small>
                )}
              </section>
              <section>
                <h4>告警声明</h4>
                {selectedDraft.definition.translation.ir.alerts.length > 0 ? (
                  selectedDraft.definition.translation.ir.alerts.map((alert, index) => (
                    <code key={`${alert.title}-${index}`}>
                      {alert.title}: {alert.condition}
                    </code>
                  ))
                ) : (
                  <small>未发现告警声明。</small>
                )}
              </section>
              <section>
                <h4>不支持调用</h4>
                {selectedDraft.definition.translation.ir.unsupportedCalls.length > 0 ? (
                  selectedDraft.definition.translation.ir.unsupportedCalls.map((call) => <code key={call}>{call}</code>)
                ) : (
                  <small>当前草稿未发现阻断调用。</small>
                )}
              </section>
            </div>
          </div>
        )}
          </section>
        </div>
      )}

      <div className="strategy-workspace-grid">
        <aside className="module-card strategy-list-panel">
          <div className="module-card-header">
            <ListChecks size={20} />
            <div>
              <h2>预制策略列表</h2>
              <p>当前运行链路仅包含预制策略；用户草稿将在最小 Pine 子集转译完成后接入。</p>
            </div>
          </div>

          <div className="strategy-filter-bar">
            <label>
              <Search size={15} />
              <input
                onChange={(event) => setKeyword(event.currentTarget.value)}
                placeholder="搜索策略或源文件"
                type="search"
                value={keyword}
              />
            </label>
            <div aria-label="策略状态筛选" className="strategy-filter-tabs">
              {[
                { label: "全部", value: "all" },
                { label: "启用", value: "enabled" },
                { label: "停用", value: "disabled" },
              ].map((item) => (
                <button
                  className={filter === item.value ? "active" : ""}
                  key={item.value}
                  onClick={() => setFilter(item.value as StrategyFilter)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="strategy-list-group-label">预制策略</div>
          <div className="strategy-list">
            {filteredStrategies.map((strategy) => {
              const isSelected = strategy.key === selectedStrategy.key;
              const isEnabled = studyStrategySettings[strategy.key]?.enabled ?? false;

              return (
                <button className={isSelected ? "active" : ""} key={strategy.key} onClick={() => setSelectedKey(strategy.key)} type="button">
                  <span>
                    <strong>{strategy.name}</strong>
                    <small>{strategy.sourceFile}</small>
                  </span>
                  <em className={isEnabled ? "enabled" : "disabled"}>{isEnabled ? "启用" : "停用"}</em>
                </button>
              );
            })}
            {filteredStrategies.length === 0 && <div className="strategy-empty-state">没有匹配的策略。</div>}
          </div>

          <div className="strategy-list-group-label">用户策略草稿</div>
          <div className="strategy-mini-list">
            {importedDrafts.length > 0 ? (
              importedDrafts.map((draft) => (
                <button key={draft.id} onClick={() => setSelectedDraftId(draft.id)} type="button">
                  <span>{draft.definition.name}</span>
                  <em>{formatTranslationStatus(draft.definition.translation.status)}</em>
                </button>
              ))
            ) : (
              <span>暂无草稿</span>
            )}
          </div>

          <div className="strategy-list-group-label">插件策略</div>
          <div className="strategy-mini-list">
            <span>等待插件加载器接入</span>
          </div>
        </aside>

        <main className="module-card strategy-detail-panel">
          <div className="strategy-detail-header">
            <div>
              <p>{selectedStrategy.sourceType.toUpperCase()}</p>
              <h2>{selectedStrategy.name}</h2>
              <span>{selectedStrategy.description}</span>
            </div>
            <div className="strategy-detail-actions">
              <button className="strategy-backtest-trigger" onClick={openBacktestDialog} type="button">
                <LineChart size={16} />
                精简回测
              </button>
            <button
              className={studyStrategySettings[selectedStrategy.key]?.enabled ? "danger-action" : "primary-auth-action"}
              onClick={() => toggleStrategy(selectedStrategy.key)}
              type="button"
            >
              {studyStrategySettings[selectedStrategy.key]?.enabled ? "停用策略" : "启用策略"}
            </button>
            </div>
          </div>

          <div className="strategy-meta-grid">
            <span>版本：{selectedStrategy.version}</span>
            <span>市场：{selectedStrategy.supportedMarkets.join(" / ")}</span>
            <span>周期：{selectedStrategy.supportedTimeframes.join(" / ")}</span>
            <span>参数：{selectedStrategy.parameterSchema.length} 项</span>
            <span>来源：{selectedStrategy.sourceFile}</span>
            <span>类型：{selectedStrategy.sourceType}</span>
          </div>

          {selectedBacktestRun && (
            <section className="strategy-section backtest-result-panel">
              <div className="section-title">
                <LineChart size={18} />
                <div>
                  <h3>最近回测结果</h3>
                  <span>{selectedBacktestRun.strategyName} · {selectedBacktestRun.market} · {selectedBacktestRun.symbol} · {formatBacktestTimeframe(selectedBacktestRun.timeframe)} · {formatBacktestDate(selectedBacktestRun.createdAt)}</span>
                </div>
                <button aria-label="删除当前回测结果" className="icon-button" onClick={() => removeBacktestRun(selectedBacktestRun.id)} type="button">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="backtest-summary-grid">
                <div><span>最终资金</span><strong>{formatBacktestNumber(selectedBacktestRun.result.summary.finalCapital)}</strong></div>
                <div><span>总收益</span><strong className={selectedBacktestRun.result.summary.totalReturnPct >= 0 ? "positive" : "negative"}>{formatBacktestPercent(selectedBacktestRun.result.summary.totalReturnPct)}</strong></div>
                <div><span>最大回撤</span><strong className="negative">-{selectedBacktestRun.result.summary.maxDrawdownPct.toFixed(2)}%</strong></div>
                <div><span>胜率 / 交易</span><strong>{selectedBacktestRun.result.summary.winRate.toFixed(1)}% / {selectedBacktestRun.result.summary.tradeCount}</strong></div>
              </div>
              {selectedBacktestRun.result.warnings.length > 0 && (
                <div className="backtest-warning-list">
                  {selectedBacktestRun.result.warnings.map((warning) => <span key={warning}>{warning}</span>)}
                </div>
              )}
              <div className="backtest-trade-table-wrap">
                <table className="backtest-trade-table">
                  <thead><tr><th>方向</th><th>开仓</th><th>平仓</th><th>净收益</th></tr></thead>
                  <tbody>
                    {selectedBacktestRun.result.trades.slice(0, 8).map((trade) => (
                      <tr key={`${trade.entryTimestamp}-${trade.exitTimestamp}-${trade.direction}`}>
                        <td>{trade.direction === "long" ? "做多" : "做空"}</td>
                        <td>{trade.entryPrice.toFixed(2)}</td>
                        <td>{trade.exitPrice.toFixed(2)}</td>
                        <td className={trade.netPnl >= 0 ? "positive" : "negative"}>{formatBacktestNumber(trade.netPnl)}</td>
                      </tr>
                    ))}
                    {selectedBacktestRun.result.trades.length === 0 && <tr><td colSpan={4}>当前信号在所选数据中未形成可结算成交。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="strategy-section">
            <div className="section-title">
              <SlidersHorizontal size={18} />
              <h3>参数配置</h3>
            </div>
            <div className="parameter-grid">
              {selectedStrategy.parameterSchema.map((parameter) => {
                const value = studyStrategySettings[selectedStrategy.key]?.parameters[parameter.key] ?? parameter.defaultValue;
                return (
                  <label key={parameter.key}>
                    <span>{parameter.label}</span>
                    {parameter.type === "boolean" ? (
                      <input checked={Boolean(value)} onChange={(event) => updateStrategyParameter(parameter, event.currentTarget.checked)} type="checkbox" />
                    ) : parameter.type === "select" ? (
                      <select onChange={(event) => updateStrategyParameter(parameter, event.currentTarget.value)} value={String(value)}>
                        {(parameter.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : (
                      <input onChange={(event) => updateStrategyParameter(parameter, event.currentTarget.value)} type="number" value={String(value)} />
                    )}
                    <small>{parameter.description ?? `${parameter.type} / ${parameter.key}`}</small>
                  </label>
                );
              })}
            </div>
          </section>

          <section className="strategy-section">
            <div className="section-title">
              <LineChart size={18} />
              <h3>图表指标</h3>
            </div>
            <div className="parameter-grid">
              <label>
                <span>均线</span>
                <input
                  checked={smaIndicator.enabled}
                  onChange={(event) => updateStudyIndicators((current) => ({
                    ...current,
                    ...updateIndicatorInstance(current, "sma", (item) => ({ ...item, enabled: event.currentTarget.checked }), builtInChartIndicatorDefinitions[0]),
                  }))}
                  type="checkbox"
                />
                <small>与超级图表同步</small>
              </label>
              <label>
                <span>均线周期</span>
                <input
                  max="240"
                  min="2"
                  onChange={(event) => updateStudyIndicators((current) => ({
                    ...current,
                    ...updateIndicatorInstance(current, "sma", (item) => ({ ...item, parameters: { ...item.parameters, window: Number(event.currentTarget.value) || 9 } }), builtInChartIndicatorDefinitions[0]),
                  }))}
                  type="number"
                  value={Number(smaIndicator.parameters.window)}
                />
                <small>SMA 参数</small>
              </label>
              <label>
                <span>布林带</span>
                <input
                  checked={bollIndicator.enabled}
                  onChange={(event) => updateStudyIndicators((current) => ({
                    ...current,
                    ...updateIndicatorInstance(current, "boll", (item) => ({ ...item, enabled: event.currentTarget.checked }), builtInChartIndicatorDefinitions[2]),
                  }))}
                  type="checkbox"
                />
                <small>与超级图表同步</small>
              </label>
              <label>
                <span>布林周期</span>
                <input
                  max="240"
                  min="2"
                  onChange={(event) => updateStudyIndicators((current) => ({
                    ...current,
                    ...updateIndicatorInstance(current, "boll", (item) => ({ ...item, parameters: { ...item.parameters, window: Number(event.currentTarget.value) || 20 } }), builtInChartIndicatorDefinitions[2]),
                  }))}
                  type="number"
                  value={Number(bollIndicator.parameters.window)}
                />
                <small>布林带窗口</small>
              </label>
              <label>
                <span>布林倍数</span>
                <input
                  max="6"
                  min="0.1"
                  onChange={(event) => updateStudyIndicators((current) => ({
                    ...current,
                    ...updateIndicatorInstance(current, "boll", (item) => ({ ...item, parameters: { ...item.parameters, multiplier: Number(event.currentTarget.value) || 2 } }), builtInChartIndicatorDefinitions[2]),
                  }))}
                  step="0.1"
                  type="number"
                  value={Number(bollIndicator.parameters.multiplier)}
                />
                <small>标准差系数</small>
              </label>
            </div>
          </section>

          <section className="strategy-section">
            <div className="section-title">
              <Layers3 size={18} />
              <h3>图表可视化输出协议</h3>
            </div>
            <div className="visual-spec-grid">
              <span>SignalMarker</span>
              <span>PriceLine</span>
              <span>TrendLine</span>
              <span>Band</span>
              <span>Label</span>
            </div>
          </section>

          <section className="strategy-section">
            <div className="section-title">
              <Tags size={18} />
              <h3>能力边界</h3>
            </div>
            <div className="strategy-capability-grid">
              <span>预制策略</span>
              <span>可启停</span>
              <span>参数协议</span>
              <span>图表叠加</span>
              <span>样例运行</span>
              <span>Pine 来源追踪</span>
            </div>
          </section>
        </main>

        <aside className="module-card strategy-runtime-panel">
          <div className="module-card-header">
            <Play size={20} />
            <div>
              <h2>运行状态</h2>
              <p>当前执行最小策略运行链路，完整 Pine 转译将在后续模块继续。</p>
            </div>
          </div>

          <div className="runtime-status">
            <strong>{studyStrategySettings[selectedStrategy.key]?.enabled ? "已加入运行队列" : "未启用"}</strong>
            <span>{studyStrategySettings[selectedStrategy.key]?.enabled ? "策略会在超级图表中按 strategyId 输出图层。" : "启用后才会参与样例运行。"}</span>
          </div>

          <div className="backtest-history-list">
            <div className="strategy-list-group-label">回测记录</div>
            {backtestRuns.length > 0 ? (
              backtestRuns.slice(0, 5).map((run) => (
                <button className={run.id === selectedBacktestRun?.id ? "active" : ""} key={run.id} onClick={() => setSelectedBacktestRunId(run.id)} type="button">
                  <span><strong>{run.strategyName}</strong><small>{run.symbol} · {formatBacktestTimeframe(run.timeframe)}</small></span>
                  <em className={run.result.summary.totalReturnPct >= 0 ? "positive" : "negative"}>{formatBacktestPercent(run.result.summary.totalReturnPct)}</em>
                </button>
              ))
            ) : (
              <span className="backtest-history-empty">运行后会在本机保留最近 20 次结果。</span>
            )}
          </div>

          {runResult && (
            <div className="runtime-result-card">
              <strong>运行器结果</strong>
              <dl>
                <div>
                  <dt>参数</dt>
                  <dd>{Object.keys(runResult.input.parameters).length}</dd>
                </div>
                <div>
                  <dt>信号</dt>
                  <dd>{runResult.output.signals.length}</dd>
                </div>
                <div>
                  <dt>图层</dt>
                  <dd>{runResult.output.render.elements.length}</dd>
                </div>
              </dl>
            </div>
          )}

          {runResult && runResult.output.signals.length > 0 && (
            <div className="runtime-signal-list">
              {runResult.output.signals.map((signal, index) => (
                <div className={signal.type} key={`${signal.timestamp}-${signal.type}-${index}`}>
                  <strong>{signal.type === "buy" ? "买入" : signal.type === "sell" ? "卖出" : "提醒"}</strong>
                  <span>{signal.price?.toFixed(2) ?? "-"}</span>
                  <small>{signal.label ?? "策略信号"}</small>
                </div>
              ))}
            </div>
          )}

          <div className="strategy-log-list">
            <div>
              <FileCode2 size={16} />
              <span>已关联 Pine 源文件：{selectedStrategy.sourceFile}</span>
            </div>
            <div>
              <Layers3 size={16} />
              <span>图表元素将按 strategyId 独立管理。</span>
            </div>
            <div>
              <ListChecks size={16} />
              <span>下一步可进入 Pine 最小可运行子集转译。</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
