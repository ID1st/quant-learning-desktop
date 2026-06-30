import { useMemo, useState } from "react";
import {
  createPresetStrategyRegistry,
  createUserStrategyDraftDefinition,
  preflightPineStrategySource,
  runRegisteredStrategy,
  type Bar,
  type StrategyDefinition,
  type StrategyParameterDefinition,
} from "@quant/strategy-engine";
import { useUserStrategyDraftStore } from "../features/strategies/userStrategyDraftStore";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Copy,
  FileCode2,
  FilePlus2,
  Layers3,
  ListChecks,
  Play,
  Power,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  Trash2,
} from "lucide-react";

type StrategyStatus = "enabled" | "disabled";
type StrategyFilter = "all" | StrategyStatus;

const registry = createPresetStrategyRegistry();

const sampleStart = Date.UTC(2026, 0, 2, 14, 30);
const sampleMinute = 60 * 1000;
const sampleBars: Bar[] = [
  { timestamp: sampleStart, open: 100, high: 103, low: 99, close: 101, volume: 100000 },
  { timestamp: sampleStart + 15 * sampleMinute, open: 101, high: 104, low: 100, close: 102, volume: 110000 },
  { timestamp: sampleStart + 30 * sampleMinute, open: 102, high: 105, low: 101, close: 105, volume: 125000 },
  { timestamp: sampleStart + 45 * sampleMinute, open: 105, high: 106, low: 97, close: 98, volume: 135000 },
  { timestamp: sampleStart + 60 * sampleMinute, open: 98, high: 101, low: 96, close: 100, volume: 118000 },
  { timestamp: sampleStart + 75 * sampleMinute, open: 100, high: 103, low: 98, close: 102, volume: 122000 },
];

const samplePineSource = `//@version=5
indicator("用户策略示例", overlay=true)
length = input.int(20, "均线长度")
basis = ta.sma(close, length)
plot(basis)
alertcondition(close > basis, "上穿均线")
`;

function createInitialStatus(strategies: StrategyDefinition[]) {
  return strategies.reduce<Record<string, StrategyStatus>>((current, strategy, index) => {
    current[strategy.key] = index === 0 ? "enabled" : "disabled";
    return current;
  }, {});
}

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

export function StrategyManagementPage() {
  const strategies = useMemo(() => registry.list(), []);
  const [selectedKey, setSelectedKey] = useState(strategies[0]?.key ?? "");
  const [filter, setFilter] = useState<StrategyFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [pineSourceDraft, setPineSourceDraft] = useState(samplePineSource);
  const importedDrafts = useUserStrategyDraftStore((state) => state.drafts);
  const selectedDraftId = useUserStrategyDraftStore((state) => state.selectedDraftId);
  const addImportedDraft = useUserStrategyDraftStore((state) => state.addDraft);
  const duplicateImportedDraft = useUserStrategyDraftStore((state) => state.duplicateDraft);
  const updateDraftMeta = useUserStrategyDraftStore((state) => state.updateDraftMeta);
  const updateDraftParameter = useUserStrategyDraftStore((state) => state.updateDraftParameter);
  const deleteImportedDraft = useUserStrategyDraftStore((state) => state.deleteDraft);
  const setSelectedDraftId = useUserStrategyDraftStore((state) => state.setSelectedDraftId);
  const [strategyStatus, setStrategyStatus] = useState(() => createInitialStatus(strategies));
  const selectedStrategy = strategies.find((strategy) => strategy.key === selectedKey) ?? strategies[0];
  const enabledCount = Object.values(strategyStatus).filter((status) => status === "enabled").length;
  const userDraftReadyCount = importedDrafts.filter((draft) => draft.definition.translation.status === "ready").length;
  const userDraftReviewCount = importedDrafts.filter((draft) => draft.definition.translation.status === "manual-review").length;
  const strategyRuns = useMemo(
    () =>
      strategies.map((strategy) => {
        const result = runRegisteredStrategy(registry, {
          strategyKey: strategy.key,
          symbol: "AAPL",
          market: "US",
          timeframe: "15m",
          bars: sampleBars,
          runMode: "backtest",
          enabled: strategyStatus[strategy.key] === "enabled",
        });

        return {
          strategy,
          status: strategyStatus[strategy.key],
          result,
        };
      }),
    [strategies, strategyStatus],
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
  const filteredStrategies = strategies.filter((strategy) => {
    const status = strategyStatus[strategy.key];
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
    ? runRegisteredStrategy(registry, {
        strategyKey: selectedStrategy.key,
        symbol: "AAPL",
        market: "US",
        timeframe: "15m",
        bars: sampleBars,
        runMode: "backtest",
        enabled: strategyStatus[selectedStrategy.key] === "enabled",
      })
    : null;

  const toggleStrategy = (strategyKey: string) => {
    setStrategyStatus((current) => ({
      ...current,
      [strategyKey]: current[strategyKey] === "enabled" ? "disabled" : "enabled",
    }));
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
        <p>策略管理</p>
        <h1>策略库与运行管理</h1>
        <span>集中管理预制策略、用户 Pine 草稿和后续插件策略。当前用户草稿仅进入管理与转译准备阶段，不执行用户代码。</span>
      </header>

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

      <section className="module-card strategy-import-panel">
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
              const isEnabled = strategyStatus[strategy.key] === "enabled";

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
            <button
              className={strategyStatus[selectedStrategy.key] === "enabled" ? "danger-action" : "primary-auth-action"}
              onClick={() => toggleStrategy(selectedStrategy.key)}
              type="button"
            >
              {strategyStatus[selectedStrategy.key] === "enabled" ? "停用策略" : "启用策略"}
            </button>
          </div>

          <div className="strategy-meta-grid">
            <span>版本：{selectedStrategy.version}</span>
            <span>市场：{selectedStrategy.supportedMarkets.join(" / ")}</span>
            <span>周期：{selectedStrategy.supportedTimeframes.join(" / ")}</span>
            <span>参数：{selectedStrategy.parameterSchema.length} 项</span>
            <span>来源：{selectedStrategy.sourceFile}</span>
            <span>类型：{selectedStrategy.sourceType}</span>
          </div>

          <section className="strategy-section">
            <div className="section-title">
              <SlidersHorizontal size={18} />
              <h3>参数配置</h3>
            </div>
            <div className="parameter-grid">
              {selectedStrategy.parameterSchema.map((parameter) => (
                <label key={parameter.key}>
                  <span>{parameter.label}</span>
                  <input readOnly value={String(parameter.defaultValue)} />
                  <small>{parameter.description ?? `${parameter.type} / ${parameter.key}`}</small>
                </label>
              ))}
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
            <strong>{strategyStatus[selectedStrategy.key] === "enabled" ? "已加入运行队列" : "未启用"}</strong>
            <span>{strategyStatus[selectedStrategy.key] === "enabled" ? "策略会在超级图表中按 strategyId 输出图层。" : "启用后才会参与样例运行。"}</span>
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
