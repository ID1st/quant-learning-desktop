export type PluginCapability = "strategy" | "indicator" | "data-source" | "export";
export type PluginKind = PluginCapability | "dataSource";
export type PluginPermission =
  | "market-data:read"
  | "market-data:subscribe"
  | "strategy:run"
  | "strategy:backtest"
  | "chart:overlay"
  | "file:read"
  | "file:write"
  | "network:request"
  | "settings:read";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  type: PluginCapability;
  kind: PluginCapability;
  main: string;
  entry: string;
  engine: {
    app?: string;
    pluginApi?: string;
  };
  permissions: PluginPermission[];
  capabilities: PluginCapability[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  status: "registered" | "loaded" | "disabled";
}

const pluginCapabilities = ["strategy", "indicator", "data-source", "export"] as const;
const pluginPermissions = [
  "market-data:read",
  "market-data:subscribe",
  "strategy:run",
  "strategy:backtest",
  "chart:overlay",
  "file:read",
  "file:write",
  "network:request",
  "settings:read",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`插件清单字段无效：${field}`);
  }

  return value.trim();
}

function normalizeCapability(value: unknown, field: string): PluginCapability {
  const capability = requireString(value, field);
  const normalized = capability === "dataSource" ? "data-source" : capability;

  if (!pluginCapabilities.includes(normalized as PluginCapability)) {
    throw new Error(`未知插件能力：${capability}`);
  }

  return normalized as PluginCapability;
}

function normalizeStringArray(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.trim().length === 0)
  ) {
    throw new Error(`插件清单字段无效：${field}`);
  }

  return value.map((item) => item.trim());
}

function normalizePermissions(value: unknown): PluginPermission[] {
  return normalizeStringArray(value, "permissions").map((permission) => {
    if (!pluginPermissions.includes(permission as PluginPermission)) {
      throw new Error(`未知插件权限：${permission}`);
    }

    return permission as PluginPermission;
  });
}

function normalizeCapabilities(value: unknown, fallback: PluginCapability): PluginCapability[] {
  const capabilities = normalizeStringArray(value, "capabilities").map((capability) =>
    normalizeCapability(capability, "capabilities"),
  );

  return capabilities.length > 0 ? Array.from(new Set(capabilities)) : [fallback];
}

function normalizeEngine(value: unknown): PluginManifest["engine"] {
  if (value === undefined) {
    return {};
  }

  if (!isRecord(value)) {
    throw new Error("插件清单字段无效：engine");
  }

  return {
    app: typeof value.app === "string" ? value.app.trim() : undefined,
    pluginApi: typeof value.pluginApi === "string" ? value.pluginApi.trim() : undefined,
  };
}

export function validatePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new Error("插件清单必须是对象");
  }

  const type = normalizeCapability(value.type ?? value.kind, "type");
  const entry = requireString(value.main ?? value.entry, "main");
  const capabilities = normalizeCapabilities(value.capabilities, type);

  return {
    id: requireString(value.id, "id"),
    name: requireString(value.name, "name"),
    version: requireString(value.version, "version"),
    type,
    kind: type,
    main: entry,
    entry,
    engine: normalizeEngine(value.engine),
    permissions: normalizePermissions(value.permissions),
    capabilities,
  };
}

export class PluginLoader {
  private readonly plugins = new Map<string, LoadedPlugin>();

  register(manifest: PluginManifest): LoadedPlugin {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`插件已注册：${manifest.id}`);
    }

    const plugin: LoadedPlugin = { manifest, status: "registered" };
    this.plugins.set(manifest.id, plugin);
    return plugin;
  }

  get(id: string): LoadedPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  listByCapability(capability: PluginCapability): LoadedPlugin[] {
    return this.list().filter((plugin) => plugin.manifest.capabilities.includes(capability));
  }
}
