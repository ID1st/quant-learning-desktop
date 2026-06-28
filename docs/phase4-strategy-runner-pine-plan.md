# 第四阶段 - 策略运行器与 Pine 转译规划

## 当前模块范围

本模块建立策略运行器的最小闭环，并规划 Pine Script 策略转译路线。

已实现：

- `StrategyRunRequest`：统一策略运行请求。
- `StrategyRunResult`：统一策略运行结果。
- `resolveStrategyParameters()`：按策略参数 schema 合并默认值。
- `createStrategyInput()`：生成标准策略输入。
- `runRegisteredStrategy()`：按策略 key 从注册器运行策略。
- 策略管理页使用样例 K 线调用运行器，展示占位运行结果。

## Pine 转译原则

当前不做完整 Pine Script 编译器。

推荐路线：

1. 先人工分析 `utorb.md` 与 `trend-targets.md`。
2. 抽取两者共用的时间序列 helper。
3. 建立最小 Pine Runtime。
4. 先转译 `UTORB` 的核心信号路径。
5. 用固定 OHLCV fixture 做确定性测试。
6. 再转译 `Trend Targets` 的趋势线、止损和目标位。
7. 策略输出统一映射到 `StrategyRenderOutput`。

## Pine Runtime 第一批 Helper

优先实现：

- `nz`
- `sma`
- `ema`
- `wma`
- `atr`
- `highest`
- `lowest`
- `cross`
- `crossover`
- `crossunder`
- 历史索引读取

暂缓：

- Pine object 生命周期完整模拟。
- TradingView line/label/table 直接复刻。
- 完整 Pine parser/compiler。

## UTORB 最小转译链路

第一条策略建议选择 `UTORB`，原因是它适合拆成明确阶段：

1. 识别交易日与开盘区间窗口。
2. 计算 opening range high / low。
3. 生成上破与下破信号。
4. 生成区间线与目标位 `PriceLine`。
5. 输出 `SignalMarker`。
6. 输出日志与基础命中指标。

Deferred：

- Volume profile。
- Stop optimizer。
- 高级 dashboard/table。

## Trend Targets 转译链路

第二条策略建议在 Pine Runtime helper 稳定后进行：

1. 实现 WMA/EMA/ATR。
2. 计算趋势方向与趋势线。
3. 生成趋势翻转信号。
4. 生成 entry、stop loss、TP1/TP2/TP3。
5. 输出 `TrendLine`、`PriceLine`、`SignalMarker`。

必须注意：

- Pine 中 line/label 对象可以隐式持有状态。
- TypeScript 版本必须显式管理对象状态。
- 不允许更新不存在的图层元素。

## 非本模块范围

本模块不实现：

- 完整 Pine compiler。
- UTORB 真实业务转译。
- Trend Targets 真实业务转译。
- 回测撮合。
- 图表叠加真实策略结果。

## 验证

已通过：

```powershell
npm.cmd run build
```

已知限制：

```powershell
npm.cmd run typecheck -w @quant/desktop
```

当前仍受既有 TypeScript project reference 配置影响，报错为引用项目 `noEmit` 设置问题，并非本模块代码错误。

## 下一步确认点

请确认运行器接口与 Pine 转译路线。确认后进入下一步：实现 Pine Runtime helper 与 U 通用时间序列测试夹具。
