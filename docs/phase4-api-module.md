# 第四阶段 - API 配置与长桥绑定模块

## 当前模块范围

本模块完成桌面端长桥 API 绑定流程的前端闭环。

已实现：

- API URL、API Key、API Secret 表单。
- API URL 与凭证长度基础校验。
- 本地占位联网验证边界。
- 绑定成功后的同步准备步骤展示。
- 本地保存 API 绑定摘要。
- 当前用户会话标记 `apiBound=true`。
- 绑定成功后进入仪表盘。
- 进入系统后的侧栏与占位页中文修复。

## 当前占位规则

当前阶段不接入真实长桥 OpenAPI SDK，不发送真实 API 凭证到外部服务。

- API URL 需要以 `http` 或 `https` 开头。
- API Key 至少 8 位。
- API Secret 至少 8 位。
- API Key 仅保存脱敏预览，不保存完整值。
- API Secret 仅用于本次验证，不写入浏览器本地存储。

后续接入桌面正式版时，应将 `apps/desktop/src/features/api/apiConfigService.ts` 替换为真实长桥 SDK 适配层，并使用系统安全凭据存储保存敏感信息。

## 非本模块范围

本模块不实现：

- 真实长桥 OpenAPI 联网验证。
- 真实行情、自选股、历史 K 线同步。
- API Secret 安全凭据管理。
- 多交易接口抽象。
- 数据库持久化。

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

浏览器烟测：

- 登录成功后进入 API 配置页。
- API 绑定成功后进入仪表盘。
- 侧栏与页面可见中文无乱码。

## 下一步确认点

请确认 API 绑定模块的流程、文案与阶段边界。确认后再进入下一个模块：图表工作台模块。
