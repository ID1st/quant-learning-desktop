# 超级图表能力补全计划

## 第二轮实施记录（2026-07-12）

本轮在既有图表优先布局上完成以下工作，未改变市场数据 Gateway、缓存键、策略运行输入或插件运行边界：

- 策略管理页与超级图表使用同一份版本化 Study Settings；预制策略的启停、参数以及 SMA/BOLL 的设置不再分叉。
- 指标改为“定义 + 实例设置 + 渲染层”模型。内置 SMA、EMA、BOLL 均走同一入口；插件指标也复用同一实例参数、启停和可见性规则。
- 图层面板现在同时呈现基础价格、成交量、指标、策略和用户绘图；各附加层保留稳定 z-index 排序，策略输出仍通过声明式 render elements 进入图表。
- 基础绘图支持趋势线、水平线和文本标注，并按 `market + symbol + timeframe` 持久化。新增命令模型支持 add/update/delete/clear 以及撤销、重做，为后续指针式编辑和更多工具复用。
- 图表增加回到最新与锁定价格比例。实时更新继续保留现有视图同步策略，不会重置手动平移、右侧留白或价格比例。
- 信号面板可选择单个策略信号，查看关联策略、参数、最新日志、时间和价格，并可跳转到策略配置。

本轮明确延后：在画布上拖拽端点的编辑、矩形/斐波那契/测量工具、副图指标的独立面板、图层拖拽排序和跨设备绘图同步。它们将建立在已落地的命令与渲染协议上，而不改变策略或数据源架构。

质量门禁：`npm.cmd run test:desktop`、`npm.cmd run typecheck`、`npm.cmd run build` 已通过；最新提交按功能切片保留回退点。

## 目标与边界

本轮在不改变市场数据 Gateway、策略运行时、缓存键和凭据存储边界的前提下，补全超级图表的四项能力：证券搜索与观察列表、指标、基础画线、图层及数据诊断。

- 图表只接收供应商无关的蜡烛、图层和渲染命令；不得导入 AlphaFeed、LongBridge 或 Stock SDK。
- 策略引擎仍只产出策略结果；应用层负责将策略输出适配为图表图层。
- 市场数据搜索必须经过 Provider Capability、Gateway 和桌面 IPC；若当前源不支持搜索，界面展示真实的不可用状态，不伪造结果。
- 观察列表保存在本地文档存储，维持现有 `market-watchlist-cache` 的兼容读取；行情缓存继续按 `market:symbol:timeframe` 保存，不改写已有数据。

## 统一渲染契约

图表包新增通用图层，而现有 `ChartLayer` 继续作为兼容别名。应用层将策略、指标和画线分别转换为该图层。

```ts
type ChartLayerSource = "strategy" | "indicator" | "drawing";

interface ChartRenderLayer {
  id: string;
  name: string;
  source: ChartLayerSource;
  enabled: boolean;
  visible: boolean;
  zIndex: number;
  elements: ChartLayerElement[];
}

type ChartLayerElement =
  | SignalMarkerElement
  | PriceLineElement
  | TrendLineElement
  | BandElement
  | TextAnnotationElement;
```

图表包只渲染命令和处理命中测试；指标计算、策略计算和画线对象编辑不进入图表包。渲染顺序固定为：绘图、指标、策略，层内按 `zIndex` 升序，后绘制的元素位于上层。

## 指标契约

指标属于桌面端功能模块，并为未来插件预留注册入口。

```ts
interface ChartIndicatorDefinition {
  id: string;
  name: string;
  parameters: readonly ChartIndicatorParameter[];
  evaluate(input: ChartIndicatorInput): ChartRenderLayer;
}

interface ChartIndicatorState {
  enabled: boolean;
  visible: boolean;
  parameters: Record<string, unknown>;
}
```

首批内置指标为均线和布林带。指标面板支持新增、启用/停用、显示/隐藏、删除及按需打开参数浮层。策略的均线显示开关迁移为该指标状态的兼容入口，避免出现两套均线。

## 画线对象契约

```ts
type DrawingObject = TrendLineDrawing | HorizontalLineDrawing | TextDrawing;

interface DrawingBase {
  id: string;
  type: "trend-line" | "horizontal-line" | "text";
  visible: boolean;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
}
```

画线对象按 `symbol + market + timeframe` 存储到本地偏好文档。首版支持创建、选择、取消选择、删除和基础编辑；不承诺跨设备同步。图表把对象转换为 `ChartRenderLayer`，因此未来本地持久化、云同步或插件均复用相同渲染协议。

