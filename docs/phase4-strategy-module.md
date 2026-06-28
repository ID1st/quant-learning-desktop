# 第四阶段 - 策略管理模块

## 当前模块范围

本模块完成策略管理的第一版前端闭环与策略可视化协议设计。

已实现：

- 内置策略注册元数据。
- `UTORB 开盘区间突破` 策略占位。
- `Trend Targets 趋势目标` 策略占位。
- 策略列表、详情、启用/停用状态。
- 参数 schema 展示。
- 策略运行状态与日志占位。
- `StrategyRenderOutput` 策略可视化输出协议。
- `SignalMarker`、`PriceLine`、`TrendLine`、`Band`、`Label` 标准可视化元素。

## 当前占位规则

当前阶段不转译 Pine Script，不执行真实策略计算。

- 预制策略只注册名称、版本、源文件、市场、周期和参数 schema。
- 策略 `run()` 返回占位结果。
- 启停状态只影响管理页面和未来图层控制语义。
- 图表渲染协议已定义，但尚未接入图表工作台。

## 非本模块范围

本模块不实现：

- Pine Script 转 TypeScript。
- Pine Runtime helper。
- 历史回测。
- 实时策略运行。
- 策略结果持久化。
- 策略输出实际叠加到图表。

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

请确认策略管理模块的列表、启停、参数占位和可视化协议边界。确认后再进入下一个模块：策略运行器与 Pine 策略转译规划。
