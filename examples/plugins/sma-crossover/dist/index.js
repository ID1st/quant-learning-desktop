const strategyKey = "com.quant.strategy.sma-crossover:signal";
const strategyName = "均线交叉示例策略";

function average(bars, end, size) {
  const start = Math.max(0, end - size + 1);
  const values = bars.slice(start, end + 1).map((bar) => bar.close);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function positiveInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(2, Math.min(240, Math.round(numeric))) : fallback;
}

export function activate(context) {
  context.registerStrategy({
    key: strategyKey,
    name: strategyName,
    version: "1.0.0",
    description: "使用快慢均线交叉生成学习用买卖信号。",
    sourceType: "plugin",
    supportedMarkets: ["US", "HK", "CN"],
    supportedTimeframes: ["realtime", "1d", "1w"],
    parameterSchema: [
      { key: "fastPeriod", label: "快线周期", type: "number", defaultValue: 8 },
      { key: "slowPeriod", label: "慢线周期", type: "number", defaultValue: 21 },
    ],
    run(input) {
      const fastPeriod = positiveInteger(input.parameters.fastPeriod, 8);
      const slowPeriod = Math.max(fastPeriod + 1, positiveInteger(input.parameters.slowPeriod, 21));
      const bars = input.bars;
      const lastIndex = bars.length - 1;
      const signals = [];

      if (lastIndex >= slowPeriod) {
        const previousFast = average(bars, lastIndex - 1, fastPeriod);
        const previousSlow = average(bars, lastIndex - 1, slowPeriod);
        const fast = average(bars, lastIndex, fastPeriod);
        const slow = average(bars, lastIndex, slowPeriod);
        const current = bars[lastIndex];

        if (previousFast <= previousSlow && fast > slow) {
          signals.push({ timestamp: current.timestamp, type: "buy", price: current.close, label: "均线向上交叉" });
        }
        if (previousFast >= previousSlow && fast < slow) {
          signals.push({ timestamp: current.timestamp, type: "sell", price: current.close, label: "均线向下交叉" });
        }
      }

      const lastClose = bars[lastIndex]?.close ?? 0;
      const overlays = signals.map((signal, index) => ({
          id: `${strategyKey}-${signal.timestamp}-${index}`,
          kind: "signal-marker",
          timestamp: signal.timestamp,
          price: signal.price,
          direction: signal.type === "buy" ? "up" : "down",
          tone: signal.type,
        }));

      return {
        signals,
        overlays,
        render: {
          strategyId: strategyKey,
          strategyName,
          enabled: input.enabled !== false,
          zIndex: 16,
          elements: overlays,
        },
        metrics: { lastClose },
        logs: [`快线 ${fastPeriod}，慢线 ${slowPeriod}。`],
        alerts: signals.map((signal) => signal.label),
      };
    },
  });
  context.log("均线交叉示例策略已注册。");
}
