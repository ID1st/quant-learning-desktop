import { useMemo, useState } from "react";
import {
  createPresetStrategyRegistry,
  runRegisteredStrategy,
  type Bar,
  type StrategyDefinition,
} from "@quant/strategy-engine";
import { Activity, FileCode2, Layers3, ListChecks, Play, Power, SlidersHorizontal } from "lucide-react";

type StrategyStatus = "enabled" | "disabled";

const registry = createPresetStrategyRegistry();

const sampleStart = Date.UTC(2026, 0, 2, 14, 30);
const sampleMinute = 60 * 1000;
const sampleBars: Bar[] = [
  { timestamp: sampleStart, open: 100, high: 103, low: 99, close: 101, volume: 100000 },
  { timestamp: sampleStart + 15 * sampleMinute, open: 101, high: 104, low: 100, close: 102, volume: 110000 },
  { timestamp: sampleStart + 30 * sampleMinute, open: 102, high: 105, low: 101, close: 105, volume: 125000 },
  { timestamp: sampleStart + 45 * sampleMinute, open: 105, high: 106, low: 97, close: 98, volume: 135000 },
];

function createInitialStatus(strategies: StrategyDefinition[]) {
  return strategies.reduce<Record<string, StrategyStatus>>((current, strategy, index) => {
    current[strategy.key] = index === 0 ? "enabled" : "disabled";
    return current;
  }, {});
}

export function StrategyManagementPage() {
  const strategies = useMemo(() => registry.list(), []);
  const [selectedKey, setSelectedKey] = useState(strategies[0]?.key ?? "");
  const [strategyStatus, setStrategyStatus] = useState(() => createInitialStatus(strategies));
  const selectedStrategy = strategies.find((strategy) => strategy.key === selectedKey) ?? strategies[0];
  const enabledCount = Object.values(strategyStatus).filter((status) => status === "enabled").length;
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

  return (
    <section className="strategy-page">
      <header className="module-header">
        <p>策略管理</p>
        <h1>预制策略与可视化图层</h1>
        <span>当前阶段建立策略注册、启停、参数占位和图表可视化输出协议，Pine Script 转译将在后续模块进行。</span>
      </header>

      <div className="strategy-summary-grid">
        <div className="module-card strategy-stat-card">
          <Activity size={20} />
          <span>已注册策略</span>
          <strong>{strategies.length}</strong>
        </div>
        <div className="module-card strategy-stat-card">
          <Power size={20} />
          <span>已启用策略</span>
          <strong>{enabledCount}</strong>
        </div>
        <div className="module-card strategy-stat-card">
          <Layers3 size={20} />
          <span>可视化协议</span>
          <strong>已建立</strong>
        </div>
      </div>

      <div className="strategy-workspace-grid">
        <aside className="module-card strategy-list-panel">
          <div className="module-card-header">
            <ListChecks size={20} />
            <div>
              <h2>策略列表</h2>
              <p>内置策略先注册元数据，后续接入真实运行器。</p>
            </div>
          </div>

          <div className="strategy-list">
            {strategies.map((strategy) => {
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
                  {parameter.description && <small>{parameter.description}</small>}
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
            <strong>{strategyStatus[selectedStrategy.key] === "enabled" ? "等待行情" : "未启用"}</strong>
            <span>{strategyStatus[selectedStrategy.key] === "enabled" ? "策略已加入图表图层队列。" : "启用后才会生成可视化输出。"}</span>
          </div>

          {runResult && (
            <div className="runtime-status">
              <strong>运行器结果</strong>
              <span>
                参数 {Object.keys(runResult.input.parameters).length} 项，信号 {runResult.output.signals.length} 个，图层元素{" "}
                {runResult.output.render.elements.length} 个。
              </span>
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
              <span>下一步将接入参数保存与图表叠加渲染。</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
