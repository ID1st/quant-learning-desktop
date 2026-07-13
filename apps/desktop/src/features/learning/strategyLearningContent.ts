export type StrategyLearningCategory = "strategy" | "indicator";

export interface StrategyLearningSection {
  readonly title: string;
  readonly content: string;
}

export interface StrategyLearningParameter {
  readonly name: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface StrategyLearningEntry {
  readonly id: string;
  readonly category: StrategyLearningCategory;
  readonly title: string;
  readonly subtitle: string;
  readonly markets: readonly string[];
  readonly timeframes: readonly string[];
  readonly placement?: "主图叠加" | "副图预留";
  readonly sections: readonly StrategyLearningSection[];
  readonly parameters: readonly StrategyLearningParameter[];
  readonly chartOutputs: readonly string[];
  readonly risks: readonly string[];
}

export const strategyLearningEntries: readonly StrategyLearningEntry[] = [
  {
    id: "utorb",
    category: "strategy",
    title: "UTORB 开盘区间突破",
    subtitle: "按指定时区逐日建立开盘区间，识别放量突破并跟踪扩展目标与 ATR 移动止损。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1m", "5m", "15m", "30m"],
    sections: [
      { title: "核心逻辑", content: "策略按固定 UTC 偏移识别每日开盘时段，可使用最高/最低价或蜡烛实体形成区间。会话结束后，收盘价首次上穿或下穿区间边界时生成方向信号，每个方向每天最多一次。" },
      { title: "图表如何表达", content: "区间带和高低线只覆盖当前交易日；上下三档扩展可选择普通倍数或斐波那契；突破箭头同时标注相对 20 根均量的高量/低量，移动止损线随 ATR 单向收紧。" },
      { title: "适合观察什么", content: "适合观察开盘后波动活跃、成交量充足的标的。它更适合作为研究框架，仍需结合市场环境、流动性和个人风险控制判断。" },
    ],
    parameters: [
      { name: "开盘时段 / 时区", defaultValue: "09:30-10:00 / UTC-5", description: "与原始 Pine Script 默认值一致；固定 UTC 偏移不会自动切换夏令时。" },
      { name: "扩展类型", defaultValue: "倍数 1/2/3", description: "也可切换为 0.382/0.618/1.0 斐波那契扩展。" },
      { name: "目标文字标签", defaultValue: "开启", description: "与原始 Pine Script 的水平标签默认值一致，可按需关闭以减少遮挡。" },
      { name: "结束绘制于", defaultValue: "纽约收盘", description: "也可选择伦敦收盘、手动时间或当日结束，均按策略固定时区解释。" },
      { name: "移动止损", defaultValue: "ATR(14) × 2", description: "突破后按方向单向收紧，可在图表中显示并用于离场信号。" },
      { name: "成交量分布", defaultValue: "14 行 / 30%", description: "与原始 Pine Script 默认值一致；按开盘区间内的成交量桶显示价格分布和 POC。" },
    ],
    chartOutputs: ["高量/低量突破箭头", "逐日开盘区间", "上下三档扩展", "成交量分布", "ATR 移动止损"],
    risks: ["突破后可能快速回落，不能把箭头视为确定交易建议。", "不同市场的开盘时段、跳空和流动性差异会影响结果。"],
  },
  {
    id: "trend-targets",
    category: "strategy",
    title: "Trend Targets 趋势目标",
    subtitle: "对 Supertrend 上下轨中点做 WMA/EMA 双重平滑，以斜率拐点生成趋势信号。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "15m", "30m", "1h", "1d"],
    sections: [
      { title: "核心逻辑", content: "策略先用 Wilder ATR 构造递推收紧的 Supertrend 上下轨，取轨道中点后依次计算 WMA 与 EMA。平滑线斜率由负转正时进入多头，由正转负时进入空头。" },
      { title: "拒绝与目标", content: "K 线连续穿越当前趋势基准线超过确认次数后标记拒绝信号。最新趋势转变会按当根 K 线的 ATR 计算止损，并从实际风险距离推导三档目标。" },
      { title: "适合观察什么", content: "适合用来研究趋势延续与回撤后的恢复。横盘或剧烈跳空阶段可能产生连续无效信号。" },
    ],
    parameters: [
      { name: "Supertrend", defaultValue: "因子 12 / ATR 90", description: "控制基础轨道宽度与波动平滑周期。" },
      { name: "双重平滑", defaultValue: "WMA 40 / EMA 14", description: "控制趋势基准线的平滑程度和拐点灵敏度。" },
      { name: "拒绝确认", defaultValue: "3", description: "连续穿越趋势线超过该次数后显示拒绝标记。" },
      { name: "止损与目标", defaultValue: "ATR×5 / 0.5R、1R、1.5R", description: "止损先确定实际风险距离，三档目标再按该风险距离计算。" },
    ],
    chartOutputs: ["多空分段趋势基准线", "趋势转变箭头", "连续拒绝标记", "入场线", "目标 1 / 目标 2 / 目标 3", "止损线"],
    risks: ["趋势指标有滞后性，不能避免突发消息或跳空风险。", "目标位是研究参考，不代表价格一定会触及。"],
  },
  {
    id: "sma",
    category: "indicator",
    title: "SMA 简单移动平均线",
    subtitle: "计算最近一段收盘价的算术平均，用于平滑价格波动。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      { title: "计算含义", content: "SMA 会将最近 N 个收盘价平均，每个价格的权重相同，因此曲线变化相对平滑。" },
      { title: "图表含义", content: "价格在均线上方或下方可用于观察趋势倾向；均线本身不直接构成买卖结论。" },
      { title: "常见局限", content: "横盘时价格会频繁穿越均线，容易出现噪声。" },
    ],
    parameters: [{ name: "均线周期", defaultValue: "9", description: "参与平均计算的 K 线数量。周期越大，曲线越平滑、反应越慢。" }],
    chartOutputs: ["趋势均线"],
    risks: ["SMA 是滞后指标，不预测未来。", "不同周期的含义不同，不能直接横向比较。"],
  },
  {
    id: "ema",
    category: "indicator",
    title: "EMA 指数移动平均线",
    subtitle: "给予最新价格更高权重的移动平均线，对变化更敏感。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      { title: "计算含义", content: "EMA 会提高最近价格的权重，因此相比 SMA 更快响应价格变化。" },
      { title: "图表含义", content: "可以用于观察较短周期趋势、回踩和价格动量变化。" },
      { title: "常见局限", content: "反应更快也意味着横盘时更容易被短期波动干扰。" },
    ],
    parameters: [{ name: "EMA 周期", defaultValue: "20", description: "控制平滑程度和对最新价格的敏感度。" }],
    chartOutputs: ["指数趋势线"],
    risks: ["EMA 对短期波动敏感，单独使用容易过度交易。", "应结合价格结构和风险控制阅读。"],
  },
  {
    id: "boll",
    category: "indicator",
    title: "BOLL 布林带",
    subtitle: "通过均线与波动区间观察价格相对位置和波动变化。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      { title: "计算含义", content: "布林带由中轨均线和上下波动带组成。带宽收缩通常表示波动减弱，扩张表示波动增大。" },
      { title: "图表含义", content: "价格靠近上下轨只能说明相对位置，不等于必然反转或必然突破。" },
      { title: "常见局限", content: "强趋势中价格可能长期贴近一侧轨道，因此不能把触及轨道直接理解为反向信号。" },
    ],
    parameters: [
      { name: "布林周期", defaultValue: "20", description: "中轨均线和波动统计使用的窗口长度。" },
      { name: "标准差倍数", defaultValue: "2", description: "控制上下轨与中轨之间的距离。" },
    ],
    chartOutputs: ["上轨", "中轨", "下轨"],
    risks: ["布林带描述波动，不提供确定方向。", "参数改变会明显影响带宽与观察结果。"],
  },
];
