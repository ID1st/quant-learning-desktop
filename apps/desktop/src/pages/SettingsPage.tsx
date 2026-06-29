import { AlertTriangle, Boxes, CheckCircle2, FileInput, PackageCheck, PlugZap, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createLocalPluginInstallBridge, type PluginManifestPreflightResult } from "@quant/api-client";
import { PluginLoader, validatePluginManifest, type PluginCapability, type PluginManifest, type PluginPermission } from "@quant/plugin-loader";

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

const loader = new PluginLoader();

const builtinPlugins = [
  validatePluginManifest({
    id: "quant.internal.strategy-presets",
    name: "预制策略适配器",
    version: "0.1.0",
    type: "strategy",
    main: "internal://strategy-presets",
    engine: {
      app: ">=0.1.0",
      pluginApi: ">=0.1.0",
    },
    permissions: ["market-data:read", "strategy:run", "chart:overlay"],
    capabilities: ["strategy"],
  }),
  validatePluginManifest({
    id: "quant.internal.export-preview",
    name: "本地导出适配器",
    version: "0.1.0",
    type: "export",
    main: "internal://export-preview",
    engine: {
      app: ">=0.1.0",
      pluginApi: ">=0.1.0",
    },
    permissions: ["file:write"],
    capabilities: ["export"],
  }),
];

builtinPlugins.forEach((manifest) => {
  if (!loader.get(manifest.id)) {
    loader.register(manifest);
  }
});

const capabilitySummary = (["strategy", "indicator", "data-source", "export"] as PluginCapability[]).map((capability) => ({
  capability,
  count: loader.listByCapability(capability).length,
}));

const installSteps = [
  "选择本地插件包或策略包",
  "读取 plugin.json 并校验版本",
  "展示权限变更并等待确认",
  "注册能力到策略、指标或数据源模块",
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

export function SettingsPage() {
  const registeredPlugins = loader.list();
  const [manifestDraft, setManifestDraft] = useState(sampleManifest);
  const [pendingInstalls, setPendingInstalls] = useState<PluginManifest[]>([]);
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

  const previewManifest = manifestPreview.ok ? manifestPreview.manifest : null;
  const alreadyPending = previewManifest ? pendingInstalls.some((plugin) => plugin.id === previewManifest.id) : false;

  const handleConfirmInstall = () => {
    if (!previewManifest || alreadyPending) {
      return;
    }

    setPendingInstalls((plugins) => [...plugins, previewManifest]);
  };

  return (
    <article className="settings-page">
      <header className="module-header">
        <p>系统设置</p>
        <h1>插件与本地扩展</h1>
        <span>统一管理策略插件、指标插件、数据源插件和导出插件。当前阶段只开放清单校验和能力注册入口，真实安装与热更新会在后续模块接入桌面本地服务。</span>
      </header>

      <section className="settings-summary-grid" aria-label="插件能力概览">
        {capabilitySummary.map((item) => (
          <div className="module-card settings-stat-card" key={item.capability}>
            <Boxes size={18} />
            <span>{capabilityLabels[item.capability]}能力</span>
            <strong>{item.count}</strong>
          </div>
        ))}
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
            <span>支持包含 plugin.json 的本地目录或压缩包。当前为界面入口，尚未执行文件读取。</span>
            <button onClick={() => setManifestDraft(sampleManifest)} type="button">
              载入示例清单
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
              <p>插件权限默认收敛，未知权限会被阻断，敏感权限后续需要用户二次确认。</p>
            </div>
          </div>

          <div className="permission-grid">
            {(Object.keys(permissionLabels) as PluginPermission[]).map((permission) => (
              <span key={permission}>{permissionLabels[permission]}</span>
            ))}
          </div>

          <div className="settings-note warning">
            <AlertTriangle size={16} />
            <span>真实插件执行前还需要接入隔离运行环境，避免插件直接访问交易凭证、Node 全局对象和本地文件。</span>
          </div>
        </div>
      </section>

      <section className="module-card manifest-preview-panel">
        <div className="module-card-header">
          <FileInput size={20} />
          <div>
            <h2>插件清单预检</h2>
            <p>先验证 plugin.json 的结构、权限和能力声明。后续接入桌面文件选择器后，会复用同一套校验逻辑。</p>
          </div>
        </div>

        <div className="manifest-preview-grid">
          <label className="manifest-editor">
            <span>plugin.json</span>
            <textarea aria-label="插件清单 JSON" onChange={(event) => setManifestDraft(event.target.value)} spellCheck={false} value={manifestDraft} />
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
                  <button disabled={alreadyPending} onClick={handleConfirmInstall} type="button">
                    {alreadyPending ? "已加入待安装" : "确认模拟安装"}
                  </button>
                  <small>{manifestPreview.summary.requiresPermissionApproval ? "该插件声明了权限，真实安装时需要再次确认。" : "该插件未声明额外权限。"}</small>
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
            <h2>待安装队列</h2>
            <p>当前只记录模拟安装结果，不写入本地插件目录，也不会加载或执行插件入口。</p>
          </div>
        </div>

        {pendingInstalls.length > 0 ? (
          <div className="plugin-pending-list">
            {pendingInstalls.map((plugin) => (
              <div className="plugin-pending-row" key={plugin.id}>
                <CheckCircle2 size={17} />
                <span>
                  <strong>{plugin.name}</strong>
                  <small>{plugin.id}</small>
                </span>
                <em>{plugin.version}</em>
                <div>
                  {plugin.capabilities.map((capability) => (
                    <b key={capability}>{capabilityLabels[capability]}</b>
                  ))}
                </div>
                <small>模拟安装</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="plugin-empty-state">
            <span>暂无待安装插件。清单预检通过后，可先加入模拟安装队列。</span>
          </div>
        )}
      </section>

      <section className="module-card plugin-registry-panel">
        <div className="module-card-header">
          <PackageCheck size={20} />
          <div>
            <h2>已注册能力</h2>
            <p>内置策略先按插件能力模型登记，后续 Pine 转译策略和用户插件可以复用同一入口。</p>
          </div>
        </div>

        <div className="plugin-registry-list">
          {registeredPlugins.map((plugin) => (
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
              <small>{plugin.status === "registered" ? "已注册" : plugin.status}</small>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
