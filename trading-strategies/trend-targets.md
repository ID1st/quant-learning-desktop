indicator("Trend Targets [AlgoAlpha]", "趋势目标 [AlgoAlpha]", overlay = true)

// 趋势设置
st_factor = input.float(12, title="Supertrend 因子", minval=1, step=0.5, group="趋势设置", 
     tooltip="用于计算 Supertrend 带宽度的 ATR 倍数。数值越大，带宽越宽，信号越少。")
st_atr_period = input.int(90, title="Supertrend ATR 周期", minval=1, group="趋势设置", 
     tooltip="计算 Supertrend 所用 ATR 的周期数。周期越长，带越平滑，反应越不灵敏。")
wma_length = input.int(40, title="WMA 长度", minval=1, group="趋势设置", 
     tooltip="应用于 SuperTrend 的加权移动平均线长度。数值越大，线越平滑，反应越不灵敏。")
ema_length = input.int(14, title="EMA 长度", minval=1, group="趋势设置", 
     tooltip="应用于 WMA 的指数移动平均线长度。控制趋势线的最终平滑度。")

// 延续信号设置
cont_factor = input.int(3, title="确认次数", minval=1, group="拒绝信号设置", 
     tooltip="在趋势线处连续盘整的 K 线数量，达到该数量后触发拒绝信号。数值越大，确认所需的 K 线越多。")

// 波动率设置
shw_TP1 = input.bool(true, title="显示止盈水平", group="目标设置", 
     tooltip="切换图表上止盈目标水平的可见性。")
atr_period = input.int(14, title="波动率 (ATR) 周期", minval=1, group="目标设置", 
     tooltip="用于计算平均真实波幅的周期数，用于仓位大小和目标计算。")
sl_multiplier = input.float(5, title="止损 ATR 倍数", minval=0.1, step=0.1, group="目标设置", 
     tooltip="应用于 ATR 的倍数，用于确定距入场价的止损距离。数值越大，止损越远。")
tp1_multiplier = input.float(0.5, title="目标1 倍数", minval=0.1, step=0.1, tooltip="相对于止损距离的第一止盈目标倍数。", group="目标设置")
tp2_multiplier = input.float(1.0, title="目标2 倍数", minval=0.1, step=0.1, tooltip="相对于止损距离的第二止盈目标倍数。", group="目标设置")
tp3_multiplier = input.float(1.5, title="目标3 倍数", minval=0.1, step=0.1, tooltip="相对于止损距离的第三止盈目标倍数。", group="目标设置")

