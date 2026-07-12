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
    subtitle: "围绕开盘区间高低点识别突破方向，并给出目标与风险参考。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1m", "5m", "15m", "30m"],
    sections: [
      { title: "核心逻辑", content: "策略先记录开盘后的一个时间窗口，形成开盘区间高点和低点。价格向上突破高点时寻找多头机会，向下突破低点时寻找空头或离场提示。" },
      { title: "图表如何表达", content: "图表中的上下箭头代表策略信号；开盘区间线用于识别突破位置；目标位和止损线用于表达同一笔研究假设的风险收益区间。" },
      { title: "适合观察什么", content: "适合观察开盘后波动活跃、成交量充足的标的。它更适合作为研究框架，仍需结合市场环境、流动性和个人风险控制判断。" },
    ],
    parameters: [
      { name: "开盘区间分钟数", defaultValue: "30", description: "用于计算开盘高低点的时间窗口。窗口越长，信号通常越少。" },
      { name: "显示目标位", defaultValue: "开启", description: "控制图表是否显示策略推导出的目标参考线。" },
      { name: "风控模式", defaultValue: "均衡", description: "影响目标与止损的风险收益倾向。" },
    ],
    chartOutputs: ["买入/卖出箭头", "开盘区间高低点", "目标位", "止损线"],
    risks: ["突破后可能快速回落，不能把箭头视为确定交易建议。", "不同市场的开盘时段、跳空和流动性差异会影响结果。"],
  },
  {
    id: "trend-targets",
    category: "strategy",
    title: "Trend Targets 趋势目标",
    subtitle: "根据趋势状态生成方向提示，并给出入场、目标和止损参考。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1d", "1w"],
    sections: [
      { title: "核心逻辑", content: "策略通过价格趋势和均线关系判断当前偏多或偏空状态，并在趋势转折或确认时生成方向信号。" },
      { title: "目标结构", content: "最新有效信号会延伸出入场、多个目标位和止损线，帮助把研究过程拆成可观察的价格层级。" },
      { title: "适合观察什么", content: "适合用来研究趋势延续与回撤后的恢复。横盘或剧烈跳空阶段可能产生连续无效信号。" },
    ],
    parameters: [
      { name: "趋势长度", defaultValue: "10", description: "影响趋势判断的灵敏度；数值更大通常更平滑。" },
      { name: "目标倍数", defaultValue: "1.5", description: "控制目标价相对于初始风险区间的距离。" },
      { name: "显示止损线", defaultValue: "开启", description: "控制图表是否保留风险失效位置。" },
    ],
    chartOutputs: ["上/下方向箭头", "入场线", "目标 1 / 目标 2 / 目标 3", "止损线"],
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
