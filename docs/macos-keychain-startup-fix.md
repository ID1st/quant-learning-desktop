# macOS 启动卡死修复（0.1.10）

## 根因与证据

用户提供的 0.1.9 日志已记录 `desktop-ready` 和 `react-mounted`。用户随后提供的进程采样结论指向 `SecItemCopyMatching → SecKeychainItemCopyContent → SecurityServer::ClientSession::decrypt → semaphore_wait_trap`。

认证入口 `mainAuth.ts` 原先虽然写成 `async decrypt(...)`，函数内部仍调用同步 `safeStorage.decryptString()`。原生调用阻塞主线程时，`authTokenStore.ts` 的五秒 JavaScript 超时也无法获得执行机会。此前打包冒烟只检查根节点非空文字，曾将授权加载屏误报为启动成功；这不能证明旧用户数据启动正常。

## 修复

- 认证改用 Electron 42 提供的 `isAsyncEncryptionAvailable`、`encryptStringAsync`、`decryptStringAsync`。使用原生异步实现，不再在主线程调用同步 Keychain 接口。
- 五秒限时覆盖认证加密可用性检查、加密和解密。恢复失败/超时沿用清除失效认证会话的策略并回到未登录状态，仅涉及 `auth-session.enc`，不删除用户数据目录或研究资料。
- React 首次渲染直接显示登录表单，后台恢复期间不加载工作区。用户提交登录时等待已在执行的有限时恢复，防止迟到的旧恢复覆盖新登录会话。
- 打包冒烟必须确认认证状态已稳定、登录/工作区有可操作控件、主进程服务就绪，并保存实际页面截图。初始启动文字与授权加载状态不再视为成功。
- macOS 本地打包及 CI 增加旧会话故障注入：在隔离临时用户目录写入旧格式认证外壳，让异步解密永久 pending；验证等待期间已显示登录控件、超时后为 `SIGNED_OUT`、失效会话被清理。

异步接口由 Electron 在原生层处理 Keychain 工作，因此不需要额外引入 Utility Process 并迁移系统钥匙身份。它不会取消已经提交给系统的操作，但等待超时后的迟到结果不会写入会话或让用户自动登录。该选择依据 [Electron safeStorage 文档](https://www.electronjs.org/docs/latest/api/safe-storage)。

本次仅修改启动认证路径。行情 API 凭据存储仍沿用原有接口；这部分不参与登录页启动，如出现登录后的凭据操作阻塞应单独追踪。

## 验证与使用

新增测试覆盖原生异步适配、解密永久等待时事件循环仍响应、异步可用性返回 false 时禁止保存、后台恢复与手动登录竞争、启动冒烟不接受加载文字。

Windows 上已验证 Electron 真实异步加解密与旧同步密文兼容性。Mac 上的系统钥匙串故障需用用户机器复验；故障注入测试覆盖恢复控制流程，不声称模拟了 macOS Security.framework 的全部内部行为。

在已有 Mac 仓库中更新修复分支，并执行：

```bash
git pull --ff-only origin codex/audit-remediation-20260921
bash scripts/package-macos.sh internal arm64
```

Intel Mac 使用 `internal x64`。脚本会执行依赖安装、质量检查、打包和三种启动测试；任一失败都会停止，不输出打包成功。终端中的 `Startup verification output` 路径保存 JSON 与截图。正式签名/公证仍需自己的 Apple 证书，内部包不提供 Apple 公证。