volatility = ta.atr(atr_period)
// 外观设置
green = input.color(#00ffbb, title="多头颜色", tooltip="多头趋势使用的颜色", group="外观设置")
red = input.color(#ff1100, title="空头颜色", tooltip="空头趋势使用的颜色", group="外观设置")


pine_supertrend(factor, atrPeriod) =>
    src = hl2
    atr = ta.atr(atrPeriod)
    upperBand = src + factor * atr
    lowerBand = src - factor * atr
    prevLowerBand = nz(lowerBand[1])
    prevUpperBand = nz(upperBand[1])

    lowerBand := lowerBand > prevLowerBand or close[1] < prevLowerBand ? lowerBand : prevLowerBand
    upperBand := upperBand < prevUpperBand or close[1] > prevUpperBand ? upperBand : prevUpperBand

    [lowerBand, upperBand]

[lwr, upr] = pine_supertrend(st_factor, st_atr_period)
tL = ta.ema(ta.wma(math.avg(lwr, upr), wma_length), ema_length)

var trend = 0
if ta.crossover(tL, tL[1])
    trend := 1
if ta.crossunder(tL, tL[1])
    trend := -1
      
var rejcount = 0

bullishrej = trend == 1 and high > tL and low < tL
bearishrej = trend == -1 and high > tL and low < tL

if (bullishrej or bearishrej)
    rejcount += 1

if ta.cross(trend, 0) or (not (bullishrej or bearishrej) and rejcount > 0)
    rejcount := 0

plotchar((rejcount > cont_factor and trend == 1) ? tL  : na, "多头拒绝信号", "▲", location.belowbar, green, size = size.tiny)
plotchar((rejcount > cont_factor and trend == -1) ? tL  : na, "空头拒绝信号", "▼", location.abovebar, red, size = size.tiny)

plot(tL, "基准线", color=trend == 1 ? color.new(green, 50) : color.new(red, 50))

barcolor(trend == 1 ? color.new(green, 50) : color.new(red, 50))

plotshape(ta.crossover(tL, tL[1]) ? tL : na, title="多头趋势转变", style=shape.labelup, location=location.absolute, size=size.small, color=green)
plotshape(ta.crossunder(tL, tL[1]) ? tL : na, title="空头趋势转变", style=shape.labeldown, location=location.absolute, size=size.small, color=red)

longSignal = ta.crossover(trend, 0)
shortSignal = ta.crossunder(trend, 0)
var SL = 0.0
var TP1_lvl = 0.0
var TP2_lvl = 0.0
var TP3_lvl = 0.0
var line entry_line = na
var line sl_line = na
var line tp1_line = na
var line tp2_line = na
var line tp3_line = na 
var label entry_label = na
var label sl_label = na
var label tp1_label = na
var label tp2_label = na
var label tp3_label = na

if longSignal and shw_TP1 
    SL := low - volatility * sl_multiplier
    TP1_lvl := close + math.abs(close - SL) * tp1_multiplier
    TP2_lvl := close + math.abs(close - SL) * tp2_multiplier
    TP3_lvl := close + math.abs(close - SL) * tp3_multiplier
    entry_line := line.new(bar_index, close, bar_index, close, color = green, width = 3)
    entry_label := label.new(bar_index, close, text = "入场 ▸ " + str.tostring(close, format.mintick), style = label.style_label_left, color = green, textcolor = color.white)

    sl_line := line.new(bar_index, SL, bar_index, SL, color = color.new(red, 80), width = 3)
    sl_label := label.new(bar_index, SL, text = "✘ 止损 ▸ " + str.tostring(SL, format.mintick), style = label.style_label_left, color = color.new(red, 80), textcolor = color.white)

    tp1_line := line.new(bar_index, TP1_lvl, bar_index, TP1_lvl, color = color.new(green, 80), width = 3)
    tp1_label := label.new(bar_index, TP1_lvl, text = " ✔ 目标1 ▸ " + str.tostring(TP1_lvl, format.mintick), style = label.style_label_left, color = color.new(green, 80), textcolor = color.white)

    tp2_line := line.new(bar_index, TP2_lvl, bar_index, TP2_lvl, color = color.new(green, 80), width = 3)
    tp2_label := label.new(bar_index, TP2_lvl, text = " ✔ 目标2 ▸ " + str.tostring(TP2_lvl, format.mintick), style = label.style_label_left, color = color.new(green, 80), textcolor = color.white)

    tp3_line := line.new(bar_index, TP3_lvl, bar_index, TP3_lvl, color = color.new(green, 80), width = 3)
    tp3_label := label.new(bar_index, TP3_lvl, text = " ✔ 目标3 ▸ " + str.tostring(TP3_lvl, format.mintick), style = label.style_label_left, color = color.new(green, 80), textcolor = color.white)


    line.delete(entry_line[1])
    label.delete(entry_label[1])

    line.delete(sl_line[1])
    label.delete(sl_label[1])

    line.delete(tp1_line[1])
    label.delete(tp1_label[1])
    
    line.delete(tp2_line[1])
    label.delete(tp2_label[1])

    line.delete(tp3_line[1])
    label.delete(tp3_label[1])
else 
    line.set_x2(entry_line, bar_index)
    label.set_x(entry_label, bar_index)

    line.set_x2(sl_line, bar_index)
    label.set_x(sl_label, bar_index)

    line.set_x2(tp1_line, bar_index)
    label.set_x(tp1_label, bar_index)

    line.set_x2(tp2_line, bar_index)
    label.set_x(tp2_label, bar_index)

    line.set_x2(tp3_line, bar_index)
    label.set_x(tp3_label, bar_index)

if shortSignal and shw_TP1 
    SL := high + volatility * sl_multiplier
    TP1_lvl := close - math.abs(close - SL) * tp1_multiplier
    TP2_lvl := close - math.abs(close - SL) * tp2_multiplier
    TP3_lvl := close - math.abs(close - SL) * tp3_multiplier
    entry_line := line.new(bar_index, close, bar_index, close, color = red, width = 3)
    entry_label := label.new(bar_index, close, text = "入场 ▸ " + str.tostring(close, format.mintick), style = label.style_label_left, color = red, textcolor = color.white)

    sl_line := line.new(bar_index, SL, bar_index, SL, color = color.new(red, 80), width = 3)
    sl_label := label.new(bar_index, SL, text = "✘ 止损 ▸ " + str.tostring(SL, format.mintick), style = label.style_label_left, color = color.new(red, 80), textcolor = color.white)

    tp1_line := line.new(bar_index, TP1_lvl, bar_index, TP1_lvl, color = color.new(green, 80), width = 3)
    tp1_label := label.new(bar_index, TP1_lvl, text = " ✔ 目标1 ▸ " + str.tostring(TP1_lvl, format.mintick), style = label.style_label_left, color = color.new(green, 80), textcolor = color.white)

    tp2_line := line.new(bar_index, TP2_lvl, bar_index, TP2_lvl, color = color.new(green, 80), width = 3)
    tp2_label := label.new(bar_index, TP2_lvl, text = " ✔ 目标2 ▸ " + str.tostring(TP2_lvl, format.mintick), style = label.style_label_left, color = color.new(green, 80), textcolor = color.white)

    tp3_line := line.new(bar_index, TP3_lvl, bar_index, TP3_lvl, color = color.new(green, 80), width = 3)
    tp3_label := label.new(bar_index, TP3_lvl, text = " ✔ 目标3 ▸ " + str.tostring(TP3_lvl, format.mintick), style = label.style_label_left, color = color.new(green, 80), textcolor = color.white)


    line.delete(entry_line[1])
    label.delete(entry_label[1])

    line.delete(sl_line[1])
    label.delete(sl_label[1])

    line.delete(tp1_line[1])
    label.delete(tp1_label[1])
    
    line.delete(tp2_line[1])
    label.delete(tp2_label[1])

    line.delete(tp3_line[1])
    label.delete(tp3_label[1])
else 
    line.set_x2(entry_line, bar_index+40)
    label.set_x(entry_label, bar_index+40)

    line.set_x2(sl_line, bar_index+40)
    label.set_x(sl_label, bar_index+40)

    line.set_x2(tp1_line, bar_index+40)
    label.set_x(tp1_label, bar_index+40)

    line.set_x2(tp2_line, bar_index+40)
    label.set_x(tp2_label, bar_index+40)

    line.set_x2(tp3_line, bar_index+40)
    label.set_x(tp3_label, bar_index+40)

liness = array.new_linefill()

liness.unshift(linefill.new(entry_line, sl_line, color.new(color.red, 95)))
liness.unshift(linefill.new(entry_line, tp3_line, color.new(color.green, 95)))


// 趋势转变警报
alertcondition(ta.crossover(close, SL), title="趋势转变：多头", message="价格上穿止损线 - 潜在多头趋势")
alertcondition(ta.crossunder(close, SL), title="趋势转变：空头", message="价格下穿止损线 - 潜在空头趋势")

// 拒绝信号警报
alertcondition(ta.crossover(high, SL) and close < SL, title="拒绝信号：空头", message="价格在止损线被拒绝 - 空头拒绝信号")
alertcondition(ta.crossunder(low, SL) and close > SL, title="拒绝信号：多头", message="价格在止损线被拒绝 - 多头拒绝信号")

// 目标触及警报
alertcondition(ta.crossover(close, TP1_lvl), title="目标1 触及", message="价格达到目标1水平")
alertcondition(ta.crossover(close, TP2_lvl), title="目标2 触及", message="价格达到目标2水平")
alertcondition(ta.crossover(close, TP3_lvl), title="目标3 触及", message="价格达到目标3水平")
