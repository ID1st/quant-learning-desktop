indicator("Ultimate Opening Range Breakout [LuxAlgo]", shorttitle = "开盘区间突破 [LuxAlgo]", overlay = true, max_labels_count = 500, max_lines_count = 500, max_boxes_count = 500)

//---------------------------------------------------------------------------------------------------------------------}
// 常量
//---------------------------------------------------------------------------------------------------------------------{
DATA                    = #DBDBDB
HEADERS                 = #808080
BACKGROUND              = #161616
BORDERS                 = #2E2E2E

TOP_RIGHT               = '右上角'
BOTTOM_RIGHT            = '右下角'
BOTTOM_LEFT             = '左下角'

TINY                    = '极小'
SMALL                   = '小'
NORMAL                  = '中'
LARGE                   = '大'
HUGE                    = '极大'

DASHBOARD_GROUP         = '仪表盘'

dashboardTooltip        = '启用或禁用仪表盘。'
dashboardPositionTooltip= '选择仪表盘显示位置。'
dashboardSizeTooltip    = '选择仪表盘尺寸。'

//---------------------------------------------------------------------------------------------------------------------}
// 输入参数
//---------------------------------------------------------------------------------------------------------------------{
sessionInput            = input.session("0930-1000", "开盘区间时段", tooltip = "定义开盘区间的计算时段。格式：HHMM-HHMM")
sessionDays             = input.string("1234567", "每周天数", tooltip = "选择开盘区间适用的日期（1=周日，7=周六）")
timezoneInput           = input.string("UTC-5", "时区", options = ["UTC-12", "UTC-11", "UTC-10", "UTC-9", "UTC-8", "UTC-7", "UTC-6", "UTC-5", "UTC-4", "UTC-3", "UTC-2", "UTC-1", "UTC+0", "UTC+1", "UTC+2", "UTC+3", "UTC+4", "UTC+5", "UTC+6", "UTC+7", "UTC+8", "UTC+9", "UTC+10", "UTC+11", "UTC+12"], tooltip = "调整会话输入的时区。")

srcInput                = input.string("High/Low", "范围来源", options = ["High/Low", "Close"], tooltip = "使用时段的最高/最低价或收盘价来定义区间范围。")
showExtensions          = input.bool(true, "显示扩展水平", group = "扩展设置")
extType                 = input.string("Multiples", "扩展类型", options = ["Multiples", "Fibonacci"], group = "扩展设置")
mult1                   = input.float(1.0, "倍数 1", minval = 0, group = "扩展设置")
mult2                   = input.float(2.0, "倍数 2", minval = 0, group = "扩展设置")
mult3                   = input.float(3.0, "倍数 3", minval = 0, group = "扩展设置")

