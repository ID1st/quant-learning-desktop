import {
  BookOpen,
  ChartCandlestick,
  ChartNoAxesCombined,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  strategyLearningEntries,
  type StrategyLearningCategory,
} from "../features/learning/strategyLearningContent";
import { useI18n } from "../i18n/I18nProvider";
import { useAppStore } from "../state/appStore";
import { getStrategyDisplayName } from "../features/strategies/strategyDisplayName";

export function StrategyLearningPage() {
  const { language, t } = useI18n();
  const [selectedId, setSelectedId] = useState(strategyLearningEntries[0]?.id ?? "utorb");
  const navigate = useAppStore((state) => state.navigate);
  const selectedEntry = useMemo(
    () =>
      strategyLearningEntries.find((entry) => entry.id === selectedId) ??
      strategyLearningEntries[0]!,
    [selectedId],
  );
  const workspaceAction = selectedEntry.workspaceAction;
  const categoryLabels: Record<StrategyLearningCategory, string> = {
    strategy: t("策略"),
    indicator: t("技术指标"),
  };
  const formatEntryTitle = (entry: (typeof strategyLearningEntries)[number]) =>
    entry.category === "strategy"
      ? getStrategyDisplayName({ key: entry.id, name: t(entry.title) }, language)
      : t(entry.title);

  return (
    <section className="strategy-learning-page">
      <header className="module-header strategy-learning-header">
        <div>
          <p>{t("策略学习")}</p>
          <h1>{t("策略与指标学习")}</h1>
          <span>{t("阅读当前工作台内置策略和技术指标的逻辑、参数、图表表达与使用边界。")}</span>
        </div>
      </header>

      <div className="strategy-learning-layout">
        <aside className="strategy-learning-directory" aria-label={t("学习目录")}>
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
                    <strong>{formatEntryTitle(entry)}</strong>
                    <small>
                      {t(
                        entry.directoryLabel ??
                          (entry.category === "strategy" ? "预制策略" : (entry.placement ?? "")),
                      )}
                    </small>
                  </button>
                ))}
              </section>
            );
          })}
        </aside>

        <main className="strategy-learning-content">
          <header className="strategy-learning-title">
            <span>
              {selectedEntry.category === "strategy" ? (
                <BookOpen size={20} />
              ) : (
                <ChartNoAxesCombined size={20} />
              )}
            </span>
            <div>
              <em>{categoryLabels[selectedEntry.category]}</em>
              <h2>{formatEntryTitle(selectedEntry)}</h2>
              <p>{t(selectedEntry.subtitle)}</p>
            </div>
            {workspaceAction && (
              <button
                className="strategy-learning-workspace-action"
                onClick={() => navigate(workspaceAction.route)}
                type="button"
              >
                <ChartCandlestick aria-hidden="true" size={17} />
                {t(workspaceAction.label)}
              </button>
            )}
          </header>

          <div className="strategy-learning-meta">
            <span>
              {t("适用市场：{markets}", {
                markets: selectedEntry.markets.map((market) => t(market)).join(" / "),
              })}
            </span>
            <span>
              {t("支持周期：{timeframes}", {
                timeframes: selectedEntry.timeframes.map((timeframe) => t(timeframe)).join(" / "),
              })}
            </span>
            {selectedEntry.placement && <span>{t(selectedEntry.placement)}</span>}
          </div>

          <section className="strategy-learning-section-grid">
            {selectedEntry.sections.map((section) => (
              <article key={section.title}>
                <h3>{t(section.title)}</h3>
                <p>{t(section.content)}</p>
              </article>
            ))}
          </section>

          <section className="strategy-learning-block">
            <div className="strategy-learning-block-heading">
              <SlidersHorizontal size={18} />
              <h3>{t("参数说明")}</h3>
            </div>
            <div className="strategy-learning-parameter-list">
              {selectedEntry.parameters.map((parameter) => (
                <article key={parameter.name}>
                  <strong>{t(parameter.name)}</strong>
                  <em>{t("默认：{value}", { value: t(parameter.defaultValue) })}</em>
                  <p>{t(parameter.description)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="strategy-learning-block">
            <div className="strategy-learning-block-heading">
              <ChartNoAxesCombined size={18} />
              <h3>{t("图表输出")}</h3>
            </div>
            <div className="strategy-learning-chip-list">
              {selectedEntry.chartOutputs.map((output) => (
                <span key={output}>{t(output)}</span>
              ))}
            </div>
          </section>

          <section className="strategy-learning-risk">
            <div className="strategy-learning-block-heading">
              <ShieldAlert size={18} />
              <h3>{t("使用边界与风险提示")}</h3>
            </div>
            <ul>
              {selectedEntry.risks.map((risk) => (
                <li key={risk}>{t(risk)}</li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </section>
  );
}
