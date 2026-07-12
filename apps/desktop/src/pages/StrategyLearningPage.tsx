import { BookOpen, ChartNoAxesCombined, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { strategyLearningEntries, type StrategyLearningCategory } from "../features/learning/strategyLearningContent";

const categoryLabels: Record<StrategyLearningCategory, string> = {
  strategy: "策略",
  indicator: "技术指标",
};

export function StrategyLearningPage() {
  const [selectedId, setSelectedId] = useState(strategyLearningEntries[0]?.id ?? "utorb");
  const selectedEntry = useMemo(
    () => strategyLearningEntries.find((entry) => entry.id === selectedId) ?? strategyLearningEntries[0]!,
    [selectedId],
  );

  return (
    <section className="strategy-learning-page">
      <header className="module-header strategy-learning-header">
        <div>
          <p>策略学习</p>
          <h1>策略与指标学习</h1>
          <span>阅读当前工作台内置策略和技术指标的逻辑、参数、图表表达与使用边界。</span>
        </div>
      </header>

      <div className="strategy-learning-layout">
        <aside className="strategy-learning-directory" aria-label="学习目录">
          {(Object.keys(categoryLabels) as StrategyLearningCategory[]).map((category) => {
            const entries = strategyLearningEntries.filter((entry) => entry.category === category);
            return (
              <section key={category}>
                <p>{categoryLabels[category]}</p>
                {entries.map((entry) => (
                  <button
                    aria-pressed={entry.id === selectedEntry.id}
                    className={entry.id === selectedEntry.id ? "active" : ""}
                    key={entry.id}
                    onClick={() => setSelectedId(entry.id)}
                    type="button"
                  >
                    <strong>{entry.title}</strong>
                    <small>{entry.category === "strategy" ? "预制策略" : entry.placement}</small>
                  </button>
                ))}
              </section>
            );
          })}
        </aside>

        <main className="strategy-learning-content">
          <header className="strategy-learning-title">
            <span>{selectedEntry.category === "strategy" ? <BookOpen size={20} /> : <ChartNoAxesCombined size={20} />}</span>
            <div>
              <em>{categoryLabels[selectedEntry.category]}</em>
              <h2>{selectedEntry.title}</h2>
              <p>{selectedEntry.subtitle}</p>
            </div>
          </header>

          <div className="strategy-learning-meta">
            <span>适用市场：{selectedEntry.markets.join(" / ")}</span>
            <span>支持周期：{selectedEntry.timeframes.join(" / ")}</span>
            {selectedEntry.placement && <span>{selectedEntry.placement}</span>}
          </div>

          <section className="strategy-learning-section-grid">
            {selectedEntry.sections.map((section) => (
              <article key={section.title}>
                <h3>{section.title}</h3>
                <p>{section.content}</p>
              </article>
            ))}
          </section>

          <section className="strategy-learning-block">
            <div className="strategy-learning-block-heading"><SlidersHorizontal size={18} /><h3>参数说明</h3></div>
            <div className="strategy-learning-parameter-list">
              {selectedEntry.parameters.map((parameter) => (
                <article key={parameter.name}>
                  <strong>{parameter.name}</strong>
                  <em>默认：{parameter.defaultValue}</em>
                  <p>{parameter.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="strategy-learning-block">
            <div className="strategy-learning-block-heading"><ChartNoAxesCombined size={18} /><h3>图表输出</h3></div>
            <div className="strategy-learning-chip-list">{selectedEntry.chartOutputs.map((output) => <span key={output}>{output}</span>)}</div>
          </section>

          <section className="strategy-learning-risk">
            <div className="strategy-learning-block-heading"><ShieldAlert size={18} /><h3>使用边界与风险提示</h3></div>
            <ul>{selectedEntry.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
          </section>
        </main>
      </div>
    </section>
  );
}
