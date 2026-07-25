# Machine Learning Price Targets

## 定位

`machine-learning-price-targets` 是从 AlgoAlpha Pine v6 指标手工翻译的本地预置指标。它只支持 CN/HK/US 的标准 `realtime` 一分钟 OHLCV，不生成订单、收益率或回测 PnL。

来源：

- Pine 参考文件：`trading-strategies/Machine Learning Price Target Prediction Signals.md`
- 说明页面：<https://www.tradingview.com/script/3MHPrjD5-Machine-Learning-Price-Target-Prediction-Signals-AlgoAlpha/>

原始页面未声明可由本项目继承的软件许可证。本项目只保留作者和来源信息，用于本地研究；商业发布前必须另行核实授权。

## 数据与确认规则

- 少于 1,000 根已确认分钟 K 线时显示预热进度，不产生预测图层或信号。
- 指标启用后请求最多 5,000 根、22 个交易日的实时历史；数据源返回不足时使用缓存逐日累积。
- 当前未收盘分钟只沿用上一确认状态，不进入训练、预测、TP/SL 判断或提醒。
- 整段成交量为零时显示“成交量不可用”并停止输出。

## 计算

趋势模式支持 EMA 50/200、HMA 93 和 SuperTrend 3/10。每个确认趋势段记录最大有利移动，并在下一次趋势切换时生成训练样本。

RBF 回归使用八个特征：

1. 从 14 根最高点回落的 RSI；
2. 从 14 根最低点反弹的 RSI；
3. 波动变化及 1,000 根归一化；
4. 波动二阶变化及 1,000 根归一化；
5. 成交量 EMA 7/14 振荡；
6. 14 根 Choppiness Index；
7. 收盘 RSI(14)；
8. 趋势方向。

非有限预测、成功率或风险收益比不会创建无效价格区块。

## 图层

- 绿色半透明目标区；
- 红色半透明风险区；
- 大号上涨/下跌标签；
- 交易状态蜡烛着色；
- 右上角训练样本、预测移动、成功率、风险收益比和交易状态表；
- 看涨、看跌、止盈命中和止损命中四类一次性提醒。

完成的 TP/SL 历史区块保留，最多绘制 500 个盒子。若同一根确认 K 线同时触及 TP 和 SL，按原始脚本判断顺序优先记录 TP。