## 市场数据搜索契约

`MarketDataProviderCapability` 新增 `instrumentSearch`，并新增独立接口：

```ts
interface MarketInstrument {
  symbol: string;
  name: string;
  market: "US" | "HK" | "CN";
  provider: GatewayMarketDataProviderId;
}

interface InstrumentSearchProvider extends MarketDataProvider {
  searchInstruments(query: string, markets?: readonly Market[]): Promise<readonly MarketInstrument[]>;
}
```

Gateway 以能力和优先级执行搜索，并通过 `marketData:searchInstruments` IPC 暴露给渲染进程。Stock SDK 是首个实现；其他源不支持时不参与该能力的 fallback。搜索响应保留提供方、市场、代码和名称，UI 据此创建观察项。

## 观察列表与行情闭环

观察列表记录由固定 `preset` 扩展为 `preset | user`，仍能读取旧记录。用户添加证券时：

1. 搜索服务返回真实证券；
2. 本地观察列表去重写入；
3. 该证券立即成为活动标的；
4. 图表复用现有 Gateway 读取缓存、历史 K 线和报价；
5. 失败状态明确显示为未配置、网络失败、受限或无搜索能力。

删除当前活动标的时，自动切换到剩余第一项；最后一项不可删除，以避免图表进入无上下文状态。缓存不因移除观察项而删除，由既有缓存治理策略回收。

## 诊断与状态

顶部只保留紧凑状态：数据点数、来源、延迟/降级、最后更新时间。详情通过一个按需打开的诊断抽屉展示：尝试过的 provider、失败原因、健康状态、策略/指标/绘图层数量和渲染状态。

所有数据和图层状态统一使用：`loading`、`empty`、`paused`、`delayed`、`degraded`、`error`。状态只描述事实，不把网络错误误报为“等待数据”。

## 实施切片与验收

### 当前进度（2026-07-10）

- 已完成：Provider-neutral 证券搜索、Stock SDK 搜索适配、IPC、可持久化观察列表，以及添加后切换图表。
- 已完成：通用 `ChartRenderLayer`，内置均线和布林带的启用、停用与按需参数面板。
- 已完成：趋势线、水平线、文字标注的本地对象模型、渲染、选择、显示/隐藏和删除。
- 已完成：图层上移/下移、按需数据诊断抽屉、供应商健康状态与最近状态事件。
- 后续增强（不属于本切片验收）：指针落点式画线编辑、跨设备同步、图层拖拽排序。

### 切片 1：观察列表与证券搜索

- 新增 Provider 搜索能力、Gateway 方法及 IPC 契约。
- 新增本地观察列表服务和右侧搜索/添加/删除交互。
- 验收：代码或名称搜索返回实际来源结果；去重生效；添加后图表切换；无能力/网络失败状态可见；现有默认观察项和缓存可读。

### 切片 2：统一图层与指标

- 图表包接受通用图层并保持策略图层兼容。
- 新增指标注册表、状态存储、内置均线/布林带和参数浮层。
- 验收：新增、启停、显示、删除、参数修改均只影响对应图层；策略输出保持原样；图层顺序稳定。

### 切片 3：画线与图层管理

- 新增趋势线、水平线和文字标注对象及持久化。
- 工具栏切换工具；图层面板可选择、显示、隐藏、删除及编辑。
- 验收：创建后可选中、编辑、删除；切换标的和周期不串数据；刷新后同一上下文恢复。

### 切片 4：诊断、视觉收口与质量

- 收紧右侧观察列表、底部图层面板和工具栏的信息密度。
- 新增诊断抽屉、加载/空/暂停/降级状态及键盘快捷操作。
- 验收：1280x800、1440x900、1920x1080 无溢出；浏览器控制台无错误；`npm.cmd run typecheck`、桌面测试、图表测试和构建通过。

每个切片开始前创建 Git tag，结束时单独提交。若任一切片不稳定，可回退到前一 tag，不影响市场数据、策略或凭据实现。

## 风险与控制

- Stock SDK 的外部网络稳定性不保证：搜索错误必须透传为可操作状态，不能用演示数据掩盖。
- 图表交互与缩放已较敏感：通用图层以纯渲染数据进入，避免新增数据加载副作用。
- 本地存储可能包含旧版本偏好：读取采用宽容迁移，写入采用新版本；异常时回退默认状态。
- 图层元素可能逐渐增多：首版限制为少量手绘对象，后续再单独引入虚拟化或 Canvas 优化。
