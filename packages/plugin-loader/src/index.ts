export type PluginKind = "strategy" | "indicator" | "dataSource" | "export";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  entry: string;
  permissions: string[];
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  status: "registered" | "loaded" | "disabled";
}

export class PluginLoader {
  private readonly plugins = new Map<string, LoadedPlugin>();

  register(manifest: PluginManifest): LoadedPlugin {
    const plugin: LoadedPlugin = { manifest, status: "registered" };
    this.plugins.set(manifest.id, plugin);
    return plugin;
  }

  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }
}
