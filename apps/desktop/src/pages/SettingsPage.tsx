import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FileArchive,
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
import { useI18n } from "../i18n/I18nProvider";
import { APP_TIME_ZONE_OPTIONS, type AppTimeZone } from "../i18n/dateTime";
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

export function SettingsPage() {
  const { formatDateTime, resolvedTimeZone, setTimeZone, t, timeZone } = useI18n();
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
  const [diagnosticMessage, setDiagnosticMessage] = useState("");
  const [isDiagnosticExportPending, setDiagnosticExportPending] = useState(false);
  const [manifestDraft, setManifestDraft] = useState(sampleManifest);
  const [renewInviteCode, setRenewInviteCode] = useState("");
  const [renewMessage, setRenewMessage] = useState("");
  const [isRenewingEntitlement, setRenewingEntitlement] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
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
    const interval = window.setInterval(() => setCurrentTime(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

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
          setCacheMessage(t("行情缓存暂时不可用。"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

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
        t("已按保留策略清理 {bars} 根 K 线，移除 {entries} 个空缓存。", {
          bars: result.removedBars,
          entries: result.removedEntries,
        }),
      );
    } catch {
      setCacheMessage(t("行情缓存清理失败，请稍后重试。"));
    } finally {
      setCacheOperationPending(false);
    }
  };

  const handleClearCache = async () => {
    setCacheOperationPending(true);
    try {
      const removedEntries = await getMarketBarCacheRepository().clearAll();
      await refreshCacheSummary();
      setCacheMessage(t("已清空 {count} 个行情缓存条目。", { count: removedEntries }));
    } catch {
      setCacheMessage(t("行情缓存清空失败，请稍后重试。"));
    } finally {
      setCacheOperationPending(false);
    }
  };

  const handleExportDiagnostics = async () => {
    const bridge = window.quantDesktop?.diagnostics;
    if (!bridge) {
      setDiagnosticMessage(t("诊断导出仅在 Electron 桌面环境可用。"));
      return;
    }
    setDiagnosticExportPending(true);
    setDiagnosticMessage("");
    try {
      const result = await bridge.exportPackage();
      if (!result.ok) {
        setDiagnosticMessage(result.error.message);
        return;
      }
      setDiagnosticMessage(
        t("已导出 {fileName}，包含 {included} 个安全 minidump，排除 {excluded} 个。", {
          fileName: result.data.fileName,
          included: result.data.includedMinidumps,
          excluded: result.data.excludedMinidumps,
        }),
      );
    } catch {
      setDiagnosticMessage(t("诊断包导出失败。原始日志和崩溃文件仍保留在本机。"));
    } finally {
      setDiagnosticExportPending(false);
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
        setRenewMessage(t("当前不是 Electron 桌面运行环境。"));
        return;
      }
      if (!result.ok) {
        const message =
          result.error.code === "RATE_LIMITED" && result.error.retryAfterSeconds
            ? t("操作过于频繁，请在 {seconds} 秒后重试。", {
                seconds: result.error.retryAfterSeconds,
              })
            : t(authErrorMessage(result.error.code, result.error.retryAfterSeconds));
        setRenewMessage(
          result.error.requestId
            ? t("{message} 请求编号：{requestId}", {
                message,
                requestId: result.error.requestId,
              })
            : message,
        );
        return;
      }
      setRenewInviteCode("");
      setRenewMessage(
        t("续期成功，新的到期时间为 {date}", {
          date: formatDateTime(result.data.entitlementEndsAt),
        }),
      );
    } catch {
      setRenewMessage(t("邀请码格式不正确，请输入 QLD-XXXXX-XXXXX-XXXXX。"));
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
    if (
      window.confirm(
        t("确定卸载插件“{name}”吗？已保存的策略数据不会被删除。", { name: pluginName }),
      )
    ) {
      void uninstallPlugin(pluginId);
    }
  };

  return (
    <article className="settings-page">
      <header className="module-header">
        <p>{t("系统设置")}</p>
        <h1>{t("插件与本地扩展")}</h1>
        <span>
          {t(
            "统一管理策略插件、指标插件、数据源插件和导出插件。当前桌面版支持本地策略与指标插件的安装、启停和卸载；第三方插件执行将在隔离宿主完成后恢复。",
          )}
        </span>
      </header>

      <section className="module-card locale-timezone-panel">
        <div className="module-card-header">
          <Clock3 size={20} />
          <div>
            <h2>{t("语言与时间")}</h2>
            <p>{t("选择界面显示时区；交易日历、市场时段和策略计算仍使用交易所时区。")}</p>
          </div>
        </div>
        <div className="timezone-settings-grid">
          <label htmlFor="display-time-zone">
            <span>{t("时区")}</span>
            <select
              id="display-time-zone"
              onChange={(event) => setTimeZone(event.currentTarget.value as AppTimeZone)}
              value={timeZone}
            >
              {APP_TIME_ZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)} · {option.value === "system" ? resolvedTimeZone : option.value}
                </option>
              ))}
            </select>
            <small>{t("当前时区：{zone}", { zone: resolvedTimeZone })}</small>
          </label>
          <div className="timezone-preview">
            <span>{t("当前时间")}</span>
            <time dateTime={currentTime.toISOString()}>{formatDateTime(currentTime, true)}</time>
          </div>
        </div>
      </section>

      {authSession && (
        <section className="module-card account-entitlement-panel">
          <div className="module-card-header">
            <CalendarClock size={20} />
            <div>
              <h2>{t("账号与测试资格")}</h2>
              <p>{t("云端资格控制工作区访问；普通退出登录不会删除本机研究资料。")}</p>
            </div>
          </div>
          <dl className="account-entitlement-grid">
            <div>
              <dt>{t("当前邮箱")}</dt>
              <dd>{authSession.email}</dd>
            </div>
            <div>
              <dt>{t("资格档位")}</dt>
              <dd>{t("{count} 天", { count: authSession.entitlementDurationDays })}</dd>
            </div>
            <div>
              <dt>{t("到期时间")}</dt>
              <dd>{formatDateTime(authSession.entitlementEndsAt)}</dd>
            </div>
            <div>
              <dt>{t("剩余天数")}</dt>
              <dd>
                {Math.max(
                  0,
                  Math.ceil((Date.parse(authSession.entitlementEndsAt) - Date.now()) / 86_400_000),
                )}{" "}
                {t("天")}
              </dd>
            </div>
            <div>
              <dt>{t("授权状态")}</dt>
              <dd>{authSession.isOffline ? t("离线授权") : t("在线已验证")}</dd>
            </div>
            <div>
              <dt>{t("活跃设备")}</dt>
              <dd>{authSession.activeDeviceCount}/2</dd>
            </div>
          </dl>
          <div className="account-renewal-row">
            <div className="input-shell">
              <KeyRound size={16} />
              <input
                aria-label={t("提前续期邀请码")}
                maxLength={64}
                onChange={(event) => setRenewInviteCode(event.currentTarget.value)}
                placeholder={t("输入新邀请码提前续期")}
                value={renewInviteCode}
              />
            </div>
            <button
              disabled={!renewInviteCode.trim() || isRenewingEntitlement}
              onClick={() => void handleRenewEntitlement()}
              type="button"
            >
              {isRenewingEntitlement ? t("正在续期…") : t("提前续期")}
            </button>
            <button
              aria-haspopup="dialog"
              className="danger"
              onClick={() => setIsLogoutConfirmOpen(true)}
              ref={logoutButtonRef}
              type="button"
            >
              <LogOut size={14} />
              {t("退出登录")}
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

      <section className="settings-summary-grid" aria-label={t("插件能力概览")}>
        {capabilitySummary.map((item) => (
          <div className="module-card settings-stat-card" key={item.capability}>
            <Boxes size={18} />
            <span>
              {t("{capability}能力", { capability: t(capabilityLabels[item.capability]) })}
            </span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </section>

      <section className="module-card cache-governance-panel">
        <div className="module-card-header">
          <DatabaseZap size={20} />
          <div>
            <h2>{t("行情缓存治理")}</h2>
            <p>
              {t(
                "本地 K 线缓存按市场、标的和周期建立索引，短周期数据使用更短保留策略，避免缓存长期膨胀。",
              )}
            </p>
          </div>
        </div>

        <div className="cache-governance-grid">
          <div className="cache-stat">
            <span>{t("缓存条目")}</span>
            <strong>{cacheSummary.entries.length}</strong>
          </div>
          <div className="cache-stat">
            <span>{t("K 线数量")}</span>
            <strong>{cacheSummary.totalBarCount}</strong>
          </div>
          <div className="cache-stat">
            <span>{t("估算大小")}</span>
            <strong>{formatCacheBytes(cacheSummary.totalEstimatedBytes)}</strong>
          </div>
          <div className="cache-stat">
            <span>{t("最近更新")}</span>
            <strong>
              {cacheSummary.updatedAt ? formatDateTime(cacheSummary.updatedAt) : t("暂无记录")}
            </strong>
          </div>
        </div>

        <div className="cache-entry-list" aria-label={t("行情缓存条目")}>
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
                <em>{t("{count} 根", { count: entry.barCount })}</em>
                <small>{t("保留 {count} 天", { count: entry.retentionDays })}</small>
              </div>
            ))
          ) : (
            <div className="cache-empty-state">
              {t("暂无 K 线缓存。完成数据源绑定和初始同步后，这里会显示缓存治理状态。")}
            </div>
          )}
        </div>

        <div className="cache-governance-actions">
          <button disabled={isCacheOperationPending} onClick={handlePruneCache} type="button">
            <RefreshCw size={15} />
            {t("按策略清理")}
          </button>
          <button
            className="danger"
            disabled={isCacheOperationPending || cacheSummary.entries.length === 0}
            onClick={handleClearCache}
            type="button"
          >
            <Trash2 size={15} />
            {t("清空行情缓存")}
          </button>
          {cacheMessage && <span>{cacheMessage}</span>}
        </div>
      </section>

      <section className="module-card diagnostic-export-panel">
        <div className="module-card-header">
          <FileArchive size={20} />
          <div>
            <h2>{t("本地诊断包")}</h2>
            <p>
              {t(
                "导出应用与 Electron 版本、脱敏主进程日志、renderer 崩溃记录，以及通过敏感信息扫描的本地 minidump。崩溃数据不会自动上传。",
              )}
            </p>
          </div>
        </div>
        <div className="cache-governance-actions">
          <button
            disabled={isDiagnosticExportPending}
            onClick={() => void handleExportDiagnostics()}
            type="button"
          >
            <FileArchive size={15} />
            {isDiagnosticExportPending ? t("正在导出…") : t("导出脱敏诊断包")}
          </button>
          {diagnosticMessage && (
            <span aria-live="polite" role="status">
              {diagnosticMessage}
            </span>
          )}
        </div>
      </section>

      <section className="settings-grid">
        <div className="module-card plugin-install-panel">
          <div className="module-card-header">
            <FileInput size={20} />
            <div>
              <h2>{t("安装入口")}</h2>
              <p>{t("后续用户策略和第三方插件都从这里进入，不直接绕过插件清单与权限检查。")}</p>
            </div>
          </div>

          <div className="plugin-drop-zone">
            <PlugZap size={24} />
            <strong>{t("选择插件包")}</strong>
            <span>
              {t(
                "选择包含 plugin.json 的本地目录。桌面主进程会校验清单、入口和权限后复制到受控插件目录。",
              )}
            </span>
            <button
              disabled={pluginRuntimeStatus === "loading" || pluginRuntimeStatus === "unavailable"}
              onClick={handleInstallPlugin}
              type="button"
            >
              {pluginRuntimeStatus === "loading" ? t("正在处理…") : t("选择本地插件目录")}
            </button>
          </div>

          <ol className="plugin-step-list">
            {installSteps.map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{t(step)}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="module-card plugin-security-panel">
          <div className="module-card-header">
            <ShieldCheck size={20} />
            <div>
              <h2>{t("权限策略")}</h2>
              <p>
                {t(
                  "未知权限会被阻断；权限清单会为后续隔离运行时保留，当前不会执行第三方插件源码。",
                )}
              </p>
            </div>
          </div>

          <div className="permission-grid">
            {(Object.keys(permissionLabels) as PluginPermission[]).map((permission) => (
              <span key={permission}>{t(permissionLabels[permission])}</span>
            ))}
          </div>

          <div className="settings-note warning">
            <AlertTriangle size={16} />
            <span>
              {t(
                "插件包可先安装和管理，但当前不会执行。后续仅在独立 Worker 或工具进程中通过能力消息开放运行，交易凭证不会交给插件。",
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="module-card manifest-preview-panel">
        <div className="module-card-header">
          <FileInput size={20} />
          <div>
            <h2>{t("插件清单预检")}</h2>
            <p>
              {t(
                "先验证 plugin.json 的结构、权限、能力与版本要求。桌面安装时会对实际选择目录再次执行同一套校验。",
              )}
            </p>
          </div>
        </div>

        <div className="manifest-preview-grid">
          <label className="manifest-editor">
            <span>plugin.json</span>
            <textarea
              aria-label={t("插件清单 JSON")}
              onChange={(event) => setManifestDraft(event.target.value)}
              spellCheck={false}
              value={manifestDraft}
            />
          </label>

          <div className={manifestPreview.ok ? "manifest-result valid" : "manifest-result invalid"}>
            {manifestPreview.ok ? (
              <>
                <CheckCircle2 size={20} />
                <strong>{t("清单预检通过")}</strong>
                <span>{manifestPreview.manifest.name}</span>
                <dl>
                  <div>
                    <dt>{t("插件 ID")}</dt>
                    <dd>{manifestPreview.manifest.id}</dd>
                  </div>
                  <div>
                    <dt>{t("版本")}</dt>
                    <dd>{manifestPreview.manifest.version}</dd>
                  </div>
                  <div>
                    <dt>{t("入口")}</dt>
                    <dd>{manifestPreview.manifest.main}</dd>
                  </div>
                </dl>
                <div className="manifest-chip-group">
                  {manifestPreview.manifest.capabilities.map((capability) => (
                    <b key={capability}>{t(capabilityLabels[capability])}</b>
                  ))}
                  {manifestPreview.manifest.permissions.map((permission) => (
                    <em key={permission}>{t(permissionLabels[permission])}</em>
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
                    {t("安装本地插件目录")}
                  </button>
                  <small>
                    {manifestPreview.summary.requiresPermissionApproval
                      ? t("安装时会复核目录中的清单与权限。")
                      : t("该插件未声明额外权限。")}
                  </small>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle size={20} />
                <strong>{t("清单预检未通过")}</strong>
                <span>{t(manifestPreview.error.message)}</span>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="module-card plugin-pending-panel">
        <div className="module-card-header">
          <PackageCheck size={20} />
          <div>
            <h2>{t("插件运行时状态")}</h2>
            <p>{t("第三方插件执行已暂停，等待独立运行宿主、资源限制和终止控制完成。")}</p>
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
          <span>{t(pluginRuntimeMessage)}</span>
        </div>
      </section>

      <section className="module-card plugin-registry-panel">
        <div className="module-card-header">
          <PackageCheck size={20} />
          <div>
            <h2>{t("已安装插件")}</h2>
            <p>{t("启用状态会保留，但在隔离运行时交付前不会向策略引擎或图表注册第三方能力。")}</p>
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
                    ? t("已启用")
                    : plugin.status === "disabled"
                      ? t("已停用")
                      : t("运行异常")}
                </small>
                <button
                  onClick={() =>
                    void setPluginEnabled(plugin.manifest.id, plugin.status !== "enabled")
                  }
                  type="button"
                >
                  <Power size={14} />
                  {plugin.status === "enabled" ? t("停用") : t("启用")}
                </button>
                <button
                  className="danger"
                  onClick={() => handleUninstallPlugin(plugin.manifest.id, plugin.manifest.name)}
                  type="button"
                >
                  <Trash2 size={14} />
                  {t("卸载")}
                </button>
              </div>
            ))
          ) : (
            <div className="plugin-empty-state">
              {t("暂无已安装插件。请选择一个受信任的本地插件目录。")}
            </div>
          )}
        </div>
      </section>
    </article>
  );
}
