# 审计修复与打包说明

本次对应 2026-09-21 审计 A1—A9。云端依赖升级、业务和审计事务一致性、图表测试、本地读写可靠性、重复 K 线检查、HTTP 错误映射、CI 测试清单及格式扫描范围均在本次范围内。第三方插件执行保持禁用。

## 验证结果（2026-09-21）

修复基线为 `9f8731e`，交付分支为 `codex/audit-remediation-20260921`，桌面版本为 **0.1.9**。分支基于已有 `codex/package-macos`，没有合并主分支或部署生产云端。

| 检查            | 结果                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| 自动化测试      | 579 项：常规运行 573 通过、6 项 PostgreSQL 测试跳过；独立数据库运行云端全部 73 项通过、0 跳过，补齐这 6 项 |
| `npm run check` | ESLint、格式、类型、管理员与发布测试、交易日历、13 个覆盖率域、管理员/云端/桌面/Electron 构建通过          |
| 依赖审计        | 全依赖与生产依赖均为 0 个已知漏洞；以当日 npm 审计结果为准                                                 |
| Electron        | 认证、插件运行冒烟通过；认证界面 36 个状态通过                                                             |
| 打包后启动      | Windows 新临时用户目录、保留该目录再次启动均通过                                                           |
| 管理员浏览器    | 首页、登录表单及后端不可用时的错误显示正常；未进行真实管理员登录或邮件发送                                 |
| macOS           | Bash 语法和发布配置测试通过；本机为 Windows，未在 Mac 上实际构建/公证                                      |

数据库使用本机隔离 PostgreSQL 16.14，测试后已停止。额外发现原迁移集成测试遗漏 `003_admin_invite_management.sql`；已补齐三次迁移及管理员表存在性验证。事务故障注入验证审计失败会回滚业务，并发同键创建仅成功一次。

原始日志位于本地 `outputs/remediation-20260921/`，覆盖率清单位于 `coverage/`，均不提交源码仓库。图表覆盖率恢复原定门槛，未降低阈值；源文件清单仍有桌面 60、云端 9、图表 5 个未被对应单元覆盖率运行加载的文件，不能据此声称全项目每行均已覆盖。真实邮件、行情账户、正式安装升级/卸载回滚和 macOS 实机测试仍需对应环境；本轮没有将这些项目记为通过。

构建存在原有 renderer-startup-guard 非模块脚本提示和大包体积提示，构建成功且打包后启动验证通过；本次未改变启动保护脚本。

## 安装包记录

文件：`outputs/windows-0.1.9-audit/quant-learning-desktop-0.1.9-win-x64.exe`，119,241,869 字节，NSIS 可选择安装目录。签名检查为 `NotSigned`，属于内部安装包。

SHA256：`d8254046606aec0dd0a97cf693ad12647887d6543e8bc5c02b4e284d46aa46d8`。同目录附有 `SHA256SUMS.txt`。

## 关键行为

- 管理端新建批次发送 UUID v4 `Idempotency-Key`，相同参数的失败重试复用键。服务器使用该键作为批次标识，并通过数据库主键约束阻止并发重复创建。提交后的再次请求返回 409 `BATCH_ALREADY_CREATED`；明文邀请码不会保存或重放，管理员应核查历史并按需要撤销旧批次。刷新页面属于新的客户端请求上下文。
- 创建/撤销的审计 SQL 与业务 SQL 在同一事务内。CLI 创建仍沿用现有 CLI 行为。
- `AUTH_TRUSTED_PROXIES` 支持 Fastify 的明确 IP/CIDR 地址列表，默认仅 loopback。以后部署 Docker 版本时，必须先确定 Nginx 请求到容器时的实际宿主网关地址，将该精确地址写入私有 auth.env；不要配置 `true` 或整个公网范围。此次未部署云服务。
- 本地当前版本文档读取不再写回；迁移写入失败仍返回有效数据并发出固定诊断；未来版本不被降版本覆盖。
- 凭据文件通过同目录临时文件、flush 和 rename 更新。损坏内容保留且拒绝后续覆盖。
- 回测拒绝重复时间戳，非法 OHLC 不成交。
- `coverage/*-inventory.json` 明确列出加载及未加载文件。原门槛仍针对加载模块，不把未加载 UI 文件宣称为已覆盖；另有真实 React 图表组件渲染测试和 Electron 界面冒烟。

## Windows

本轮提供内部 Windows x64 NSIS 安装包，保留正式发布脚本的签名、旧安装包及数据库门禁。没有签名证书时，不将内部包标为正式签名发行版。

```powershell
npm ci --registry=https://registry.npmjs.org
npm run check
$env:QUANT_DESKTOP_RELEASE_DIR = Join-Path $PWD 'outputs/windows-audit-release'
npm run package:internal:win:x64 -w @quant/desktop
```

输出路径必须选用新的专用目录；底层现有打包脚本会清理这个目录。

## macOS 完整脚本

需要原生 macOS、Xcode Command Line Tools、Node 24、npm 11。首次准备：

```bash
xcode-select --install
# 安装 Node 24 后：
npm install --global npm@11.12.1
git clone https://github.com/ID1st/quant-learning-desktop.git
cd quant-learning-desktop
git switch codex/audit-remediation-20260921
```

Apple Silicon Mac：

```bash
bash scripts/package-macos.sh internal arm64
```

Intel Mac：

```bash
bash scripts/package-macos.sh internal x64
```

脚本会安装锁定依赖、运行质量/构建与生产依赖审计、创建 DMG、检查 Longbridge 原生绑定、验证签名结构和 DMG、输出 SHA256。每种架构使用匹配机器，Windows 不能完成 macOS 签名与公证。内部模式生成 ad-hoc 签名包，没有 Apple 公证。

正式签名版本在安全终端预先设置 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，不要写进脚本或提交版本库，然后执行：

```bash
bash scripts/package-macos.sh signed arm64
# Intel Mac 上改为 signed x64
```

如需离线授权，打包前配置现有 `QUANT_AUTH_OFFLINE_PUBLIC_KEY_PEM` 为部署对应公钥；不要嵌入私钥。认证 URL 沿用项目正式地址。

PostgreSQL 集成测试应另外在隔离测试数据库配置 `TEST_DATABASE_URL` 后运行 `npm run test:cloud`，不能将跳过视为验证通过。
