# 第四阶段 - UTORB 最小转译链路

## 当前模块范围

本模块完成 `UTORB` 的第一条最小 Pine 转译链路。

已实现：

- 使用 `@quant/pine-runtime` 的 `crossover` / `crossunder`。
- 计算开盘区间高点与低点。
- 生成开盘区间 `Band`。
- 生成开盘区间高低 `PriceLine`。
- 可选生成上下方第一目标位 `PriceLine`。
- 生成首次上破/下破 `SignalMarker`。
- 输出 `StrategyRenderOutput`。
- 输出基础指标：开盘区间高低点、区间幅度、信号数量。
- 新增 `test:strategy-engine` 测试脚本。

## 当前简化假设

当前实现只覆盖最小链路：

- 开盘区间从输入 bars 的第一根 K 线时间开始。
- `openingRangeMinutes` 用于计算开盘区间结束时间。
- 只取首次上破和首次下破信号。
- 只生成第一组上下目标位。
- 未实现交易日切换、多 session、volume profile、ATR trailing stop、stop optimizer。

## 非本模块范围

本模块不实现：

- 完整 `utorb.md` 等价转译。
- Pine object 生命周期完整模拟。
- Dashboard/table 命中率统计复刻。
- 真实交易日历。
- 图表工作台实际叠加策略输出。

## 验证

已通过：

```powershell
npm.cmd run test:pine-runtime
npm.cmd run test:strategy-engine
npm.cmd run build
```

已知限制：

```powershell
npm.cmd run typecheck -w @quant/desktop
```

当前仍受既有 TypeScript project reference 配置影响，报错为引用项目 `noEmit` 设置问题，并非本模块代码错误。

## 下一步确认点

请确认 UTORB 最小链路的输出边界。确认后建议进入：将 `StrategyRenderOutput` 接入图表工作台，让策略启停真正控制图表叠加层。