bullColor               = input.color(#089981, "多头颜色", group = "样式", inline = "颜色")
bearColor               = input.color(#f23645, "空头颜色", group = "样式", inline = "颜色")
neutralColor            = input.color(#5b9cf6, "区间颜色", group = "样式", inline = "颜色")
bgTransp                = input.int(85, "背景透明度", minval = 0, maxval = 100, group = "样式")
showLabels              = input.bool(true, "显示水平标签", group = "样式")
sigLabelSize            = input.string("Small", "信号标签大小", options = ["Tiny", "Small", "Normal", "Large"], group = "样式")

showVP                  = input.bool(true, "显示成交量分布", group = "成交量分布")
vpRowsInput             = input.int(14, "行数", minval = 5, maxval = 50, group = "成交量分布", tooltip = "将开盘区间划分成的块数。数值越低，分布越「块状」。")
vpWidth                 = input.int(30, "分布宽度 (%)", minval = 1, maxval = 100, group = "成交量分布", tooltip = "成交量分布相对于开盘区间时段的宽度百分比。")
vpColor                 = input.color(color.new(#5b9cf6, 60), "分布颜色", group = "成交量分布")

stopPlotting            = input.bool(true, "限制绘制时长", group = "绘制时长")
stopTimeType            = input.string("New York Close", "结束绘制于", options = ["New York Close", "London Close", "Manual Time", "End of Day"], group = "绘制时长", tooltip = "选择何时停止在图表上绘制水平线。")
manualEndTime           = input.string("16:00", "手动结束时间 (HH:MM)", group = "绘制时长", tooltip = "格式：HH:MM。在选择了「手动时间」时使用。")

showTrail               = input.bool(false, "显示移动止损", group = "移动止损")
trailMult               = input.float(2.0, "ATR 倍数", minval = 0.1, step = 0.1, group = "移动止损", tooltip = "基于 ATR 的移动止损倍数。")
trailAtrLen             = input.int(14, "ATR 长度", minval = 1, group = "移动止损")

dashboardInput          = input.bool(true, '显示命中率仪表盘', group = DASHBOARD_GROUP, tooltip = dashboardTooltip)
showOptimizer           = input.bool(false, '显示止损优化器', group = DASHBOARD_GROUP, tooltip = "模拟不同的 ATR 倍数以寻找最优止损距离。")
dashboardPositionInput  = input.string(TOP_RIGHT, '位置', group = DASHBOARD_GROUP, tooltip = dashboardPositionTooltip, options = [TOP_RIGHT, BOTTOM_RIGHT, BOTTOM_LEFT])
dashboardSizeInput      = input.string(SMALL, '尺寸', group = DASHBOARD_GROUP, tooltip = dashboardSizeTooltip, options = [TINY, SMALL, NORMAL, LARGE, HUGE])

//---------------------------------------------------------------------------------------------------------------------}
// 变量
//---------------------------------------------------------------------------------------------------------------------{
var parsedDashboardPosition = switch dashboardPositionInput
    TOP_RIGHT       => position.top_right
    BOTTOM_RIGHT    => position.bottom_right
    BOTTOM_LEFT     => position.bottom_left

var parsedDashboardSize     = switch dashboardSizeInput
    TINY            => size.tiny
    SMALL           => size.small
    NORMAL          => size.normal
    LARGE           => size.large
    HUGE            => size.huge

atrVal = ta.atr(200)
var float dynamicTickSize = na

inSession = not na(time(timeframe.period, sessionInput + ":" + sessionDays, timezoneInput))
isNewDay  = ta.change(time("D", "", timezoneInput)) != 0

var float orHigh = na
var float orLow  = na
var bool  sessionEnded = false

var int totalSessions = 0
var int countU1 = 0
var int countU2 = 0
var int countU3 = 0
var int countD1 = 0
var int countD2 = 0
var int countD3 = 0

var bool dayReachedU1 = false
var bool dayReachedU2 = false
var bool dayReachedU3 = false
var bool dayReachedD1 = false
var bool dayReachedD2 = false
var bool dayReachedD3 = false

var map<float, float> volMap = map.new<float, float>()
var int sessionStartBar = 0
var int profileAnchor = 0
var box[] activeVPBoxes = array.new_box()

var float totalProfit = 0.0
var float entryPrice  = na

var float[] optProfits = array.from(0.0, 0.0, 0.0, 0.0, 0.0)
var float[] optMults   = array.from(1.0, 1.5, 2.0, 2.5, 3.0)
var float[] optStops   = array.new_float(5, na)
var int[] optActive    = array.new_int(5, 0) // 0: Idle, 1: Active Bull, -1: Active Bear

var float trailStop = na
var int activeDir = 0 // 1: Bull, -1: Bear, 0: None

var bool canSignalUp = true
var bool canSignalDn = true

//---------------------------------------------------------------------------------------------------------------------}
// 辅助函数
//---------------------------------------------------------------------------------------------------------------------{
cell(table t_able, int column, int row, string data, color = #FFFFFF, align = text.align_right, color background = na, float height = 0) => 
    t_able.cell(column, row, data, text_color = color, text_size = parsedDashboardSize, text_halign = align, bgcolor = background, height = height)

divider(table t_able, int row, int lastColumn) =>    
    string rowDivider = '━━━━━━━━━━━━━━'
    t_able.merge_cells(0, row, lastColumn, row)
    cell(t_able, 0, row, rowDivider, align = text.align_center, height = 0.5, color = BORDERS)

getExt(float multVal, float rangeVal, float highLvl, float lowLvl) =>
    float up = highLvl + rangeVal * multVal
    float dn = lowLvl - rangeVal * multVal
    [up, dn]

//---------------------------------------------------------------------------------------------------------------------}
// 核心逻辑
//---------------------------------------------------------------------------------------------------------------------{
if isNewDay or (inSession and not inSession[1])
    orHigh := na
    orLow  := na
    sessionEnded := false
    dayReachedU1 := false
    dayReachedU2 := false
    dayReachedU3 := false
    dayReachedD1 := false
    dayReachedD2 := false
    dayReachedD3 := false
    volMap.clear()
    sessionStartBar := bar_index
    profileAnchor := bar_index
    activeVPBoxes.clear()
    entryPrice := na
    optStops.fill(na)
    optActive.fill(0)
    dynamicTickSize := math.max(syminfo.mintick, nz(atrVal, high - low) / vpRowsInput)

if inSession
    float currentHigh = srcInput == "High/Low" ? high : math.max(open, close)
    float currentLow  = srcInput == "High/Low" ? low  : math.min(open, close)
    
    orHigh := na(orHigh) ? currentHigh : math.max(orHigh, currentHigh)
    orLow  := na(orLow) ? currentLow  : math.min(orLow, currentLow)
    profileAnchor := bar_index

    float currentRange = orHigh - orLow
    if currentRange > 0
        dynamicTickSize := math.max(syminfo.mintick, currentRange / vpRowsInput)

    float priceLevel = math.round(close / dynamicTickSize) * dynamicTickSize
    volMap.put(priceLevel, (volMap.contains(priceLevel) ? volMap.get(priceLevel) : 0) + volume)

if not inSession and inSession[1]
    sessionEnded := true
    totalSessions += 1

float orRange = orHigh - orLow

float f1 = extType == "Fibonacci" ? 0.382 : mult1
float f2 = extType == "Fibonacci" ? 0.618 : mult2
float f3 = extType == "Fibonacci" ? 1.0   : mult3

[u1, d1] = getExt(f1, orRange, orHigh, orLow)
[u2, d2] = getExt(f2, orRange, orHigh, orLow)
[u3, d3] = getExt(f3, orRange, orHigh, orLow)

if sessionEnded
    if not na(u1) and high >= u1 and not dayReachedU1
        countU1 += 1
        dayReachedU1 := true
    if not na(u2) and high >= u2 and not dayReachedU2
        countU2 += 1
        dayReachedU2 := true
    if not na(u3) and high >= u3 and not dayReachedU3
        countU3 += 1
        dayReachedU3 := true
        
    if not na(d1) and low <= d1 and not dayReachedD1
        countD1 += 1
        dayReachedD1 := true
    if not na(d2) and low <= d2 and not dayReachedD2
        countD2 += 1
        dayReachedD2 := true
    if not na(d3) and low <= d3 and not dayReachedD3
        countD3 += 1
        dayReachedD3 := true

orStartTime = str.substring(sessionInput, 0, 4)

string targetEndTime = switch stopTimeType
    "New York Close" => "1700"
    "London Close"   => "1130"
    "Manual Time"    => str.replace(manualEndTime, ":", "")
    => "2359"

plottingSession = orStartTime + "-" + targetEndTime
bool displayAllowed = not stopPlotting or not na(time(timeframe.period, plottingSession + ":" + sessionDays, timezoneInput))

plotHigh = displayAllowed ? orHigh : na
plotLow  = displayAllowed ? orLow  : na
plotU1   = displayAllowed and showExtensions ? u1 : na
plotU2   = displayAllowed and showExtensions ? u2 : na
plotU3   = displayAllowed and showExtensions ? u3 : na
plotD1   = displayAllowed and showExtensions ? d1 : na
plotD2   = displayAllowed and showExtensions ? d2 : na
plotD3   = displayAllowed and showExtensions ? d3 : na

atrTrail = ta.atr(trailAtrLen)

volSMA = ta.sma(volume, 20)
isHV = volume > volSMA
volSuffix = isHV ? "（高量）" : "（低量）"
szSignal = sigLabelSize == "Tiny" ? size.tiny : sigLabelSize == "Small" ? size.small : sigLabelSize == "Normal" ? size.normal : size.large

bool breakoutUp = ta.crossover(close, orHigh) and not inSession and sessionEnded
bool breakoutDn = ta.crossunder(close, orLow) and not inSession and sessionEnded

if isNewDay or inSession
    canSignalUp := true
    canSignalDn := true
    activeDir   := 0
    trailStop   := na

if breakoutUp and canSignalUp and displayAllowed
    label.new(bar_index, high, "多头突破" + volSuffix, color = bullColor, style = label.style_label_down, textcolor = color.white, size = szSignal)
    canSignalUp := false
    if activeDir == 0
        activeDir  := 1
        entryPrice := orHigh
        trailStop  := low - (atrTrail * trailMult)
        for i = 0 to 4
            optActive.set(i, 1)
            optStops.set(i, low - (atrTrail * optMults.get(i)))

if breakoutDn and canSignalDn and displayAllowed
    label.new(bar_index, low, "空头突破" + volSuffix, color = bearColor, style = label.style_label_up, textcolor = color.white, size = szSignal)
    canSignalDn := false
    if activeDir == 0
        activeDir  := -1
        entryPrice := orLow
        trailStop  := high + (atrTrail * trailMult)
        for i = 0 to 4
            optActive.set(i, -1)
            optStops.set(i, high + (atrTrail * optMults.get(i)))

if activeDir == 1
    trailStop := math.max(nz(trailStop[1], low - (atrTrail * trailMult)), low - (atrTrail * trailMult))
    if close < trailStop or not displayAllowed
        totalProfit += (close - entryPrice)
        activeDir := 0
        trailStop := na

if activeDir == -1
    trailStop := math.min(nz(trailStop[1], high + (atrTrail * trailMult)), high + (atrTrail * trailMult))
    if close > trailStop or not displayAllowed
        totalProfit += (entryPrice - close)
        activeDir := 0
        trailStop := na

if showOptimizer
    for i = 0 to 4
        m = optMults.get(i)
        a = optActive.get(i)
        s = optStops.get(i)
        if a == 1
            newStop = math.max(nz(s, low - (atrTrail * m)), low - (atrTrail * m))
            optStops.set(i, newStop)
            if close < newStop or not displayAllowed
                optProfits.set(i, optProfits.get(i) + (close - entryPrice))
                optActive.set(i, 0)
        else if a == -1
            newStop = math.min(nz(s, high + (atrTrail * m)), high + (atrTrail * m))
            optStops.set(i, newStop)
            if close > newStop or not displayAllowed
                optProfits.set(i, optProfits.get(i) + (entryPrice - close))
                optActive.set(i, 0)

//---------------------------------------------------------------------------------------------------------------------}
// 图表绘制
//---------------------------------------------------------------------------------------------------------------------{
bgcolor(inSession ? color.new(neutralColor, 90) : na, title = "开盘区间背景")

pHigh = plot(plotHigh, "区间高点", color.new(neutralColor, 20), 2, plot.style_linebr)
pLow  = plot(plotLow, "区间低点", color.new(neutralColor, 20), 2, plot.style_linebr)

fill(pHigh, pLow, plotHigh, plotLow, color.new(neutralColor, bgTransp), color.new(neutralColor, bgTransp), "区间填充")

pu1 = plot(plotU1, "上方扩展 1", color.new(bullColor, 40), 1, plot.style_linebr)
pu2 = plot(plotU2, "上方扩展 2", color.new(bullColor, 40), 1, plot.style_linebr)
pu3 = plot(plotU3, "上方扩展 3", color.new(bullColor, 40), 1, plot.style_linebr)

pd1 = plot(plotD1, "下方扩展 1", color.new(bearColor, 40), 1, plot.style_linebr)
pd2 = plot(plotD2, "下方扩展 2", color.new(bearColor, 40), 1, plot.style_linebr)
pd3 = plot(plotD3, "下方扩展 3", color.new(bearColor, 40), 1, plot.style_linebr)

fill(pHigh, pu1, plotU1, plotHigh, color.new(bullColor, bgTransp + 10), color.new(bullColor, bgTransp), "多头区域 1")
fill(pu1, pu2, plotU2, plotU1, color.new(bullColor, bgTransp + 5), color.new(bullColor, bgTransp + 10), "多头区域 2")
fill(pu2, pu3, plotU3, plotU2, color.new(bullColor, bgTransp), color.new(bullColor, bgTransp + 5), "多头区域 3")

fill(pLow, pd1, plotLow, plotD1, color.new(bearColor, bgTransp), color.new(bearColor, bgTransp + 10), "空头区域 1")
fill(pd1, pd2, plotD1, plotD2, color.new(bearColor, bgTransp + 10), color.new(bearColor, bgTransp + 5), "空头区域 2")
fill(pd2, pd3, plotD2, plotD3, color.new(bearColor, bgTransp + 5), color.new(bearColor, bgTransp), "空头区域 3")

pTrail = plot(showTrail ? trailStop : na, "移动止损", activeDir == 1 ? bullColor : bearColor, 2, plot.style_linebr)
pPrice = plot(showTrail ? close : na, "追踪价格参考", color.new(chart.fg_color, 100))
fill(pTrail, pPrice, 
     top_value = activeDir == 1 ? close : trailStop, 
     bottom_value = activeDir == 1 ? trailStop : close, 
     top_color = activeDir == 1 ? color.new(bullColor, 50) : color.new(bearColor, 100), 
     bottom_color = activeDir == 1 ? color.new(bullColor, 100) : color.new(bearColor, 50), 
     title = "移动止损填充")

if barstate.islast
    if showVP and volMap.size() > 0
        if activeVPBoxes.size() > 0
            for b in activeVPBoxes
                b.delete()
            activeVPBoxes.clear()

        float maxVol = 0.0
        float[] prices = volMap.keys()
        for p in prices
            maxVol := math.max(maxVol, volMap.get(p))
        
        if prices.size() > 0
            prices.sort()
            int profileMaxBars = 15 
            float levelHeight = dynamicTickSize
            int startX = bar_index + 25
            
            for i = 0 to prices.size() - 1
                float p = prices.get(i)
                if p >= (orLow - levelHeight / 2) and p <= (orHigh + levelHeight / 2)
                    float vol = volMap.get(p)
                    bool  isPOC = vol == maxVol
                    int bars = math.max(1, math.round((vol / math.max(1e-10, maxVol)) * profileMaxBars))
                    color cellColor = isPOC ? color.new(vpColor, 0) : color.new(vpColor, 40)
                    box nb = box.new(startX, p + levelHeight / 2, startX + bars, p - levelHeight / 2, 
                                     border_color = color.new(vpColor, 100), bgcolor = cellColor)
                    activeVPBoxes.push(nb)

    if showLabels
        label.delete(label.new(bar_index + 2, orHigh, "开盘高点", color = neutralColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
        label.delete(label.new(bar_index + 2, orLow, "开盘低点", color = neutralColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
        if showExtensions
            string lblU1 = "目标 1 (" + str.tostring(totalSessions > 0 ? math.round((countU1 / totalSessions) * 100) : 0) + "%)"
            string lblD1 = "目标 1 (" + str.tostring(totalSessions > 0 ? math.round((countD1 / totalSessions) * 100) : 0) + "%)"
            string lblU2 = "目标 2 (" + str.tostring(totalSessions > 0 ? math.round((countU2 / totalSessions) * 100) : 0) + "%)"
            string lblD2 = "目标 2 (" + str.tostring(totalSessions > 0 ? math.round((countD2 / totalSessions) * 100) : 0) + "%)"
            string lblU3 = "目标 3 (" + str.tostring(totalSessions > 0 ? math.round((countU3 / totalSessions) * 100) : 0) + "%)"
            string lblD3 = "目标 3 (" + str.tostring(totalSessions > 0 ? math.round((countD3 / totalSessions) * 100) : 0) + "%)"

            label.delete(label.new(bar_index + 2, u1, lblU1, color = bullColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
            label.delete(label.new(bar_index + 2, d1, lblD1, color = bearColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
            label.delete(label.new(bar_index + 2, u2, lblU2, color = bullColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
            label.delete(label.new(bar_index + 2, d2, lblD2, color = bearColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
            label.delete(label.new(bar_index + 2, u3, lblU3, color = bullColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])
            label.delete(label.new(bar_index + 2, d3, lblD3, color = bearColor, style = label.style_label_left, textcolor = color.white, size = size.small)[1])

//---------------------------------------------------------------------------------------------------------------------}
// 仪表盘
//---------------------------------------------------------------------------------------------------------------------{
if dashboardInput
    int rowsTotal = 13 + (showTrail ? 2 : 0) + (showOptimizer ? 2 : 0)
    var table dash = table.new(parsedDashboardPosition, 4, rowsTotal, bgcolor = BACKGROUND, border_width = 0, frame_color = BORDERS, frame_width = 1, force_overlay = false)
    
    if barstate.isfirst
        dash.merge_cells(0, 0, 3, 0)
        cell(dash, 0, 0, 'ORB 命中率', color = DATA, align = text.align_center)
        
        divider(dash, 1, 3)

        cell(dash, 0, 2, "水平", color = HEADERS, align = text.align_left)
        cell(dash, 1, 2, "次数", color = HEADERS)
        cell(dash, 2, 2, "总数", color = HEADERS)
        cell(dash, 3, 2, "比率", color = HEADERS)

        divider(dash, 3, 3)
        divider(dash, 7, 3)
        divider(dash, 11, 3)

        dash.merge_cells(0, 12, 3, 12)
        
        int nextRow = 13
        if showTrail
            divider(dash, nextRow, 3)
            nextRow += 1
            dash.merge_cells(0, nextRow, 3, nextRow)
            nextRow += 1
            
        if showOptimizer
            divider(dash, nextRow, 3)
            nextRow += 1
            dash.merge_cells(0, nextRow, 3, nextRow)

    if barstate.islast
        totalHits = math.max(1, totalSessions)
        
        cell(dash, 0, 4, "多头目标1", color = HEADERS, align = text.align_left)
        cell(dash, 1, 4, str.tostring(countU1), color = bullColor)
        cell(dash, 2, 4, str.tostring(totalSessions), color = bullColor)
        cell(dash, 3, 4, str.tostring(math.round((countU1 / totalHits) * 100)) + "%", color = bullColor)

        cell(dash, 0, 5, "多头目标2", color = HEADERS, align = text.align_left)
        cell(dash, 1, 5, str.tostring(countU2), color = bullColor)
        cell(dash, 2, 5, str.tostring(totalSessions), color = bullColor)
        cell(dash, 3, 5, str.tostring(math.round((countU2 / totalHits) * 100)) + "%", color = bullColor)

        cell(dash, 0, 6, "多头目标3", color = HEADERS, align = text.align_left)
        cell(dash, 1, 6, str.tostring(countU3), color = bullColor)
        cell(dash, 2, 6, str.tostring(totalSessions), color = bullColor)
        cell(dash, 3, 6, str.tostring(math.round((countU3 / totalHits) * 100)) + "%", color = bullColor)

        cell(dash, 0, 8, "空头目标1", color = HEADERS, align = text.align_left)
        cell(dash, 1, 8, str.tostring(countD1), color = bearColor)
        cell(dash, 2, 8, str.tostring(totalSessions), color = bearColor)
        cell(dash, 3, 8, str.tostring(math.round((countD1 / totalHits) * 100)) + "%", color = bearColor)

        cell(dash, 0, 9, "空头目标2", color = HEADERS, align = text.align_left)
        cell(dash, 1, 9, str.tostring(countD2), color = bearColor)
        cell(dash, 2, 9, str.tostring(totalSessions), color = bearColor)
        cell(dash, 3, 9, str.tostring(math.round((countD2 / totalHits) * 100)) + "%", color = bearColor)

        cell(dash, 0, 10, "空头目标3", color = HEADERS, align = text.align_left)
        cell(dash, 1, 10, str.tostring(countD3), color = bearColor)
        cell(dash, 2, 10, str.tostring(totalSessions), color = bearColor)
        cell(dash, 3, 10, str.tostring(math.round((countD3 / totalHits) * 100)) + "%", color = bearColor)

        cell(dash, 0, 12, "已追踪: " + str.tostring(totalSessions) + " (" + sessionInput + ")", color = DATA, align = text.align_center)
        
        int nextRow = 13
        if showTrail
            nextRow += 1
            cell(dash, 0, nextRow, "累计追踪利润: " + str.tostring(totalProfit, "#.##"), color = DATA, align = text.align_center)
            nextRow += 1
            
        if showOptimizer
            nextRow += 1
            int bestIdx = 0
            float maxP = -1e10
            for i = 0 to 4
                p = optProfits.get(i)
                if p > maxP
                    maxP := p
                    bestIdx := i
            bestMult = optMults.get(bestIdx)
            cell(dash, 0, nextRow, "最佳 ATR 倍数: " + str.tostring(bestMult) + " (利润: " + str.tostring(maxP, "#.##") + ")", color = color.new(#FFD700, 0), align = text.align_center)

//---------------------------------------------------------------------------------------------------------------------}
// 警报
//---------------------------------------------------------------------------------------------------------------------{
alertcondition(breakoutUp, "多头 ORB", "价格向上突破开盘区间。")
alertcondition(breakoutDn, "空头 ORB", "价格向下突破开盘区间。")
alertcondition(ta.cross(close, u3), "目标 3 已触及", "价格达到最终多头目标。")
alertcondition(ta.cross(close, d3), "目标 3 已触及", "价格达到最终空头目标。")

//---------------------------------------------------------------------------------------------------------------------}