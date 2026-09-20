import type { AppLanguage } from "../../i18n/i18n.ts";

export interface StrategyDisplayIdentity {
  readonly key: string;
  readonly name: string;
}

const builtInStrategyDisplayNames: Readonly<Record<string, Readonly<Record<AppLanguage, string>>>> =
  {
    utorb: { "zh-CN": "开盘区间观察", "en-US": "Opening Range Monitor" },
    "trend-targets": { "zh-CN": "趋势路径参考", "en-US": "Trend Path Reference" },
    "smart-money-concepts": { "zh-CN": "市场结构图谱", "en-US": "Market Structure Map" },
    "machine-learning-price-targets": {
      "zh-CN": "数据驱动走势研究",
      "en-US": "Data-Driven Movement Study",
    },
  };

export function getStrategyDisplayName(strategy: StrategyDisplayIdentity, language: AppLanguage) {
  return builtInStrategyDisplayNames[strategy.key]?.[language] ?? strategy.name;
}

const builtInStrategyNameAliases: Readonly<Record<string, readonly string[]>> = {
  utorb: ["UTORB 开盘区间突破", "UTORB"],
  "trend-targets": ["Trend Targets [AlgoAlpha]", "Trend Targets 趋势目标", "Trend Targets"],
  "smart-money-concepts": [
    "Smart Money Concepts (SMC) [LuxAlgo]",
    "Smart Money Concepts [LuxAlgo]",
    "Smart Money Concepts",
  ],
  "machine-learning-price-targets": [
    "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
    "Machine Learning Price Movement Study [AlgoAlpha]",
    "Machine Learning Price Movement Study",
  ],
};

export function replaceStrategyNameInDisplayText(
  text: string,
  strategy: StrategyDisplayIdentity,
  language: AppLanguage,
) {
  const displayName = getStrategyDisplayName(strategy, language);
  return (builtInStrategyNameAliases[strategy.key] ?? []).reduce(
    (value, alias) => value.replaceAll(alias, displayName),
    text,
  );
}
