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
    subtitle: "按指定时区逐日建立开盘区间，识别放量突破并跟踪扩展观察水平与 ATR 移动风险线。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1m", "5m", "15m", "30m"],
    placement: "主图叠加",
    workspaceAction: { label: "在超级图表中配置", route: "chart" },
    sections: [
      {
        title: "核心逻辑",
        content:
          "策略按固定 UTC 偏移识别每日开盘时段，可使用最高/最低价或蜡烛实体形成区间。会话结束后，收盘价首次上穿或下穿区间边界时生成方向条件事件，每个方向每天最多一次。",
      },
      {
        title: "图表如何表达",
        content:
          "区间带、高低线及上下六段扩展区域会持续到所选绘制结束时间；最新观察水平标签直接显示历史命中率。突破标签同时标注相对 20 根均量的高量/低量，移动风险线随 ATR 单向收紧。",
      },
      {
        title: "适合观察什么",
        content:
          "适合观察开盘后波动活跃、成交量充足的标的。它更适合作为研究框架，仍需结合市场环境、流动性和个人风险控制判断。",
      },
    ],
    parameters: [
      {
        name: "开盘时段 / 时区",
        defaultValue: "09:30-10:00 / UTC-5",
        description: "与原始 Pine Script 默认值一致；固定 UTC 偏移不会自动切换夏令时。",
      },
      {
        name: "扩展类型",
        defaultValue: "倍数 1/2/3",
        description: "也可切换为 0.382/0.618/1.0 斐波那契扩展。",
      },
      {
        name: "目标文字标签",
        defaultValue: "开启",
        description: "与原始 Pine Script 的水平标签默认值一致，可按需关闭以减少遮挡。",
      },
      {
        name: "结束绘制于",
        defaultValue: "纽约收盘",
        description: "也可选择伦敦收盘、手动时间或当日结束，均按策略固定时区解释。",
      },
      {
        name: "移动风险线",
        defaultValue: "ATR(14) × 2",
        description: "突破后按方向单向收紧，可在图表中显示并用于状态失效提示。",
      },
      {
        name: "成交量分布",
        defaultValue: "14 行 / 30%",
        description: "与原始 Pine Script 默认值一致；按开盘区间内的成交量桶显示价格分布和 POC。",
      },
    ],
    chartOutputs: [
      "高量/低量突破标签",
      "逐日开盘区间",
      "六段扩展区域",
      "命中率目标标签",
      "成交量分布",
      "ATR 移动风险线",
    ],
    risks: [
      "突破后可能快速回落，不能把箭头视为确定交易建议。",
      "不同市场的开盘时段、跳空和流动性差异会影响结果。",
    ],
    source: {
      label: "Ultimate Opening Range Breakout [LuxAlgo]",
      url: "https://www.tradingview.com/script/G4aoqFUF-Ultimate-Opening-Range-Breakout-LuxAlgo/",
      license: "未声明软件许可证",
    },
  },
  {
    id: "trend-targets",
    category: "strategy",
    title: "Trend Targets 趋势目标",
    subtitle: "对 Supertrend 上下轨中点做 WMA/EMA 双重平滑，以斜率拐点生成趋势条件事件。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "15m", "30m", "1h", "1d"],
    placement: "主图叠加",
    workspaceAction: { label: "在超级图表中配置", route: "chart" },
    sections: [
      {
        title: "核心逻辑",
        content:
          "策略先用 Wilder ATR 构造递推收紧的 Supertrend 上下轨，取轨道中点后依次计算 WMA 与 EMA。平滑线斜率由负转正时识别上行趋势，由正转负时识别下行趋势。",
      },
      {
        title: "拒绝与目标",
        content:
          "K 线连续穿越当前趋势基准线超过确认次数后标记拒绝条件事件。最新趋势转变会按当根 K 线的 ATR 固定条件触发参考、风险线和三档观察水平，并以趋势颜色同步着色基准线与蜡烛。",
      },
      {
        title: "适合观察什么",
        content:
          "适合用来研究趋势延续与回撤后的恢复。横盘或剧烈跳空阶段可能产生连续失效的条件事件。",
      },
    ],
    parameters: [
      {
        name: "Supertrend",
        defaultValue: "因子 12 / ATR 90",
        description: "控制基础轨道宽度与波动平滑周期。",
      },
      {
        name: "双重平滑",
        defaultValue: "WMA 40 / EMA 14",
        description: "控制趋势基准线的平滑程度和拐点灵敏度。",
      },
      {
        name: "拒绝确认",
        defaultValue: "3",
        description: "连续穿越趋势线超过该次数后显示拒绝标记。",
      },
      {
        name: "风险线与观察水平",
        defaultValue: "ATR×5 / 0.5R、1R、1.5R",
        description: "风险线先确定模型风险距离，三档观察水平再按该距离计算。",
      },
      {
        name: "趋势颜色",
        defaultValue: "#00FFBB / #FF1100",
        description: "分别控制上行、下行基准线、蜡烛、趋势转变和拒绝标记。",
      },
    ],
    chartOutputs: [
      "上行/下行分段趋势基准线",
      "趋势蜡烛着色",
      "趋势转变箭头",
      "连续拒绝标记",
      "条件触发参考 / 风险线 / 三档观察水平投影",
    ],
    risks: [
      "趋势指标有滞后性，不能避免突发消息或跳空风险。",
      "观察水平是研究参考，不代表价格一定会触及。",
    ],
    source: {
      label: "Trend Targets [AlgoAlpha]",
      url: "https://www.tradingview.com/script/OXsSm5NV-Trend-Targets-AlgoAlpha/",
      license: "未声明软件许可证",
    },
  },
  {
    id: "smart-money-concepts",
    category: "strategy",
    title: "Smart Money Concepts（SMC）",
    subtitle:
      "以已确认的价格结构、流动性与供需区域解释行情，绘制 BOS、CHoCH、订单块、FVG 和多周期高低点。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "1m", "5m", "15m", "30m", "1h", "1d", "1w"],
    placement: "主图叠加",
    directoryLabel: "结构图层指标",
    workspaceAction: { label: "在超级图表中配置", route: "chart" },
    sections: [
      {
        title: "市场结构",
        content:
          "内部结构用于观察较短波段，摆动结构用于识别更高层级方向。价格突破已确认枢轴时绘制 BOS；当突破方向与此前结构趋势相反时绘制 CHoCH，并同步标注 HH、HL、LH、LL 以及 Strong / Weak High / Low。",
      },
      {
        title: "供需与失衡",
        content:
          "订单块从结构突破前的来源蜡烛提取，分为内部和摆动两级，并使用 ATR(200) 或累计均幅过滤异常波动。FVG 表示三根 K 线形成的价格失衡；订单块被价格失效、FVG 被回补后会从当前有效图层移除。",
      },
      {
        title: "流动性与多周期",
        content:
          "EQH / EQL 连接接近的已确认高点或低点，用于观察潜在流动性区域。前日、前周和前月高低点只读取已确认周期数据；Premium、Equilibrium、Discount 区域帮助描述价格在当前摆动区间中的相对位置。",
      },
    ],
    parameters: [
      {
        name: "显示模式",
        defaultValue: "Historical / Colored",
        description:
          "Historical 保留受对象上限约束的历史结构；Present 只显示各类别最近的有效对象。可切换彩色或单色主题。",
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
        description:
          "ATR 需要至少 200 根 K 线完成预热；不足时页面和图表明确显示“ATR 预热中”，不会静默切换算法。",
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
      "结构、订单块与流动性区域是研究解释，不等同于具体交易行动建议。",
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
    title: "Machine Learning Price Movement Study",
    subtitle:
      "以趋势段历史表现训练 RBF 核回归模型，估计下一段价格移动幅度，并在主图绘制观察区、风险区和确认条件事件。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["实时 1 分钟"],
    placement: "主图叠加",
    directoryLabel: "机器学习目标指标",
    workspaceAction: { label: "在超级图表中配置", route: "chart" },
    sections: [
      {
        title: "模型如何形成估计",
        content:
          "指标在每次趋势方向切换时记录上一趋势段的最大有利移动，并使用价格位置、波动变化、二阶变化、成交量振荡、震荡度、RSI 与趋势方向共 8 个特征。RBF 核函数会按特征距离为历史样本分配权重，输出下一趋势段的模型移动估计。",
      },
      {
        title: "趋势与图层",
        content:
          "趋势可选择 EMA 50/200 交叉、HMA 93 斜率或 SuperTrend 3/10。有效模型估计会从确认 K 线收盘价绘制绿色观察区和红色风险区，并以大号上下箭头标记方向；观察状态同时用于蜡烛着色。",
      },
      {
        title: "统计与提醒",
        content:
          "右上角表格显示训练样本量、模型移动估计、历史条件达标率、模型测算比率和当前观察状态。指标提供向上条件、向下条件、观察水平触及与场景失效四类一次性事件提醒。",
      },
    ],
    parameters: [
      {
        name: "趋势模式",
        defaultValue: "EMA Cross (Fast Slow)",
        description: "可切换为 HMA Increasing/Decreasing 或 SuperTrend。",
      },
      {
        name: "RBF 带宽",
        defaultValue: "5",
        description: "控制远距离训练样本的权重；源码允许的最小值为 2。",
      },
      {
        name: "历史预热",
        defaultValue: "1,000 根",
        description: "少于 1,000 根已确认分钟 K 线时仅显示预热进度，不产生模型估计图层或条件事件。",
      },
      {
        name: "颜色",
        defaultValue: "#00FFBB / #FF1100",
        description: "分别控制看涨目标、看跌风险、箭头和交易状态蜡烛的颜色。",
      },
    ],
    chartOutputs: [
      "绿色观察区 / 红色风险区",
      "上下方向标签",
      "交易状态蜡烛着色",
      "右上角指标统计表",
      "四类条件事件提醒",
    ],
    risks: [
      "模型只从当前标的已有历史样本估计移动幅度；样本少、行情状态改变或成交量数据异常时，模型估计可靠性会下降。",
      "本实现是指标：不生成订单、收益率或回测 PnL，观察区与风险区不构成投资建议。",
      "条件事件只在 K 线收盘后确认，因此会晚于盘中首次穿越，但不会因未收盘价格变化而反复消失。",
    ],
    source: {
      label: "Machine Learning Price Target Prediction Signals [AlgoAlpha]",
      url: "https://www.tradingview.com/script/3MHPrjD5-Machine-Learning-Price-Target-Prediction-Signals-AlgoAlpha/",
      license: "未声明软件许可证",
    },
  },
  {
    id: "ma",
    category: "indicator",
    title: "MA 移动平均线组合",
    subtitle: "同时观察多组收盘价算术平均线，用于辨认不同周期的趋势。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      {
        title: "计算含义",
        content: "MA 会将最近 N 个收盘价平均，每个价格的权重相同；系统默认同时显示 MA5/10/20/60。",
      },
      {
        title: "图表含义",
        content: "价格在均线上方或下方可用于观察趋势倾向；均线本身不直接构成买卖结论。",
      },
      { title: "常见局限", content: "横盘时价格会频繁穿越均线，容易出现噪声。" },
    ],
    parameters: [
      {
        name: "均线周期",
        defaultValue: "5 / 10 / 20 / 60",
        description: "每条线完成完整窗口预热后才开始显示。周期越大，曲线越平滑、反应越慢。",
      },
    ],
    chartOutputs: ["四条趋势均线"],
    risks: ["MA 是滞后指标，不预测未来。", "不同周期的含义不同，不能直接横向比较。"],
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
    parameters: [
      {
        name: "EMA 周期",
        defaultValue: "5 / 10 / 20 / 60",
        description: "系统同时显示四条 EMA；每个周期控制相应曲线的平滑程度和对最新价格的敏感度。",
      },
    ],
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
      {
        title: "计算含义",
        content: "布林带由中轨均线和上下波动带组成。带宽收缩通常表示波动减弱，扩张表示波动增大。",
      },
      { title: "图表含义", content: "价格靠近上下轨只能说明相对位置，不等于必然反转或必然突破。" },
      {
        title: "常见局限",
        content: "强趋势中价格可能长期贴近一侧轨道，因此不能把触及轨道直接理解为反向信号。",
      },
    ],
    parameters: [
      { name: "布林周期", defaultValue: "20", description: "中轨均线和波动统计使用的窗口长度。" },
      { name: "标准差倍数", defaultValue: "2", description: "控制上下轨与中轨之间的距离。" },
    ],
    chartOutputs: ["上轨", "中轨", "下轨"],
    risks: ["布林带描述波动，不提供确定方向。", "参数改变会明显影响带宽与观察结果。"],
  },
  {
    id: "bbi",
    category: "indicator",
    title: "BBI 多空指标",
    subtitle: "将多条不同周期的简单移动平均线再取平均，用一条线概括中短期趋势。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      {
        title: "计算含义",
        content: "系统分别计算 3、6、12、24 周期的 MA，并对四条均线取平均得到 BBI。",
      },
      {
        title: "图表含义",
        content:
          "价格与 BBI 的相对位置可用于观察趋势强弱；BBI 上扬或下行反映各周期均线的共同方向。",
      },
      {
        title: "常见局限",
        content: "BBI 仍由历史价格构成，在快速反转和横盘阶段会滞后或频繁交叉。",
      },
    ],
    parameters: [
      {
        name: "四组周期",
        defaultValue: "3 / 6 / 12 / 24",
        description: "分别控制参与平均的四条 MA；每个周期完成预热后才产生对应结果。",
      },
    ],
    chartOutputs: ["BBI 单线", "最新 BBI 图例数值"],
    risks: ["BBI 是趋势观察工具，不构成买卖指令。", "缩短周期会更灵敏，也会增加噪声。"],
  },
  {
    id: "ene",
    category: "indicator",
    title: "ENE 轨道线",
    subtitle: "以均线为中轨，按上下偏离百分比形成价格轨道，观察相对位置与波动区间。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      {
        title: "计算含义",
        content: "中轨为 N 周期 MA，上轨和下轨分别在中轨基础上按设定百分比上移、下移。",
      },
      {
        title: "图表含义",
        content: "系统绘制 UP、ENE、LOW 三条轨道；价格接近轨道仅说明相对偏离程度。",
      },
      {
        title: "常见局限",
        content: "固定百分比不能自动适应所有标的与波动状态，强趋势中价格可持续停留在轨道外侧。",
      },
    ],
    parameters: [
      { name: "周期", defaultValue: "10", description: "中轨 MA 的计算窗口。" },
      {
        name: "上下轨偏离",
        defaultValue: "11% / 9%",
        description: "分别控制上轨与下轨相对中轨的百分比距离。",
      },
    ],
    chartOutputs: ["UP 上轨", "ENE 中轨", "LOW 下轨"],
    risks: ["轨道突破不是确定反转或突破信号。", "参数应与标的波动特征一起复核。"],
  },
  {
    id: "sar",
    category: "indicator",
    title: "SAR 抛物线转向指标",
    subtitle: "用随趋势推进而加速的点状风险参考线，帮助观察趋势跟随与潜在转向。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "主图叠加",
    sections: [
      {
        title: "计算含义",
        content:
          "SAR 从起始加速因子出发，趋势延续时按步长增加，直至最大加速因子；反向穿越时重置方向。",
      },
      {
        title: "图表含义",
        content: "系统在主图绘制金色 SAR 点。点位在价格下方或上方用于描述当前跟踪方向。",
      },
      { title: "常见局限", content: "横盘与剧烈震荡会让 SAR 频繁翻转，造成连续的假转向。" },
    ],
    parameters: [
      {
        name: "加速因子",
        defaultValue: "起始 0.02 / 步长 0.02 / 最大 0.20",
        description: "决定 SAR 跟随价格收紧的初始速度、递增速度和上限。",
      },
    ],
    chartOutputs: ["SAR 点列", "最新 SAR 图例数值"],
    risks: [
      "SAR 不是固定风险控制线或自动交易规则。",
      "更高加速因子会更快跟随，也更易受短期波动影响。",
    ],
  },
  {
    id: "mavol",
    category: "indicator",
    title: "MAVOL 成交量均线",
    subtitle: "在成交量副图中叠加两条成交量均线，用于比较当前量能与近期平均水平。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      { title: "计算含义", content: "系统显示成交量柱，并计算两个周期的成交量简单移动平均线。" },
      {
        title: "图表含义",
        content: "上涨 K 线与下跌 K 线的成交量柱以不同颜色显示，MA5 和 MA10 用于观察量能变化。",
      },
      {
        title: "常见局限",
        content: "成交量的含义依赖市场、交易时段和标的流动性，不能脱离价格结构单独判断。",
      },
    ],
    parameters: [
      {
        name: "成交量均线周期",
        defaultValue: "5 / 10",
        description: "分别控制短期与长期成交量均线的平滑窗口。",
      },
    ],
    chartOutputs: ["VOL 成交量柱", "MA5", "MA10"],
    risks: [
      "异常大单或交易时段切换会扭曲短期均量。",
      "副图一次只显示一个技术指标，启用其他副图指标会替换它。",
    ],
  },
  {
    id: "macd",
    category: "indicator",
    title: "MACD 平滑异同移动平均线",
    subtitle: "比较快慢 EMA 的差值及其信号线，结合柱状图观察趋势动量变化。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      {
        title: "计算含义",
        content:
          "DIF 为快慢 EMA 的差值，DEA 为 DIF 的平滑线，柱状图为两者差值；系统按所选市场口径计算。",
      },
      {
        title: "图表含义",
        content: "副图显示 MACD 柱、DIF、DEA 和零轴，交叉与零轴位置可用于研究动量的变化。",
      },
      { title: "常见局限", content: "MACD 在趋势确认后才明显变化，震荡市中交叉信号可能较多。" },
    ],
    parameters: [
      {
        name: "快线 / 慢线 / 信号",
        defaultValue: "12 / 26 / 9",
        description: "分别控制两条 EMA 和 DEA 平滑的周期；周期越短，响应越快。",
      },
    ],
    chartOutputs: ["MACD 正负柱", "DIF", "DEA", "零轴"],
    risks: [
      "MACD 是滞后型动量指标，不预测未来。",
      "副图一次只显示一个技术指标，启用其他副图指标会替换它。",
    ],
  },
  {
    id: "vol",
    category: "indicator",
    title: "VOL 成交量",
    subtitle: "显示每根 K 线对应的成交量，以量能变化辅助阅读价格行为。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      {
        title: "计算含义",
        content: "系统直接使用行情 K 线的 volume 字段，并将非有限值按 0 处理。",
      },
      {
        title: "图表含义",
        content: "副图以柱状显示成交量；收盘不低于开盘的柱使用上涨色，反之使用下跌色。",
      },
      {
        title: "常见局限",
        content: "不同数据源和市场的成交量单位、口径可能不同，比较前应确认数据定义。",
      },
    ],
    parameters: [
      {
        name: "参数",
        defaultValue: "无",
        description: "当前 VOL 仅展示原始成交量，不提供可配置参数。",
      },
    ],
    chartOutputs: ["上涨 / 下跌成交量柱"],
    risks: [
      "零成交量不必然代表无交易，也可能是数据缺失或市场休市。",
      "副图一次只显示一个技术指标，启用其他副图指标会替换它。",
    ],
  },
  {
    id: "kdj",
    category: "indicator",
    title: "KDJ 随机指标",
    subtitle: "通过 RSV 及 K、D、J 三条平滑线，观察价格在近期高低区间中的位置与动量。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      {
        title: "计算含义",
        content: "RSV 衡量收盘价在 N 周期最高最低区间的位置；K 和 D 依次平滑，J 由 K、D 推导。",
      },
      { title: "图表含义", content: "副图绘制 K、D、J 三条线，线条位置和交叉可用于研究动量变化。" },
      {
        title: "常见局限",
        content: "超买超卖状态可以持续很久，尤其在强趋势中不宜仅据此逆势判断。",
      },
    ],
    parameters: [
      {
        name: "RSV / K / D",
        defaultValue: "9 / 3 / 3",
        description: "分别控制 RSV 窗口、K 平滑和 D 平滑的长度。",
      },
    ],
    chartOutputs: ["K 线", "D 线", "J 线"],
    risks: ["J 值的波动通常大于 K、D。", "副图一次只显示一个技术指标，启用其他副图指标会替换它。"],
  },
  {
    id: "rsi",
    category: "indicator",
    title: "RSI 相对强弱指标",
    subtitle: "比较指定周期内上涨与下跌幅度的相对强度，读取价格动量的区间位置。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      {
        title: "计算含义",
        content:
          "RSI 以平均上涨与平均下跌幅度计算，结果限定在 0 至 100；可同时显示最多三条有效周期线。",
      },
      {
        title: "图表含义",
        content: "跨市场口径使用 30/70 参考线；A 股口径使用 20/80，并默认显示 RSI6、RSI12、RSI24。",
      },
      { title: "常见局限", content: "RSI 高低位是相对动量描述，不能保证价格马上反转。" },
    ],
    parameters: [
      {
        name: "周期",
        defaultValue: "跨市场 14；A股 6 / 12 / 24",
        description: "设为 0 的附加周期不会显示；有效周期必须不小于 2。",
      },
    ],
    chartOutputs: ["RSI 曲线", "20/80 或 30/70 参考线"],
    risks: ["应按当前市场口径解读阈值。", "副图一次只显示一个技术指标，启用其他副图指标会替换它。"],
  },
  {
    id: "wr",
    category: "indicator",
    title: "WR 威廉指标",
    subtitle: "衡量收盘价在近期最高最低价区间内的相对位置，数值范围为 -100 至 0。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      {
        title: "计算含义",
        content: "WR 根据收盘价与 N 周期最高、最低价的距离计算；系统可显示两条有效周期线。",
      },
      {
        title: "图表含义",
        content: "副图提供 -80 与 -20 参考线，帮助观察区间位置，不等同于交易触发条件。",
      },
      { title: "常见局限", content: "强趋势中 WR 可以长期停留在极端区间，过早反向操作风险较高。" },
    ],
    parameters: [
      {
        name: "周期",
        defaultValue: "跨市场 14；A股 10 / 6",
        description: "设为 0 的第二周期不会显示；有效周期必须不小于 2。",
      },
    ],
    chartOutputs: ["WR 曲线", "-80 / -20 参考线"],
    risks: [
      "WR 为反向刻度，数值越接近 0 表示越接近区间高位。",
      "副图一次只显示一个技术指标，启用其他副图指标会替换它。",
    ],
  },
  {
    id: "cci",
    category: "indicator",
    title: "CCI 顺势指标",
    subtitle: "比较典型价格与其移动平均、平均偏差的距离，观察价格偏离常态的程度。",
    markets: ["美股", "港股", "A股"],
    timeframes: ["分时", "日线", "周线"],
    placement: "副图预留",
    sections: [
      {
        title: "计算含义",
        content: "CCI 以典型价格、N 周期均值和平均偏差计算，常数用于调整读数尺度。",
      },
      {
        title: "图表含义",
        content: "副图显示 CCI 线、零轴和 -100/100 参考线，用于研究偏离的方向与幅度。",
      },
      {
        title: "常见局限",
        content: "固定阈值对不同标的和周期的适用性不同，极端值不保证后续回归。",
      },
    ],
    parameters: [
      {
        name: "周期 / 常数",
        defaultValue: "14 / 0.015",
        description: "周期决定均值与平均偏差窗口，常数决定 CCI 的缩放。",
      },
    ],
    chartOutputs: ["CCI 曲线", "零轴", "-100 / 100 参考线"],
    risks: [
      "CCI 不宜被单独用作买卖依据。",
      "副图一次只显示一个技术指标，启用其他副图指标会替换它。",
    ],
  },
];
