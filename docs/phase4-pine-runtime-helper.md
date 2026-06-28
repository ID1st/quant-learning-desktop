# 第四阶段 - Pine Runtime Helper 与测试夹具

## 当前模块范围

本模块建立 Pine Script 转译前的基础时间序列运行时。

已实现：

- 新增 `@quant/pine-runtime` 包。
- `nz`
- `history`
- `sma`
- `ema`
- `wma`
- `highest`
- `lowest`
- `trueRange`
- `atr`
- `crossover`
- `crossunder`
- `cross`
- Node 内置测试夹具。

## 设计原则

Pine Runtime 只负责可测试的时间序列函数，不负责 UI、图表、Electron、行情拉取或策略管理状态。

后续策略转译时：

- Pine helper 应优先在该包中实现。
- 策略包只组合 helper，不重复实现数学逻辑。
- 每个 helper 都需要固定输入输出测试。

## 当前非目标

本模块不实现：

- 完整 Pine Script parser。
- 完整 Pine compiler。
- TradingView line/label/table 对象模拟。
- `UTORB` 或 `Trend Targets` 的真实策略转译。

## 验证

已通过：

```powershell
npm.cmd run test:pine-runtime
npm.cmd run build
```

已知限制：

```powershell
npm.cmd run typecheck -w @quant/desktop
```

当前仍受既有 TypeScript project reference 配置影响，报错为引用项目 `noEmit` 设置问题，并非本模块代码错误。

## 下一步确认点

请确认 Pine Runtime helper 的函数命名、行为和测试夹具。确认后建议进入 `UTORB` 最小转译链路：只实现开盘区间、高低线、突破信号和 StrategyRenderOutput 映射。
