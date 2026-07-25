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

export interface StrategyLearningSource {
  readonly label: string;
  readonly url: string;
  readonly license: string;
}

export interface StrategyLearningWorkspaceAction {
  readonly label: string;
  readonly route: "chart";
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
  readonly directoryLabel?: string;
  readonly source?: StrategyLearningSource;
  readonly workspaceAction?: StrategyLearningWorkspaceAction;
}

export const strategyLearningEntries: readonly StrategyLearningEntry[] = [
  {
    id: "utorb",
    category: "strategy",
    title: "UTORB 开盘区间突破",
    subtitle: "按指定时区逐日建立开盘区间，识别放量突破并跟踪扩展目标与 ATR 移动风险线。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1m", "5m", "15m", "30m"],
    sections: [
      { title: "核心逻辑", content: "策略按固定 UTC 偏移识别每日开盘时段，可使用最高/最低价或蜡烛实体形成区间。会话结束后，收盘价首次上穿或下穿区间边界时生成方向信号，每个方向每天最多一次。" },
      { title: "图表如何表达", content: "区间带和高低线只覆盖当前交易日；上下三档扩展可选择普通倍数或斐波那契；突破箭头同时标注相对 20 根均量的高量/低量，移动风险线随 ATR 单向收紧。" },
      { title: "适合观察什么", content: "适合观察开盘后波动活跃、成交量充足的标的。它更适合作为研究框架，仍需结合市场环境、流动性和个人风险控制判断。" },
    ],
    parameters: [
      { name: "开盘时段 / 时区", defaultValue: "09:30-10:00 / UTC-5", description: "与原始 Pine Script 默认值一致；固定 UTC 偏移不会自动切换夏令时。" },
      { name: "扩展类型", defaultValue: "倍数 1/2/3", description: "也可切换为 0.382/0.618/1.0 斐波那契扩展。" },
      { name: "目标文字标签", defaultValue: "开启", description: "与原始 Pine Script 的水平标签默认值一致，可按需关闭以减少遮挡。" },
      { name: "结束绘制于", defaultValue: "纽约收盘", description: "也可选择伦敦收盘、手动时间或当日结束，均按策略固定时区解释。" },
      { name: "移动风险线", defaultValue: "ATR(14) × 2", description: "突破后按方向单向收紧，可在图表中显示并用于状态失效提示。" },
      { name: "成交量分布", defaultValue: "14 行 / 30%", description: "与原始 Pine Script 默认值一致；按开盘区间内的成交量桶显示价格分布和 POC。" },
    ],
    chartOutputs: ["高量/低量突破箭头", "逐日开盘区间", "上下三档扩展", "成交量分布", "ATR 移动风险线"],
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
      { title: "核心逻辑", content: "策略先用 Wilder ATR 构造递推收紧的 Supertrend 上下轨，取轨道中点后依次计算 WMA 与 EMA。平滑线斜率由负转正时识别上行趋势，由正转负时识别下行趋势。" },
      { title: "拒绝与目标", content: "K 线连续穿越当前趋势基准线超过确认次数后标记拒绝信号。最新趋势转变会按当根 K 线的 ATR 计算风险线，并从实际风险距离推导三档目标。" },
      { title: "适合观察什么", content: "适合用来研究趋势延续与回撤后的恢复。横盘或剧烈跳空阶段可能产生连续无效信号。" },
    ],
    parameters: [
      { name: "Supertrend", defaultValue: "因子 12 / ATR 90", description: "控制基础轨道宽度与波动平滑周期。" },
      { name: "双重平滑", defaultValue: "WMA 40 / EMA 14", description: "控制趋势基准线的平滑程度和拐点灵敏度。" },
      { name: "拒绝确认", defaultValue: "3", description: "连续穿越趋势线超过该次数后显示拒绝标记。" },
      { name: "风险线与目标", defaultValue: "ATR×5 / 0.5R、1R、1.5R", description: "风险线先确定实际风险距离，三档目标再按该风险距离计算。" },
    ],
    chartOutputs: ["上行/下行分段趋势基准线", "趋势转变箭头", "连续拒绝标记", "信号参考线", "目标 1 / 目标 2 / 目标 3", "风险线"],
    risks: ["趋势指标有滞后性，不能避免突发消息或跳空风险。", "目标位是研究参考，不代表价格一定会触及。"],
  },
  {
    id: "smart-money-concepts",
    category: "strategy",
    title: "Smart Money Concepts（SMC）",
    subtitle: "以已确认的价格结构、流动性与供需区域解释行情，绘制 BOS、CHoCH、订单块、FVG 和多周期高低点。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1m", "5m", "15m", "30m", "1h", "1d", "1w"],
    placement: "主图叠加",
    directoryLabel: "结构图层指标",
    workspaceAction: { label: "在超级图表中配置", route: "chart" },
    sections: [
      {
        title: "市场结构",
        content: "内部结构用于观察较短波段，摆动结构用于识别更高层级方向。价格突破已确认枢轴时绘制 BOS；当突破方向与此前结构趋势相反时绘制 CHoCH，并同步标注 HH、HL、LH、LL 以及 Strong / Weak High / Low。",
      },
      {
        title: "供需与失衡",
        content: "订单块从结构突破前的来源蜡烛提取，分为内部和摆动两级，并使用 ATR(200) 或累计均幅过滤异常波动。FVG 表示三根 K 线形成的价格失衡；订单块被价格失效、FVG 被回补后会从当前有效图层移除。",
      },
      {
        title: "流动性与多周期",
        content: "EQH / EQL 连接接近的已确认高点或低点，用于观察潜在流动性区域。前日、前周和前月高低点只读取已确认周期数据；Premium、Equilibrium、Discount 区域帮助描述价格在当前摆动区间中的相对位置。",
      },
    ],
    parameters: [
      {
        name: "显示模式",
        defaultValue: "Historical / Colored",
        description: "Historical 保留受对象上限约束的历史结构；Present 只显示各类别最近的有效对象。可切换彩色或单色主题。",
      },
      {
        name: "内部结构",
        defaultValue: "全部 BOS / CHoCH",
        description: "控制较短层级结构、方向过滤、标签大小以及内部订单块的显示数量。",
      },
      {
        name: "摆动结构",
        defaultValue: "全部 BOS / CHoCH",
        description: "控制摆动枢轴、HH / HL / LH / LL、Strong / Weak High / Low 和摆动订单块。",
      },
      {
        name: "订单块过滤",
        defaultValue: "ATR(200)",
        description: "ATR 需要至少 200 根 K 线完成预热；不足时页面和图表明确显示“ATR 预热中”，不会静默切换算法。",
      },
      {
        name: "EQH / EQL",
        defaultValue: "长度 3 / 阈值 0.1",
        description: "用独立枢轴长度确认相近高低点；阈值越小，对价格接近程度的要求越严格。",
      },
      {
        name: "FVG",
        defaultValue: "关闭 / 自动阈值",
        description: "开启后绘制看涨或看跌双区块，可选择图表周期或补充周期，并设置向右延伸长度。",
      },
      {
        name: "多周期高低点",
        defaultValue: "前日 / 前周 / 前月关闭",
        description: "开启后只使用已经收盘确认的日、周、月数据，避免历史前视。",
      },
      {
        name: "趋势蜡烛",
        defaultValue: "关闭",
        description: "按当前 SMC 结构趋势为蜡烛着色；与其他图层冲突时由最高可见层级决定。",
      },
    ],
    chartOutputs: [
      "内部 / 摆动 BOS 与 CHoCH",
      "HH / HL / LH / LL",
      "Strong / Weak High / Low",
      "内部 / 摆动订单块",
      "EQH / EQL",
      "FVG 失衡区",
      "Premium / Equilibrium / Discount",
      "前日 / 前周 / 前月高低点",
      "趋势蜡烛",
      "16 类结构提醒",
    ],
    risks: [
      "SMC 在本系统中是图层型指标：只产生结构、区域、提醒和事件统计，不生成交易、收益率或回测 PnL。",
      "枢轴必须等待右侧 K 线确认，因此结构标记天然晚于极值出现；这是避免历史前视的必要条件。",
      "结构、订单块与流动性区域是研究解释，不等同于确定的入场、止损或目标建议。",
      "当前实现按 CC BY-NC-SA 4.0 用于本地非商业研究；商业发布需要另行取得授权。",
    ],
    source: {
      label: "Smart Money Concepts (SMC) [LuxAlgo]",
      url: "https://www.tradingview.com/script/CnB3fSph-Smart-Money-Concepts-SMC-LuxAlgo/",
      license: "CC BY-NC-SA 4.0",
    },
  },
  {
    id: "machine-learning-price-targets",
    category: "strategy",
    title: "Machine Learning Price Targets",
    subtitle: "以趋势段历史表现训练 RBF 核回归模型，估计下一段价格移动幅度，并在主图绘制目标区、风险区和确认信号。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["实时 1 分钟"],
    placement: "主图叠加",
    directoryLabel: "机器学习目标指标",
    workspaceAction: { label: "在超级图表中配置", route: "chart" },
    sections: [
      {
        title: "模型如何形成预测",
        content: "指标在每次趋势方向切换时记录上一趋势段的最大有利移动，并使用价格位置、波动变化、二阶变化、成交量振荡、震荡度、RSI 与趋势方向共 8 个特征。RBF 核函数会按特征距离为历史样本分配权重，输出下一趋势段的预测移动比例。",
      },
      {
        title: "趋势与图层",
        content: "趋势可选择 EMA 50/200 交叉、HMA 93 斜率或 SuperTrend 3/10。有效预测会从确认 K 线收盘价绘制绿色目标区和红色风险区，并以大号上下箭头标记方向；交易状态同时用于蜡烛着色。",
      },
      {
        title: "统计与提醒",
        content: "右上角表格显示训练样本量、预测移动、历史成功率、建议风险收益比和当前状态。指标提供看涨、看跌、止盈命中与止损命中四类一次性提醒。",
      },
    ],
    parameters: [
      { name: "趋势模式", defaultValue: "EMA Cross (Fast Slow)", description: "可切换为 HMA Increasing/Decreasing 或 SuperTrend。" },
      { name: "RBF 带宽", defaultValue: "5", description: "控制远距离训练样本的权重；源码允许的最小值为 2。" },
      { name: "历史预热", defaultValue: "1,000 根", description: "少于 1,000 根已确认分钟 K 线时仅显示预热进度，不产生预测图层或信号。" },
      { name: "颜色", defaultValue: "#00FFBB / #FF1100", description: "分别控制看涨目标、看跌风险、箭头和交易状态蜡烛的颜色。" },
    ],
    chartOutputs: ["绿色目标区 / 红色风险区", "上下方向标签", "交易状态蜡烛着色", "右上角指标统计表", "四类确认提醒"],
    risks: [
      "模型只从当前标的已有历史样本估计移动幅度；样本少、行情状态改变或成交量数据异常时，预测可靠性会下降。",
      "本实现是指标：不生成订单、收益率或回测 PnL，目标区与风险区不构成投资建议。",
      "信号只在 K 线收盘后确认，因此会晚于盘中首次穿越，但不会因未收盘价格变化而反复消失。",
    ],
    source: {
      label: "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
      url: "https://www.tradingview.com/script/3MHPrjD5-Machine-Learning-Price-Target-Prediction-Signals-AlgoAlpha/",
      license: "未声明软件许可证",
    },
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
