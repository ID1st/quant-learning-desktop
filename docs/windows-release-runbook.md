# Windows x64 发布与回滚手册

## 发布边界

桌面正式包只面向 Windows x64。当前版本不提供自动更新服务，也不上传崩溃遥测。Electron
`crashReporter` 在主进程 ready 之前启动，固定使用 `uploadToServer: false`；Crashpad dump
只保存在当前 Windows 用户的本地 crashDumps 目录。

产品图标源文件为 `apps/desktop/build/icon-source.svg`。它是黑、白、灰三色的抽象符文电路
标记，不含文字、渐变或股票图形；Windows 构建使用由该源文件生成的 `icon.ico` 和
`icon.png`。

## 正式构建输入

发布环境必须提供：

- Node 24 与 npm 11。
- `CSC_LINK`（或 `WIN_CSC_LINK`）：发布环境注入的 Authenticode 证书。
- `CSC_KEY_PASSWORD`（或 `WIN_CSC_KEY_PASSWORD`）：仅由发布环境注入的证书密码。
- `TEST_DATABASE_URL`：专用、可清理的 PostgreSQL 集成测试数据库，禁止指向生产库。
- `QUANT_PREVIOUS_INSTALLER`：上一稳定版本的已签名 NSIS 安装包。
- 可选 `QUANT_DESKTOP_RELEASE_DIR`：发布输出目录；未提供时写入系统临时目录。

证书、密码和数据库凭据不得写入仓库、命令参数、报告或日志。执行：

```powershell
npm.cmd run package:win -w @quant/desktop
```

缺少任一必需输入时，脚本会在构建前失败。正式构建依次执行 quality、完整测试、官方 npm
registry audit、云端构建、renderer 构建、交易日历 90 天覆盖检查和 Electron 构建。PostgreSQL
测试没有 `TEST_DATABASE_URL` 时会被测试框架标记为跳过，因此正式脚本直接把该变量列为硬性输入。
正式构建还要求 Git worktree 为空，确保报告中的 revision 精确对应被签名的源代码状态。

## 签名与安装演练

electron-builder 仅从发布环境读取证书。打包后，发布脚本使用
`Get-AuthenticodeSignature` 检查安装包和主程序，状态不是 `Valid` 立即失败。

`scripts/windows-release-smoke.ps1` 在系统临时目录创建隔离的安装目录和 Electron
userData，自动执行：

1. 当前候选版本的干净安装和卸载。
2. 安装上一版本，然后用候选程序向 DuckDB 写入稳定 marker。
3. 覆盖安装候选版本并读取 marker，验证升级保留行情数据库。
4. 卸载、重新安装候选版本并再次读取 marker。
5. 卸载候选版本、安装上一版本并验证上一版本仍能启动。
6. 检查回滚过程中 DuckDB 文件仍存在，再清理隔离目录。

smoke 同时要求当前安装包、当前主程序和上一版本安装包的签名均为 `Valid`。不得把脚本的
临时安装目录改为真实用户目录或工作区。

## 发布报告

全部门禁通过后，输出目录生成：

- `release-report.json`
- `release-report.md`

报告包括安装包和主程序的 SHA-256、Authenticode 状态、Git revision、测试/audit
结果、交易日历覆盖、最新 PostgreSQL 迁移、已知限制和回滚步骤。只有报告中的所有门禁为
passed，且没有发布测试跳过，候选版本才可发布。

## 本地诊断包

设置页的“导出脱敏诊断包”调用无参数的只读 `diagnostics.exportPackage()` bridge。renderer
不能指定任意文件路径；保存位置由主进程对话框选择。导出的 `.tar.gz` 包括：

- 应用、Electron、平台和架构版本。
- 最多 2 MiB 的最近主进程日志，导出时再次脱敏。
- renderer 进程退出原因、退出码和时间，不记录页面 URL。
- 满足大小上限且未命中本地敏感模式扫描的 minidump。

邮箱、Bearer/JWT、cookie、密码、API key、refresh/access token、邀请码和验证码会从文本中
移除。minidump 是二进制内存快照，无法做语义级完全脱敏；命中敏感模式或超过大小限制的
dump 会被排除，并在 manifest 中只记录文件名和原因。原始 dump 始终留在本机，不会远程上传。

## 手动回滚

1. 停止并卸载当前版本，保留 Electron userData。
2. 使用发布报告对应、且已在 smoke 中验证的上一版本安装包重新安装。
3. 启动上一版本，检查 DuckDB 缓存、认证状态和工作台核心路径。
4. 云端只回滚应用版本。`001` 基线不可修改，后续迁移保持向后兼容；不得执行破坏性数据库降级。
5. 如需恢复数据库，使用部署前备份并按云端运维手册单独审批执行。
