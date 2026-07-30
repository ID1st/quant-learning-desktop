import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  DatabaseZap,
  FileInput,
  KeyRound,
  LogOut,
  PackageCheck,
  PlugZap,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLocalPluginInstallBridge,
  type PluginManifestPreflightResult,
} from "@quant/api-client";
import { type PluginCapability, type PluginPermission } from "@quant/plugin-loader";
import { getMarketBarCacheRepository } from "../features/marketData/marketBarCacheClient";
import type { MarketBarCacheSummary } from "../features/marketData/marketBarCacheService";
import { usePluginRuntimeStore } from "../features/plugins/pluginRuntimeStore";
import {
  authErrorMessage,
  getAuthBridge,
  normalizeInviteInput,
} from "../features/auth/authService";
import { useAuthStore } from "../features/auth/authStore";
import { LogoutConfirmationDialog } from "../features/auth/LogoutConfirmationDialog";
import { useAppStore } from "../state/appStore";

const capabilityLabels: Record<PluginCapability, string> = {
  strategy: "策略",
  indicator: "指标",
  "data-source": "数据源",
  export: "导出",
};

const permissionLabels: Record<PluginPermission, string> = {
  "market-data:read": "读取行情",
  "market-data:subscribe": "订阅行情",
  "strategy:run": "运行策略",
  "strategy:backtest": "策略回测",
  "chart:overlay": "图表图层",
  "file:read": "读取文件",
  "file:write": "写入文件",
  "network:request": "网络请求",
  "settings:read": "读取设置",
};

const installSteps = [
  "选择本地插件包或策略包",
  "读取 plugin.json 并校验版本",
  "展示权限变更并等待确认",
  "注册能力到策略或指标模块",
];

const sampleManifest = JSON.stringify(
  {
    id: "com.example.strategy.pine-demo",
    name: "Pine 策略示例",
    version: "1.0.0",
    type: "strategy",
    main: "dist/index.js",
    engine: {
      app: ">=0.1.0",
      pluginApi: ">=0.1.0",
    },
    permissions: ["market-data:read", "strategy:run", "chart:overlay"],
    capabilities: ["strategy"],
  },
  null,
  2,
);

const pluginInstallBridge = createLocalPluginInstallBridge();

function formatCacheBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatCacheTime(value?: string) {
  if (!value) {
    return "暂无记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function SettingsPage() {
  const authSession = useAuthStore((state) => state.session);
  const clearAuthSession = useAuthStore((state) => state.clearSession);
  const navigate = useAppStore((state) => state.navigate);
  const registeredPlugins = usePluginRuntimeStore((state) => state.plugins);
  const pluginRuntimeStatus = usePluginRuntimeStore((state) => state.status);
  const pluginRuntimeMessage = usePluginRuntimeStore((state) => state.message);
  const refreshPluginRuntime = usePluginRuntimeStore((state) => state.refresh);
  const installLocalPlugin = usePluginRuntimeStore((state) => state.installLocalPlugin);
  const setPluginEnabled = usePluginRuntimeStore((state) => state.setEnabled);
  const uninstallPlugin = usePluginRuntimeStore((state) => state.uninstall);
  const [cacheSummary, setCacheSummary] = useState<MarketBarCacheSummary>({
    entries: [],
    totalBarCount: 0,
    totalEstimatedBytes: 0,
  });
  const [cacheMessage, setCacheMessage] = useState("");
  const [isCacheOperationPending, setCacheOperationPending] = useState(false);
  const [manifestDraft, setManifestDraft] = useState(sampleManifest);
  const [renewInviteCode, setRenewInviteCode] = useState("");
  const [renewMessage, setRenewMessage] = useState("");
  const [isRenewingEntitlement, setRenewingEntitlement] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutButtonRef = useRef<HTMLButtonElement>(null);
  const [manifestPreview, setManifestPreview] = useState<PluginManifestPreflightResult>({
    ok: false,
    error: {
      code: "EMPTY_MANIFEST",
      message: "请粘贴 plugin.json 内容后再进行预检。",
    },
  });

  useEffect(() => {
    let cancelled = false;

    pluginInstallBridge.preflightManifest({ manifestText: manifestDraft }).then((result) => {
      if (!cancelled) {
        setManifestPreview(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [manifestDraft]);

  useEffect(() => {
    void refreshPluginRuntime();
  }, [refreshPluginRuntime]);

  useEffect(() => {
    let cancelled = false;
    void getMarketBarCacheRepository()
      .summary()
      .then((summary) => {
        if (!cancelled) {
          setCacheSummary(summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCacheMessage("行情缓存暂时不可用。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const previewManifest = manifestPreview.ok ? manifestPreview.manifest : null;
  const capabilitySummary = (
    ["strategy", "indicator", "data-source", "export"] as PluginCapability[]
  ).map((capability) => ({
    capability,
    count: registeredPlugins.filter((plugin) => plugin.manifest.capabilities.includes(capability))
      .length,
  }));
  const largestCacheEntries = [...cacheSummary.entries]
    .sort((left, right) => right.estimatedBytes - left.estimatedBytes)
    .slice(0, 4);

  const refreshCacheSummary = async () => {
    setCacheSummary(await getMarketBarCacheRepository().summary());
  };

  const handlePruneCache = async () => {
    setCacheOperationPending(true);
    try {
      const result = await getMarketBarCacheRepository().prune();
      await refreshCacheSummary();
      setCacheMessage(
        `已按保留策略清理 ${result.removedBars} 根 K 线，移除 ${result.removedEntries} 个空缓存。`,
      );
    } catch {
      setCacheMessage("行情缓存清理失败，请稍后重试。");
    } finally {
      setCacheOperationPending(false);
    }
  };

  const handleClearCache = async () => {
    setCacheOperationPending(true);
    try {
      const removedEntries = await getMarketBarCacheRepository().clearAll();
      await refreshCacheSummary();
      setCacheMessage(`已清空 ${removedEntries} 个行情缓存条目。`);
    } catch {
      setCacheMessage("行情缓存清空失败，请稍后重试。");
    } finally {
      setCacheOperationPending(false);
    }
  };

  const handleInstallPlugin = () => void installLocalPlugin();

  const handleRenewEntitlement = async () => {
    setRenewMessage("");
    setRenewingEntitlement(true);
    try {
      const result = await getAuthBridge()?.renewEntitlement({
        inviteCode: normalizeInviteInput(renewInviteCode),
      });
      if (!result) {
        setRenewMessage("当前不是 Electron 桌面运行环境。");
        return;
      }
      if (!result.ok) {
        setRenewMessage(authErrorMessage(result.error.code, result.error.retryAfterSeconds));
        return;
      }
      setRenewInviteCode("");
      setRenewMessage(
        `续期成功，新的到期时间为 ${new Date(result.data.entitlementEndsAt).toLocaleString("zh-CN", { hour12: false })}`,
      );
    } finally {
      setRenewingEntitlement(false);
    }
  };

  const closeLogoutConfirmation = useCallback(() => {
    setIsLogoutConfirmOpen(false);
  }, []);

  const handleAccountLogout = async () => {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await getAuthBridge()?.logout();
      clearAuthSession();
      navigate("login");
    } finally {
      setIsLoggingOut(false);
      setIsLogoutConfirmOpen(false);
    }
  };

  const handleUninstallPlugin = (pluginId: string, pluginName: string) => {
    if (window.confirm(`确定卸载插件“${pluginName}”吗？已保存的策略数据不会被删除。`)) {
      void uninstallPlugin(pluginId);
    }
  };

  return (
    <article className="settings-page">
      <header className="module-header">
        <p>系统设置</p>
        <h1>插件与本地扩展</h1>
        <span>
          统一管理策略插件、指标插件、数据源插件和导出插件。当前桌面版支持本地策略与指标插件的安装、启停和卸载；第三方插件执行将在隔离宿主完成后恢复。
        </span>
      </header>

      {authSession && (
        <section className="module-card account-entitlement-panel">
          <div className="module-card-header">
            <CalendarClock size={20} />
            <div>
              <h2>账号与测试资格</h2>
              <p>云端资格控制工作区访问；普通退出登录不会删除本机研究资料。</p>
            </div>
          </div>
          <dl className="account-entitlement-grid">
            <div>
              <dt>当前邮箱</dt>
              <dd>{authSession.email}</dd>
            </div>
            <div>
              <dt>资格档位</dt>
              <dd>{authSession.entitlementDurationDays} 天</dd>
            </div>
            <div>
              <dt>到期时间</dt>
              <dd>
                {new Date(authSession.entitlementEndsAt).toLocaleString("zh-CN", { hour12: false })}
              </dd>
            </div>
            <div>
              <dt>剩余天数</dt>
              <dd>
                {Math.max(
                  0,
                  Math.ceil((Date.parse(authSession.entitlementEndsAt) - Date.now()) / 86_400_000),
                )}{" "}
                天
              </dd>
            </div>
            <div>
              <dt>授权状态</dt>
              <dd>{authSession.isOffline ? "离线授权" : "在线已验证"}</dd>
            </div>
            <div>
              <dt>活跃设备</dt>
              <dd>{authSession.activeDeviceCount}/2</dd>
            </div>
          </dl>
          <div className="account-renewal-row">
            <div className="input-shell">
              <KeyRound size={16} />
              <input
                aria-label="提前续期邀请码"
                maxLength={64}
                onChange={(event) => setRenewInviteCode(event.currentTarget.value)}
                placeholder="输入新邀请码提前续期"
                value={renewInviteCode}
              />
            </div>
            <button
              disabled={!renewInviteCode.trim() || isRenewingEntitlement}
              onClick={() => void handleRenewEntitlement()}
              type="button"
            >
              {isRenewingEntitlement ? "正在续期…" : "提前续期"}
            </button>
            <button
              aria-haspopup="dialog"
              className="danger"
              onClick={() => setIsLogoutConfirmOpen(true)}
              ref={logoutButtonRef}
              type="button"
            >
              <LogOut size={14} />
              退出登录
            </button>
          </div>
          {renewMessage && (
            <div aria-live="polite" className="settings-note">
              {renewMessage}
            </div>
          )}
        </section>
      )}

      {isLogoutConfirmOpen && authSession && (
        <LogoutConfirmationDialog
          isSubmitting={isLoggingOut}
          onCancel={closeLogoutConfirmation}
          onConfirm={() => void handleAccountLogout()}
          returnFocusRef={logoutButtonRef}
          session={authSession}
        />
      )}

      <section className="settings-summary-grid" aria-label="插件能力概览">
        {capabilitySummary.map((item) => (
          <div className="module-card settings-stat-card" key={item.capability}>
            <Boxes size={18} />
            <span>{capabilityLabels[item.capability]}能力</span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </section>

      <section className="module-card cache-governance-panel">
        <div className="module-card-header">
          <DatabaseZap size={20} />
          <div>
            <h2>行情缓存治理</h2>
            <p>
              本地 K
              线缓存按市场、标的和周期建立索引，短周期数据使用更短保留策略，避免缓存长期膨胀。
            </p>
          </div>
        </div>

        <div className="cache-governance-grid">
          <div className="cache-stat">
            <span>缓存条目</span>
            <strong>{cacheSummary.entries.length}</strong>
          </div>
          <div className="cache-stat">
            <span>K 线数量</span>
            <strong>{cacheSummary.totalBarCount}</strong>
          </div>
          <div className="cache-stat">
            <span>估算大小</span>
            <strong>{formatCacheBytes(cacheSummary.totalEstimatedBytes)}</strong>
          </div>
          <div className="cache-stat">
            <span>最近更新</span>
            <strong>{formatCacheTime(cacheSummary.updatedAt)}</strong>
          </div>
        </div>

        <div className="cache-entry-list" aria-label="行情缓存条目">
          {largestCacheEntries.length > 0 ? (
            largestCacheEntries.map((entry) => (
              <div
                className="cache-entry-row"
                key={`${entry.market}-${entry.symbol}-${entry.timeframe}`}
              >
                <span>
                  <strong>{entry.symbol}</strong>
                  <small>
                    {entry.market} / {entry.timeframe} / {entry.provider}
                  </small>
                </span>
                <em>{entry.barCount} 根</em>
                <small>保留 {entry.retentionDays} 天</small>
              </div>
            ))
          ) : (
            <div className="cache-empty-state">
              暂无 K 线缓存。完成数据源绑定和初始同步后，这里会显示缓存治理状态。
            </div>
          )}
        </div>

        <div className="cache-governance-actions">
          <button disabled={isCacheOperationPending} onClick={handlePruneCache} type="button">
            <RefreshCw size={15} />
            按策略清理
          </button>
          <button
            className="danger"
            disabled={isCacheOperationPending || cacheSummary.entries.length === 0}
            onClick={handleClearCache}
            type="button"
          >
            <Trash2 size={15} />
            清空行情缓存
          </button>
          {cacheMessage && <span>{cacheMessage}</span>}
        </div>
      </section>

      <section className="settings-grid">
        <div className="module-card plugin-install-panel">
          <div className="module-card-header">
            <FileInput size={20} />
            <div>
              <h2>安装入口</h2>
              <p>后续用户策略和第三方插件都从这里进入，不直接绕过插件清单与权限检查。</p>
            </div>
          </div>

          <div className="plugin-drop-zone">
            <PlugZap size={24} />
            <strong>选择插件包</strong>
            <span>
              选择包含 plugin.json
              的本地目录。桌面主进程会校验清单、入口和权限后复制到受控插件目录。
            </span>
            <button
              disabled={pluginRuntimeStatus === "loading" || pluginRuntimeStatus === "unavailable"}
              onClick={handleInstallPlugin}
              type="button"
            >
              {pluginRuntimeStatus === "loading" ? "正在处理…" : "选择本地插件目录"}
            </button>
          </div>

          <ol className="plugin-step-list">
            {installSteps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="module-card plugin-security-panel">
          <div className="module-card-header">
            <ShieldCheck size={20} />
            <div>
              <h2>权限策略</h2>
              <p>未知权限会被阻断；权限清单会为后续隔离运行时保留，当前不会执行第三方插件源码。</p>
            </div>
          </div>

          <div className="permission-grid">
            {(Object.keys(permissionLabels) as PluginPermission[]).map((permission) => (
              <span key={permission}>{permissionLabels[permission]}</span>
            ))}
          </div>

          <div className="settings-note warning">
            <AlertTriangle size={16} />
            <span>
              插件包可先安装和管理，但当前不会执行。后续仅在独立 Worker
              或工具进程中通过能力消息开放运行，交易凭证不会交给插件。
            </span>
          </div>
        </div>
      </section>

      <section className="module-card manifest-preview-panel">
        <div className="module-card-header">
          <FileInput size={20} />
          <div>
            <h2>插件清单预检</h2>
            <p>
              先验证 plugin.json
              的结构、权限、能力与版本要求。桌面安装时会对实际选择目录再次执行同一套校验。
            </p>
          </div>
        </div>

        <div className="manifest-preview-grid">
          <label className="manifest-editor">
            <span>plugin.json</span>
            <textarea
              aria-label="插件清单 JSON"
              onChange={(event) => setManifestDraft(event.target.value)}
              spellCheck={false}
              value={manifestDraft}
            />
          </label>

          <div className={manifestPreview.ok ? "manifest-result valid" : "manifest-result invalid"}>
            {manifestPreview.ok ? (
              <>
                <CheckCircle2 size={20} />
                <strong>清单预检通过</strong>
                <span>{manifestPreview.manifest.name}</span>
                <dl>
                  <div>
                    <dt>插件 ID</dt>
                    <dd>{manifestPreview.manifest.id}</dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>{manifestPreview.manifest.version}</dd>
                  </div>
                  <div>
                    <dt>入口</dt>
                    <dd>{manifestPreview.manifest.main}</dd>
                  </div>
                </dl>
                <div className="manifest-chip-group">
                  {manifestPreview.manifest.capabilities.map((capability) => (
                    <b key={capability}>{capabilityLabels[capability]}</b>
                  ))}
                  {manifestPreview.manifest.permissions.map((permission) => (
                    <em key={permission}>{permissionLabels[permission]}</em>
                  ))}
                </div>
                <div className="plugin-confirm-actions">
                  <button
                    disabled={
                      pluginRuntimeStatus === "loading" || pluginRuntimeStatus === "unavailable"
                    }
                    onClick={handleInstallPlugin}
                    type="button"
                  >
                    安装本地插件目录
                  </button>
                  <small>
                    {manifestPreview.summary.requiresPermissionApproval
                      ? "安装时会复核目录中的清单与权限。"
                      : "该插件未声明额外权限。"}
                  </small>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle size={20} />
                <strong>清单预检未通过</strong>
                <span>{manifestPreview.error.message}</span>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="module-card plugin-pending-panel">
        <div className="module-card-header">
          <PackageCheck size={20} />
          <div>
            <h2>插件运行时状态</h2>
            <p>第三方插件执行已暂停，等待独立运行宿主、资源限制和终止控制完成。</p>
          </div>
        </div>
        <div
          className={`settings-note ${pluginRuntimeStatus === "error" || pluginRuntimeStatus === "degraded" ? "warning" : ""}`}
        >
          {pluginRuntimeStatus === "error" || pluginRuntimeStatus === "degraded" ? (
            <AlertTriangle size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          <span>{pluginRuntimeMessage}</span>
        </div>
      </section>

      <section className="module-card plugin-registry-panel">
        <div className="module-card-header">
          <PackageCheck size={20} />
          <div>
            <h2>已安装插件</h2>
            <p>启用状态会保留，但在隔离运行时交付前不会向策略引擎或图表注册第三方能力。</p>
          </div>
        </div>

        <div className="plugin-registry-list">
          {registeredPlugins.length > 0 ? (
            registeredPlugins.map((plugin) => (
              <div className="plugin-registry-row" key={plugin.manifest.id}>
                <CheckCircle2 size={17} />
                <span>
                  <strong>{plugin.manifest.name}</strong>
                  <small>{plugin.manifest.id}</small>
                </span>
                <em>{plugin.manifest.version}</em>
                <div>
                  {plugin.manifest.capabilities.map((capability) => (
                    <b key={capability}>{capabilityLabels[capability]}</b>
                  ))}
                </div>
                <small>
                  {plugin.status === "enabled"
                    ? "已启用"
                    : plugin.status === "disabled"
                      ? "已停用"
                      : "运行异常"}
                </small>
                <button
                  onClick={() =>
                    void setPluginEnabled(plugin.manifest.id, plugin.status !== "enabled")
                  }
                  type="button"
                >
                  <Power size={14} />
                  {plugin.status === "enabled" ? "停用" : "启用"}
                </button>
                <button
                  className="danger"
                  onClick={() => handleUninstallPlugin(plugin.manifest.id, plugin.manifest.name)}
                  type="button"
                >
                  <Trash2 size={14} />
                  卸载
                </button>
              </div>
            ))
          ) : (
            <div className="plugin-empty-state">
              暂无已安装插件。请选择一个受信任的本地插件目录。
            </div>
          )}
        </div>
      </section>
    </article>
  );
}
