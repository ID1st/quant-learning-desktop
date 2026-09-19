export const strategyLearningEnglishMessages: Readonly<Record<string, string>> = {
  "倍数 1/2/3": "Multiples 1/2/3",
  开启: "Enabled",
  纽约收盘: "New York close",
  "14 行 / 30%": "14 rows / 30%",
  "策略先用 Wilder ATR 构造递推收紧的 Supertrend 上下轨，取轨道中点后依次计算 WMA 与 EMA。平滑线斜率由负转正时识别上行趋势，由正转负时识别下行趋势。":
    "The strategy builds recursively tightening Supertrend bands with Wilder ATR, then applies WMA and EMA smoothing to their midpoint. A slope change from negative to positive identifies an uptrend; positive to negative identifies a downtrend.",
  拒绝与目标: "Rejections and targets",
  "K 线连续穿越当前趋势基准线超过确认次数后标记拒绝条件事件。最新趋势转变会按当根 K 线的 ATR 固定条件触发参考、风险线和三档观察水平，并以趋势颜色同步着色基准线与蜡烛。":
    "A rejection event is marked after bars cross the active trend baseline more than the confirmation count. The latest trend change fixes a reference, risk line, and three observation levels from that bar's ATR, while the baseline and candles use the trend color.",
  "适合用来研究趋势延续与回撤后的恢复。横盘或剧烈跳空阶段可能产生连续失效的条件事件。":
    "Useful for studying trend continuation and recovery after pullbacks. Sideways markets or large gaps may produce repeated invalidated events.",
  "因子 12 / ATR 90": "Factor 12 / ATR 90",
  "控制基础轨道宽度与波动平滑周期。":
    "Controls the base band width and volatility smoothing period.",
  双重平滑: "Double smoothing",
  "控制趋势基准线的平滑程度和拐点灵敏度。":
    "Controls baseline smoothness and sensitivity to turning points.",
  拒绝确认: "Rejection confirmation",
  "连续穿越趋势线超过该次数后显示拒绝标记。":
    "Shows a rejection marker after consecutive trend-line crossings exceed this count.",
  风险线与观察水平: "Risk line and observation levels",
  "风险线先确定模型风险距离，三档观察水平再按该距离计算。":
    "The risk line defines the model risk distance, which is then used to calculate three observation levels.",
  趋势颜色: "Trend colors",
  "分别控制上行、下行基准线、蜡烛、趋势转变和拒绝标记。":
    "Controls the uptrend and downtrend baseline, candles, trend changes, and rejection markers.",
  "上行/下行分段趋势基准线": "Segmented uptrend/downtrend baseline",
  趋势蜡烛着色: "Trend candle coloring",
  趋势转变箭头: "Trend-change arrows",
  连续拒绝标记: "Consecutive rejection markers",
  "条件触发参考 / 风险线 / 三档观察水平投影":
    "Event reference / risk line / three observation-level projections",
  "趋势指标有滞后性，不能避免突发消息或跳空风险。":
    "Trend indicators lag and cannot avoid news shocks or gap risk.",
  "观察水平是研究参考，不代表价格一定会触及。":
    "Observation levels are research references and do not imply that price will reach them.",
  市场结构: "Market structure",
  "内部结构用于观察较短波段，摆动结构用于识别更高层级方向。价格突破已确认枢轴时绘制 BOS；当突破方向与此前结构趋势相反时绘制 CHoCH，并同步标注 HH、HL、LH、LL 以及 Strong / Weak High / Low。":
    "Internal structure tracks shorter swings, while swing structure identifies higher-level direction. A BOS is drawn when price breaks a confirmed pivot; a CHoCH is drawn when the break opposes the prior structural trend, together with HH, HL, LH, LL, and Strong / Weak High / Low labels.",
  供需与失衡: "Supply, demand, and imbalance",
  "订单块从结构突破前的来源蜡烛提取，分为内部和摆动两级，并使用 ATR(200) 或累计均幅过滤异常波动。FVG 表示三根 K 线形成的价格失衡；订单块被价格失效、FVG 被回补后会从当前有效图层移除。":
    "Order blocks are derived from the source candle before a structural break, at internal and swing levels, with ATR(200) or cumulative mean range filtering abnormal volatility. An FVG represents a three-bar price imbalance; invalidated order blocks and filled FVGs are removed from active layers.",
  流动性与多周期: "Liquidity and multiple timeframes",
  "EQH / EQL 连接接近的已确认高点或低点，用于观察潜在流动性区域。前日、前周和前月高低点只读取已确认周期数据；Premium、Equilibrium、Discount 区域帮助描述价格在当前摆动区间中的相对位置。":
    "EQH / EQL connects nearby confirmed highs or lows to study potential liquidity areas. Previous-day, week, and month levels use confirmed period data only; Premium, Equilibrium, and Discount zones describe price's relative position within the active swing range.",
  显示模式: "Display mode",
  "Historical 保留受对象上限约束的历史结构；Present 只显示各类别最近的有效对象。可切换彩色或单色主题。":
    "Historical retains structures within object limits; Present shows only the latest active object in each category. Color and monochrome themes are available.",
  内部结构: "Internal structure",
  "全部 BOS / CHoCH": "All BOS / CHoCH",
  "控制较短层级结构、方向过滤、标签大小以及内部订单块的显示数量。":
    "Controls lower-level structures, direction filtering, label size, and the number of internal order blocks shown.",
  摆动结构: "Swing structure",
  "控制摆动枢轴、HH / HL / LH / LL、Strong / Weak High / Low 和摆动订单块。":
    "Controls swing pivots, HH / HL / LH / LL, Strong / Weak High / Low, and swing order blocks.",
  订单块过滤: "Order-block filter",
  "ATR 需要至少 200 根 K 线完成预热；不足时页面和图表明确显示“ATR 预热中”，不会静默切换算法。":
    "ATR requires at least 200 bars to warm up. Until then, the page and chart explicitly show ‘ATR warming up’ instead of silently switching algorithms.",
  "长度 3 / 阈值 0.1": "Length 3 / threshold 0.1",
  "用独立枢轴长度确认相近高低点；阈值越小，对价格接近程度的要求越严格。":
    "Uses an independent pivot length to confirm nearby highs and lows; a smaller threshold requires closer prices.",
  "关闭 / 自动阈值": "Off / automatic threshold",
  "开启后绘制看涨或看跌双区块，可选择图表周期或补充周期，并设置向右延伸长度。":
    "When enabled, draws paired bullish or bearish zones using either the chart or a supplemental timeframe, with configurable right extension.",
  多周期高低点: "Multi-timeframe highs and lows",
  "前日 / 前周 / 前月关闭": "Previous day / week / month off",
  "开启后只使用已经收盘确认的日、周、月数据，避免历史前视。":
    "When enabled, uses only closed and confirmed daily, weekly, and monthly data to avoid look-ahead bias.",
  趋势蜡烛: "Trend candles",
  "按当前 SMC 结构趋势为蜡烛着色；与其他图层冲突时由最高可见层级决定。":
    "Colors candles by the current SMC structural trend; the highest visible layer wins when layers conflict.",
  "内部 / 摆动 BOS 与 CHoCH": "Internal / swing BOS and CHoCH",
  "内部 / 摆动订单块": "Internal / swing order blocks",
  "FVG 失衡区": "FVG imbalance zones",
  "前日 / 前周 / 前月高低点": "Previous-day / week / month highs and lows",
  "16 类结构提醒": "16 structural alert types",
  "SMC 在本系统中是图层型指标：只产生结构、区域、提醒和事件统计，不生成交易、收益率或回测 PnL。":
    "SMC is a layer-based indicator in this system: it produces structures, zones, alerts, and event statistics, but no trades, returns, or backtest PnL.",
  "枢轴必须等待右侧K线确认，因此结构标记天然晚于极值出现；这是避免历史前视的必要条件。":
    "Pivots must wait for bars on the right to confirm, so structure markers naturally appear after the extreme; this is required to avoid historical look-ahead.",
  "枢轴必须等待右侧 K 线确认，因此结构标记天然晚于极值出现；这是避免历史前视的必要条件。":
    "Pivots must wait for bars on the right to confirm, so structure markers naturally appear after the extreme; this is required to avoid historical look-ahead.",
  "结构、订单块与流动性区域是研究解释，不等同于具体交易行动建议。":
    "Structures, order blocks, and liquidity zones are research interpretations, not specific trading recommendations.",
  "当前实现按 CC BY-NC-SA 4.0 用于本地非商业研究；商业发布需要另行取得授权。":
    "This implementation is for local non-commercial research under CC BY-NC-SA 4.0; commercial distribution requires separate authorization.",
  "以趋势段历史表现训练RBF核回归模型，估计下一段价格移动幅度，并在主图绘制观察区、风险区和确认条件事件。":
    "Train an RBF kernel regression model on historical trend-segment performance to estimate the next price move and draw observation zones, risk zones, and confirmed events on the main chart.",
  "以趋势段历史表现训练 RBF 核回归模型，估计下一段价格移动幅度，并在主图绘制观察区、风险区和确认条件事件。":
    "Train an RBF kernel regression model on historical trend-segment performance to estimate the next price move and draw observation zones, risk zones, and confirmed events on the main chart.",
  "实时 1 分钟": "Real-time 1 minute",
  模型如何形成估计: "How the model forms an estimate",
  "指标在每次趋势方向切换时记录上一趋势段的最大有利移动，并使用价格位置、波动变化、二阶变化、成交量振荡、震荡度、RSI 与趋势方向共 8 个特征。RBF 核函数会按特征距离为历史样本分配权重，输出下一趋势段的模型移动估计。":
    "At each trend-direction change, the indicator records the previous segment's maximum favorable move and uses eight features: price position, volatility change, second-order change, volume oscillator, choppiness, RSI, and trend direction. The RBF kernel weights historical samples by feature distance to estimate the next segment's move.",
  趋势与图层: "Trend and layers",
  "趋势可选择 EMA 50/200 交叉、HMA 93 斜率或 SuperTrend 3/10。有效模型估计会从确认 K 线收盘价绘制绿色观察区和红色风险区，并以大号上下箭头标记方向；观察状态同时用于蜡烛着色。":
    "Trend mode can use an EMA 50/200 crossover, HMA 93 slope, or SuperTrend 3/10. A valid estimate draws a green observation zone and red risk zone from the confirmed bar close, marks direction with large arrows, and colors candles by observation state.",
  统计与提醒: "Statistics and alerts",
  "右上角表格显示训练样本量、模型移动估计、历史条件达标率、模型测算比率和当前观察状态。指标提供向上条件、向下条件、观察水平触及与场景失效四类一次性事件提醒。":
    "The upper-right table shows training sample count, estimated move, historical condition success rate, model ratio, and current observation state. The indicator provides one-time events for upward conditions, downward conditions, observation-level touches, and scenario invalidation.",
  趋势模式: "Trend mode",
  "可切换为 HMA Increasing/Decreasing 或 SuperTrend。":
    "Can switch to HMA Increasing/Decreasing or SuperTrend.",
  "RBF 带宽": "RBF bandwidth",
  "控制远距离训练样本的权重；源码允许的最小值为2。":
    "Controls the weight of distant training samples; the source allows a minimum of 2.",
  "控制远距离训练样本的权重；源码允许的最小值为 2。":
    "Controls the weight of distant training samples; the source allows a minimum of 2.",
  历史预热: "Historical warmup",
  "1,000 根": "1,000 bars",
  "少于 1,000 根已确认分钟 K 线时仅显示预热进度，不产生模型估计图层或条件事件。":
    "With fewer than 1,000 confirmed minute bars, only warmup progress is shown; no model-estimate layers or events are produced.",
  颜色: "Colors",
  "分别控制看涨目标、看跌风险、箭头和交易状态蜡烛的颜色。":
    "Controls the colors of bullish targets, bearish risk, arrows, and state-colored candles.",
  "绿色观察区 / 红色风险区": "Green observation zone / red risk zone",
  上下方向标签: "Up/down direction labels",
  交易状态蜡烛着色: "State-based candle coloring",
  右上角指标统计表: "Upper-right indicator statistics table",
  四类条件事件提醒: "Four condition-event alert types",
  "模型只从当前标的已有历史样本估计移动幅度；样本少、行情状态改变或成交量数据异常时，模型估计可靠性会下降。":
    "The model estimates movement only from available history for the current instrument. Reliability declines with few samples, regime changes, or abnormal volume data.",
  "本实现是指标：不生成订单、收益率或回测 PnL，观察区与风险区不构成投资建议。":
    "This is an indicator: it produces no orders, returns, or backtest PnL, and its observation and risk zones are not investment advice.",
  "条件事件只在K线收盘后确认，因此会晚于盘中首次穿越，但不会因未收盘价格变化而反复消失。":
    "Condition events are confirmed only after bar close, so they appear after the first intrabar crossing but do not repeatedly disappear with unclosed price changes.",
  "条件事件只在 K 线收盘后确认，因此会晚于盘中首次穿越，但不会因未收盘价格变化而反复消失。":
    "Condition events are confirmed only after bar close, so they appear after the first intrabar crossing but do not repeatedly disappear with unclosed price changes.",
  计算含义: "Calculation",
  "MA 会将最近 N 个收盘价平均，每个价格的权重相同；系统默认同时显示 MA5/10/20/60。":
    "MA averages the latest N closes with equal weight; the system shows MA5/10/20/60 by default.",
  图表含义: "Chart interpretation",
  "价格在均线上方或下方可用于观察趋势倾向；均线本身不直接构成买卖结论。":
    "Price above or below a moving average can indicate trend bias; the average itself is not a buy or sell conclusion.",
  常见局限: "Common limitations",
  "横盘时价格会频繁穿越均线，容易出现噪声。":
    "In sideways markets, price frequently crosses moving averages and creates noise.",
  均线周期: "Moving-average periods",
  "每条线完成完整窗口预热后才开始显示。周期越大，曲线越平滑、反应越慢。":
    "Each line appears only after its full window warms up. Longer periods are smoother and slower to react.",
  四条趋势均线: "Four trend moving averages",
  "MA 是滞后指标，不预测未来。": "MA is a lagging indicator and does not predict the future.",
  "不同周期的含义不同，不能直接横向比较。":
    "Different periods have different meanings and should not be compared directly.",
  "EMA 会提高最近价格的权重，因此相比 SMA 更快响应价格变化。":
    "EMA gives more weight to recent prices and therefore responds faster than SMA.",
  "可以用于观察较短周期趋势、回踩和价格动量变化。":
    "It can be used to study shorter-term trends, pullbacks, and momentum changes.",
  "反应更快也意味着横盘时更容易被短期波动干扰。":
    "Faster response also means greater sensitivity to short-term noise in sideways markets.",
  "EMA 周期": "EMA periods",
  "系统同时显示四条EMA；每个周期控制相应曲线的平滑程度和对最新价格的敏感度。":
    "The system shows four EMAs; each period controls its line's smoothness and sensitivity to recent prices.",
  "系统同时显示四条 EMA；每个周期控制相应曲线的平滑程度和对最新价格的敏感度。":
    "The system shows four EMAs; each period controls its line's smoothness and sensitivity to recent prices.",
  指数趋势线: "Exponential trend lines",
  "EMA 对短期波动敏感，单独使用容易过度交易。":
    "EMA is sensitive to short-term fluctuations and may encourage overtrading when used alone.",
  "应结合价格结构和风险控制阅读。": "Read it together with price structure and risk controls.",
  "布林带由中轨均线和上下波动带组成。带宽收缩通常表示波动减弱，扩张表示波动增大。":
    "Bollinger Bands consist of a middle moving average and upper and lower volatility bands. Contracting width usually indicates lower volatility; expansion indicates higher volatility.",
  "价格靠近上下轨只能说明相对位置，不等于必然反转或必然突破。":
    "Price near a band shows relative position only; it does not guarantee a reversal or breakout.",
  "强趋势中价格可能长期贴近一侧轨道，因此不能把触及轨道直接理解为反向信号。":
    "In strong trends, price may stay near one band for a long time, so a band touch is not automatically a reversal signal.",
  布林周期: "Bollinger period",
  "中轨均线和波动统计使用的窗口长度。":
    "Window length used by the middle average and volatility calculation.",
  标准差倍数: "Standard-deviation multiplier",
  "控制上下轨与中轨之间的距离。":
    "Controls the distance between the outer bands and the middle band.",
  上轨: "Upper band",
  中轨: "Middle band",
  下轨: "Lower band",
  "布林带描述波动，不提供确定方向。":
    "Bollinger Bands describe volatility, not a certain direction.",
  "参数改变会明显影响带宽与观察结果。":
    "Parameter changes can materially affect band width and observations.",
  "系统分别计算 3、6、12、24 周期的 MA，并对四条均线取平均得到 BBI。":
    "The system calculates 3-, 6-, 12-, and 24-period MAs and averages them to produce BBI.",
  "价格与 BBI 的相对位置可用于观察趋势强弱；BBI 上扬或下行反映各周期均线的共同方向。":
    "Price's position relative to BBI can show trend strength; a rising or falling BBI reflects the shared direction of its component averages.",
  "BBI 仍由历史价格构成，在快速反转和横盘阶段会滞后或频繁交叉。":
    "BBI is still based on historical prices and may lag during sharp reversals or cross frequently in sideways markets.",
  四组周期: "Four periods",
  "分别控制参与平均的四条 MA；每个周期完成预热后才产生对应结果。":
    "Controls the four MAs included in the average; each produces results only after its warmup completes.",
  "BBI 单线": "BBI line",
  "最新 BBI 图例数值": "Latest BBI legend value",
  "BBI 是趋势观察工具，不构成买卖指令。":
    "BBI is a trend-analysis tool, not a trading instruction.",
  "缩短周期会更灵敏，也会增加噪声。": "Shorter periods increase sensitivity as well as noise.",
  "中轨为 N 周期 MA，上轨和下轨分别在中轨基础上按设定百分比上移、下移。":
    "The middle line is an N-period MA; the upper and lower lines offset it by configured percentages.",
  "系统绘制 UP、ENE、LOW 三条轨道；价格接近轨道仅说明相对偏离程度。":
    "The system draws UP, ENE, and LOW lines; proximity to a line indicates relative deviation only.",
  "固定百分比不能自动适应所有标的与波动状态，强趋势中价格可持续停留在轨道外侧。":
    "Fixed percentages cannot adapt automatically to every instrument or volatility regime, and price may remain outside the envelope in a strong trend.",
  周期: "Period",
  "中轨 MA 的计算窗口。": "Calculation window for the middle MA.",
  上下轨偏离: "Upper/lower offsets",
  "分别控制上轨与下轨相对中轨的百分比距离。":
    "Controls the percentage distance of the upper and lower lines from the middle line.",
  "UP 上轨": "UP upper line",
  "ENE 中轨": "ENE middle line",
  "LOW 下轨": "LOW lower line",
  "轨道突破不是确定反转或突破信号。":
    "An envelope break is not a certain reversal or breakout signal.",
  "参数应与标的波动特征一起复核。":
    "Review parameters together with the instrument's volatility characteristics.",
  "SAR 从起始加速因子出发，趋势延续时按步长增加，直至最大加速因子；反向穿越时重置方向。":
    "SAR starts from an initial acceleration factor, increases it by the step as the trend continues up to the maximum, and resets direction on a reverse crossing.",
  "系统在主图绘制金色 SAR 点。点位在价格下方或上方用于描述当前跟踪方向。":
    "The system draws gold SAR dots on the main chart. Dots below or above price describe the active tracking direction.",
  "横盘与剧烈震荡会让 SAR 频繁翻转，造成连续的假转向。":
    "Sideways or highly volatile markets can make SAR flip frequently and create repeated false reversals.",
  加速因子: "Acceleration factor",
  "起始 0.02 / 步长 0.02 / 最大 0.20": "Start 0.02 / step 0.02 / maximum 0.20",
  "决定 SAR 跟随价格收紧的初始速度、递增速度和上限。":
    "Determines the initial speed, increment, and maximum rate at which SAR tightens toward price.",
  "SAR 点列": "SAR dots",
  "最新 SAR 图例数值": "Latest SAR legend value",
  "SAR 不是固定风险控制线或自动交易规则。":
    "SAR is not a fixed risk-control line or automated trading rule.",
  "更高加速因子会更快跟随，也更易受短期波动影响。":
    "A higher acceleration factor follows faster but is more sensitive to short-term fluctuations.",
  "系统显示成交量柱，并计算两个周期的成交量简单移动平均线。":
    "The system shows volume bars and calculates two simple moving averages of volume.",
  "上涨 K 线与下跌 K 线的成交量柱以不同颜色显示，MA5 和 MA10 用于观察量能变化。":
    "Volume bars use different colors for up and down candles, while MA5 and MA10 show changes in activity.",
  "成交量的含义依赖市场、交易时段和标的流动性，不能脱离价格结构单独判断。":
    "Volume depends on the market, trading session, and instrument liquidity and should not be interpreted without price structure.",
  成交量均线周期: "Volume moving-average periods",
  "分别控制短期与长期成交量均线的平滑窗口。":
    "Controls the smoothing windows for the short- and long-term volume averages.",
  "VOL 成交量柱": "VOL volume bars",
  "异常大单或交易时段切换会扭曲短期均量。":
    "Unusually large orders or session changes can distort short-term average volume.",
  "副图一次只显示一个技术指标，启用其他副图指标会替换它。":
    "The indicator pane shows one technical indicator at a time; enabling another pane indicator replaces it.",
  "DIF 为快慢 EMA 的差值，DEA 为 DIF 的平滑线，柱状图为两者差值；系统按所选市场口径计算。":
    "DIF is the difference between fast and slow EMAs, DEA is the smoothed DIF, and the histogram is their difference; the system calculates them using the selected market convention.",
  "副图显示 MACD 柱、DIF、DEA 和零轴，交叉与零轴位置可用于研究动量的变化。":
    "The pane shows the MACD histogram, DIF, DEA, and zero line; crossings and zero-line position help study momentum changes.",
  "MACD 在趋势确认后才明显变化，震荡市中交叉信号可能较多。":
    "MACD changes become clear only after trend confirmation, and ranging markets may produce many crossings.",
  "快线 / 慢线 / 信号": "Fast / slow / signal",
  "分别控制两条 EMA 和 DEA 平滑的周期；周期越短，响应越快。":
    "Controls the two EMA periods and DEA smoothing; shorter periods respond faster.",
  "MACD 正负柱": "Positive/negative MACD histogram",
  零轴: "Zero line",
  "MACD 是滞后型动量指标，不预测未来。":
    "MACD is a lagging momentum indicator and does not predict the future.",
  "系统直接使用行情 K 线的 volume 字段，并将非有限值按 0 处理。":
    "The system uses the market bar's volume field directly and treats non-finite values as zero.",
  "副图以柱状显示成交量；收盘不低于开盘的柱使用上涨色，反之使用下跌色。":
    "The pane shows volume bars; bars whose close is not below the open use the up color, otherwise the down color.",
  "不同数据源和市场的成交量单位、口径可能不同，比较前应确认数据定义。":
    "Volume units and conventions may differ across data sources and markets; confirm definitions before comparing.",
  无: "None",
  "当前VOL仅展示原始成交量，不提供可配置参数。":
    "VOL currently shows raw volume only and has no configurable parameters.",
  "当前 VOL 仅展示原始成交量，不提供可配置参数。":
    "VOL currently shows raw volume only and has no configurable parameters.",
  "上涨 / 下跌成交量柱": "Up/down volume bars",
  "零成交量不必然代表无交易，也可能是数据缺失或市场休市。":
    "Zero volume does not necessarily mean no trading; it may indicate missing data or a market closure.",
  "RSV 衡量收盘价在 N 周期最高最低区间的位置；K 和 D 依次平滑，J 由 K、D 推导。":
    "RSV measures the close's position within the N-period high-low range; K and D are sequentially smoothed, and J is derived from K and D.",
  "副图绘制 K、D、J 三条线，线条位置和交叉可用于研究动量变化。":
    "The pane draws K, D, and J lines; their positions and crossings help study momentum changes.",
  "超买超卖状态可以持续很久，尤其在强趋势中不宜仅据此逆势判断。":
    "Overbought or oversold conditions can persist, especially in strong trends, so they should not be used alone for countertrend decisions.",
  "分别控制 RSV 窗口、K 平滑和 D 平滑的长度。":
    "Controls the RSV window and the K and D smoothing lengths.",
  "K 线": "K line",
  "D 线": "D line",
  "J 线": "J line",
  "J 值的波动通常大于 K、D。": "J usually fluctuates more than K and D.",
  "RSI 以平均上涨与平均下跌幅度计算，结果限定在 0 至 100；可同时显示最多三条有效周期线。":
    "RSI compares average gains and losses on a 0-to-100 scale; up to three valid period lines can be shown.",
  "跨市场口径使用 30/70 参考线；A 股口径使用 20/80，并默认显示 RSI6、RSI12、RSI24。":
    "The cross-market convention uses 30/70 reference lines; the A-share convention uses 20/80 and shows RSI6, RSI12, and RSI24 by default.",
  "RSI 高低位是相对动量描述，不能保证价格马上反转。":
    "High or low RSI describes relative momentum and does not guarantee an immediate reversal.",
  "跨市场 14；A股 6 / 12 / 24": "Cross-market 14; A-shares 6 / 12 / 24",
  "设为0的附加周期不会显示；有效周期必须不小于2。":
    "Additional periods set to 0 are hidden; valid periods must be at least 2.",
  "设为 0 的附加周期不会显示；有效周期必须不小于 2。":
    "Additional periods set to 0 are hidden; valid periods must be at least 2.",
  "RSI 曲线": "RSI lines",
  "20/80 或 30/70 参考线": "20/80 or 30/70 reference lines",
  "应按当前市场口径解读阈值。": "Interpret thresholds using the active market convention.",
  "WR 根据收盘价与 N 周期最高、最低价的距离计算；系统可显示两条有效周期线。":
    "WR uses the close's distance from the N-period high and low; the system can show two valid period lines.",
  "副图提供 -80 与 -20 参考线，帮助观察区间位置，不等同于交易触发条件。":
    "The pane provides -80 and -20 reference lines to show range position; they are not trade triggers.",
  "强趋势中 WR 可以长期停留在极端区间，过早反向操作风险较高。":
    "WR may remain extreme for a long time in a strong trend, making premature countertrend action risky.",
  "跨市场 14；A股 10 / 6": "Cross-market 14; A-shares 10 / 6",
  "设为0的第二周期不会显示；有效周期必须不小于2。":
    "A second period set to 0 is hidden; valid periods must be at least 2.",
  "设为 0 的第二周期不会显示；有效周期必须不小于 2。":
    "A second period set to 0 is hidden; valid periods must be at least 2.",
  "WR 曲线": "WR lines",
  "-80 / -20 参考线": "-80 / -20 reference lines",
  "WR 为反向刻度，数值越接近 0 表示越接近区间高位。":
    "WR uses an inverse scale; values nearer 0 indicate a position nearer the range high.",
  "CCI 以典型价格、N 周期均值和平均偏差计算，常数用于调整读数尺度。":
    "CCI uses typical price, its N-period mean, and mean deviation; a constant scales the reading.",
  "副图显示 CCI 线、零轴和 -100/100 参考线，用于研究偏离的方向与幅度。":
    "The pane shows the CCI line, zero line, and -100/100 references to study the direction and magnitude of deviation.",
  "固定阈值对不同标的和周期的适用性不同，极端值不保证后续回归。":
    "Fixed thresholds vary in usefulness across instruments and timeframes; extreme readings do not guarantee mean reversion.",
  "周期 / 常数": "Period / constant",
  "周期决定均值与平均偏差窗口，常数决定CCI的缩放。":
    "The period defines the mean and mean-deviation window; the constant defines CCI scaling.",
  "周期决定均值与平均偏差窗口，常数决定 CCI 的缩放。":
    "The period defines the mean and mean-deviation window; the constant defines CCI scaling.",
  "CCI 曲线": "CCI line",
  "-100 / 100 参考线": "-100 / 100 reference lines",
  "CCI 不宜被单独用作买卖依据。": "CCI should not be used alone as a basis for trading.",
};
