# 技术指标与单副图规格

## 状态

已接受并实现，2026-07-27。

## 决策

超级图表使用一个指标注册表管理内置和插件指标。新用户的所有指标默认关闭；主图指标可以多选，副图指标始终互斥。只有启用了副图指标时才挂载副图和分隔线，关闭后立即归还全部高度给主图。

副图默认占图表区域 26%，允许在 18%–45% 之间调整。分隔线支持指针拖动、方向键调整、Home 键和双击恢复默认值。主副图共享可见时间范围、缩放、水平平移、悬停索引和垂直十字线，各自计算纵轴和横向十字线；时间轴只出现在最底部。

图表包的 `ChartIndicatorDefinition.evaluate` 返回带 `placement` 的判别联合：

- `overlay` 返回主图 `ChartRenderLayer`；
- `pane` 返回 `ChartPaneModel`；
- 旧插件未声明 `placement` 时按主图 overlay 兼容。

`ChartPaneModel` 提供独立纵轴约束、参考线、最新值，以及 `line`、`histogram`、`columns` 三类序列。主图图层补充 `point-series` 和 `channel`，分别承载 SAR 与 BOLL/ENE。

“策略图层”开关仅过滤 `source: "strategy"` 的图层，不影响普通指标和用户绘图。

## 指标口径

| 指标 | 位置 | 默认参数与说明 |
|---|---|---|
| MA | 主图 | 5/10/20/60，完整窗口后输出 |
| BOLL | 主图 | 20、总体标准差、2 倍 |
| EMA | 主图 | 5/10/20/60，以首个完整 SMA 窗口初始化 |
| BBI | 主图 | MA3/6/12/24 的平均 |
| ENE | 主图 | MA10，上轨 +11%，下轨 -9% |
| SAR | 主图 | Wilder 0.02/0.02/0.2，点序列 |
| MAVOL | 副图 | 成交量柱、MAVOL5/10 |
| MACD | 副图 | 12/26/9；跨市场柱为 DIF-DEA，A 股柱为两倍 |
| VOL | 副图 | 成交量柱 |
| KDJ | 副图 | 9/3/3，K/D 初值 50，J=3K-2D |
| RSI | 副图 | 跨市场 RSI14 与 30/70；A 股 RSI6/12/24 与 20/80 |
| WR | 副图 | 跨市场 WR14；A 股 WR10/6；参考线 -80/-20 |
| CCI | 副图 | CCI14、常数 0.015、参考线 ±100 |

指标支持 `auto`、`a-share` 和 `cross-market` 三种口径模式。Auto 下 CN 使用 A 股口径，HK/US 使用跨市场口径。启用状态跨口径共享，参数分别保存，切换口径不会覆盖另一套自定义参数。

所有滚动窗口指标完成预热后才输出。平盘、零振幅、零平均损失以及非有限行情值使用稳定回退，渲染结果不得包含 `NaN` 或无穷大。

## 迁移

Study Settings 存储版本为 3：

- 旧 `sma` 迁移为 `ma`，原周期成为第一周期，其余由默认组合补齐并去重；
- 旧 EMA/BOLL 参数复制到 A 股和跨市场两套配置；
- 旧工作区 `showVolume=true` 迁移为启用 VOL；
- 已有明确启用状态保留；没有历史偏好的新用户全部关闭；
- 工作区偏好不再保存 MA、VOL 或整份指标配置，指标 Store 是唯一事实来源。

## 参考

- [TradingView 独立 pane](https://www.tradingview.com/support/solutions/43000703396-drawing-tools-available-on-tradingview/)
- [Longbridge 桌面端可调布局](https://longbridge.com/sg/zh-CN/support/topics/desktop/guide)
- [Longbridge 指标示例](https://open.longbridge.com/docs/cli/quant/indicator)
