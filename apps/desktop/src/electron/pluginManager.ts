import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validatePluginManifest, type PluginManifest } from "@quant/plugin-loader";

export type PluginInstallStatus = "enabled" | "disabled" | "degraded";

export interface InstalledPluginRecord {
  readonly manifest: PluginManifest;
  readonly status: PluginInstallStatus;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly failureCount: number;
  readonly lastError?: string;
}

export interface PluginRuntimeModule {
  readonly plugin: InstalledPluginRecord;
  readonly source: string;
}

export interface PluginManager {
  list(): readonly InstalledPluginRecord[];
  installFromDirectory(sourceDirectory: string): Promise<InstalledPluginRecord>;
  setEnabled(pluginId: string, enabled: boolean): Promise<InstalledPluginRecord>;
  recordRuntimeFailure(pluginId: string, message: string): Promise<InstalledPluginRecord>;
  uninstall(pluginId: string): Promise<void>;
  readEnabledRuntimeModules(): Promise<readonly PluginRuntimeModule[]>;
}

export interface PluginManagerOptions {
  readonly pluginsDirectory: string;
}

const registryFileName = "registry.json";
const maxPackageBytes = 10 * 1024 * 1024;
const maxRuntimeModuleBytes = 256 * 1024;
const pluginIdPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const appVersion = "0.1.0";
const pluginApiVersion = "0.1.0";

export function createPluginManager(options: PluginManagerOptions): PluginManager {
  const pluginsDirectory = resolve(options.pluginsDirectory);
  let records = readRegistry(pluginsDirectory);

  const recordRuntimeFailure = async (
    pluginId: string,
    message: string,
  ): Promise<InstalledPluginRecord> => {
    const current = records.find((record) => record.manifest.id === pluginId);
    if (!current) {
      throw new Error(`Plugin not installed: ${pluginId}`);
    }

    const failureCount = current.failureCount + 1;
    const next: InstalledPluginRecord = {
      ...current,
      status: failureCount >= 3 ? "disabled" : "degraded",
      failureCount,
      lastError: sanitizeRuntimeError(message),
      updatedAt: new Date().toISOString(),
    };
    records = records.map((record) => (record.manifest.id === pluginId ? next : record));
    await writeRegistry(pluginsDirectory, records);
    return next;
  };

  return {
    list: () => [...records],
    async installFromDirectory(sourceDirectory) {
      const sourceRoot = await readSourceDirectory(sourceDirectory);
      const manifest = await readManifest(sourceRoot);
      assertCompatibleManifest(manifest);
      if (!canRunInRenderer(manifest)) {
        throw new Error(
          "This plugin uses a capability or permission that is not supported by the current desktop runtime.",
        );
      }
      await resolvePluginEntry(sourceRoot, manifest.main);
      const destination = getPluginDirectory(pluginsDirectory, manifest.id);
      const stagingDirectory = getManagedPath(
        pluginsDirectory,
        `.staging-${manifest.id}-${randomUUID()}`,
      );
      const backupDirectory = getManagedPath(
        pluginsDirectory,
        `.backup-${manifest.id}-${randomUUID()}`,
      );

      await mkdir(pluginsDirectory, { recursive: true, mode: 0o700 });
      try {
        await copyPluginDirectory(sourceRoot, stagingDirectory);
        await resolvePluginEntry(stagingDirectory, manifest.main);

        if (existsSync(destination)) {
          await rename(destination, backupDirectory);
        }

        try {
          await rename(stagingDirectory, destination);
        } catch (error) {
          if (existsSync(backupDirectory)) {
            await rename(backupDirectory, destination);
          }
          throw error;
        }

        const now = new Date().toISOString();
        const previous = records.find((record) => record.manifest.id === manifest.id);
        const record: InstalledPluginRecord = {
          manifest,
          status: "enabled",
          installedAt: previous?.installedAt ?? now,
          updatedAt: now,
          failureCount: 0,
        };
        records = [...records.filter((item) => item.manifest.id !== manifest.id), record].sort(
          compareRecords,
        );
        await writeRegistry(pluginsDirectory, records);
        await rm(backupDirectory, { recursive: true, force: true });
        return record;
      } finally {
        await rm(stagingDirectory, { recursive: true, force: true });
      }
    },
    async setEnabled(pluginId, enabled) {
      const current = records.find((record) => record.manifest.id === pluginId);
      if (!current) {
        throw new Error(`Plugin not installed: ${pluginId}`);
      }

      const next: InstalledPluginRecord = {
        ...current,
        status: enabled ? "enabled" : "disabled",
        updatedAt: new Date().toISOString(),
        ...(enabled ? { failureCount: 0 } : {}),
        ...(enabled ? { lastError: undefined } : {}),
      };
      records = records.map((record) => (record.manifest.id === pluginId ? next : record));
      await writeRegistry(pluginsDirectory, records);
      return next;
    },
    recordRuntimeFailure,
    async uninstall(pluginId) {
      const current = records.find((record) => record.manifest.id === pluginId);
      if (!current) {
        return;
      }

      await rm(getPluginDirectory(pluginsDirectory, pluginId), { recursive: true, force: true });
      records = records.filter((record) => record.manifest.id !== pluginId);
      await writeRegistry(pluginsDirectory, records);
    },
    async readEnabledRuntimeModules() {
      const enabled = records.filter(
        (record) => record.status === "enabled" && canRunInRenderer(record.manifest),
      );
      const modules: PluginRuntimeModule[] = [];

      for (const plugin of enabled) {
        try {
          const entry = await resolvePluginEntry(
            getPluginDirectory(pluginsDirectory, plugin.manifest.id),
            plugin.manifest.main,
          );
          const entryStats = await stat(entry);
          if (entryStats.size > maxRuntimeModuleBytes) {
            throw new Error(
              `Plugin runtime entry exceeds ${maxRuntimeModuleBytes} bytes: ${plugin.manifest.id}`,
            );
          }

          const source = await readFile(entry, "utf8");
          assertSelfContainedRuntimeSource(source);
          modules.push({ plugin, source });
        } catch (error) {
          await recordRuntimeFailure(plugin.manifest.id, getErrorMessage(error));
        }
      }

      return modules;
    },
  };
}

function readRegistry(pluginsDirectory: string): InstalledPluginRecord[] {
  const registryPath = getManagedPath(pluginsDirectory, registryFileName);
  if (!existsSync(registryPath)) {
    return [];
  }

  try {
    const value = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
    return Array.isArray(value) ? value.flatMap(sanitizeRecord).sort(compareRecords) : [];
  } catch {
    return [];
  }
}

function sanitizeRecord(value: unknown): InstalledPluginRecord[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidate = value as Partial<InstalledPluginRecord>;
  if (
    (candidate.status !== "enabled" &&
      candidate.status !== "disabled" &&
      candidate.status !== "degraded") ||
    typeof candidate.installedAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    typeof candidate.failureCount !== "number"
  ) {
    return [];
  }

  try {
    const manifest = validatePluginManifest(candidate.manifest);
    if (!isSafePluginId(manifest.id)) return [];
    return [
      {
        manifest,
        status: candidate.status,
        installedAt: candidate.installedAt,
        updatedAt: candidate.updatedAt,
        failureCount: Math.max(0, Math.floor(candidate.failureCount)),
        ...(typeof candidate.lastError === "string" && candidate.lastError.trim()
          ? { lastError: candidate.lastError.trim() }
          : {}),
      },
    ];
  } catch {
    return [];
  }
}

function writeRegistry(pluginsDirectory: string, records: readonly InstalledPluginRecord[]) {
  const registryPath = getManagedPath(pluginsDirectory, registryFileName);
  const parent = resolve(pluginsDirectory);
  if (!existsSync(parent)) {
    throw new Error("Plugin directory must exist before writing the registry.");
  }

  return writeFile(registryPath, `${JSON.stringify(records, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function readSourceDirectory(sourceDirectory: string) {
  const sourceRoot = await realpath(sourceDirectory);
  const sourceStats = await stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    throw new Error("Plugin source must be a directory.");
  }

  return sourceRoot;
}

async function readManifest(sourceRoot: string) {
  const manifestPath = resolve(sourceRoot, "plugin.json");
  if (!isWithinDirectory(sourceRoot, manifestPath)) {
    throw new Error("Plugin manifest path is invalid.");
  }

  const manifestText = await readFile(manifestPath, "utf8");
  if (Buffer.byteLength(manifestText, "utf8") > 64 * 1024) {
    throw new Error("Plugin manifest is too large.");
  }

  const manifest = validatePluginManifest(JSON.parse(manifestText) as unknown);
  if (!isSafePluginId(manifest.id)) {
    throw new Error("Plugin id is invalid.");
  }

  return manifest;
}

async function resolvePluginEntry(root: string, entry: string) {
  if (isAbsolute(entry) || entry.includes("\\")) {
    throw new Error("Plugin entry path is invalid.");
  }

  const resolvedEntry = resolve(root, entry);
  if (
    !isWithinDirectory(root, resolvedEntry) ||
    ![".js", ".mjs"].includes(extname(resolvedEntry))
  ) {
    throw new Error("Plugin entry path is invalid.");
  }

  const realEntry = await realpath(resolvedEntry);
  if (!isWithinDirectory(root, realEntry)) {
    throw new Error("Plugin entry path escapes the package directory.");
  }

  const entryStats = await stat(realEntry);
  if (!entryStats.isFile()) {
    throw new Error("Plugin entry must be a JavaScript file.");
  }

  return realEntry;
}

async function copyPluginDirectory(source: string, destination: string) {
  let totalBytes = 0;

  const copyDirectory = async (from: string, to: string): Promise<void> => {
    await mkdir(to, { recursive: true, mode: 0o700 });
    const entries = await readdir(from, { withFileTypes: true });

    for (const entry of entries) {
      const fromPath = join(from, entry.name);
      const toPath = join(to, entry.name);
      const entryStats = await lstat(fromPath);
      if (entryStats.isSymbolicLink()) {
        throw new Error(`Plugin package cannot contain symbolic links: ${entry.name}`);
      }

      if (entryStats.isDirectory()) {
        await copyDirectory(fromPath, toPath);
        continue;
      }

      if (!entryStats.isFile()) {
        throw new Error(`Plugin package contains an unsupported entry: ${entry.name}`);
      }

      totalBytes += entryStats.size;
      if (totalBytes > maxPackageBytes) {
        throw new Error(`Plugin package exceeds ${maxPackageBytes} bytes.`);
      }

      await copyFile(fromPath, toPath);
    }
  };

  await copyDirectory(source, destination);
}

function getPluginDirectory(pluginsDirectory: string, pluginId: string) {
  if (!isSafePluginId(pluginId)) {
    throw new Error("Plugin id is invalid.");
  }

  return getManagedPath(pluginsDirectory, pluginId);
}

function getManagedPath(pluginsDirectory: string, child: string) {
  const root = resolve(pluginsDirectory);
  const target = resolve(root, child);
  if (!isWithinDirectory(root, target)) {
    throw new Error("Plugin storage path is invalid.");
  }

  return target;
}

function isWithinDirectory(root: string, target: string) {
  const relativePath = relative(resolve(root), resolve(target));
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isSafePluginId(pluginId: string) {
  return pluginIdPattern.test(pluginId) && !pluginId.includes("..");
}

function canRunInRenderer(manifest: PluginManifest) {
  const supportedCapabilities = new Set(["strategy", "indicator"]);
  const supportedPermissions = new Set([
    "market-data:read",
    "strategy:run",
    "chart:overlay",
    "settings:read",
  ]);
  return (
    manifest.capabilities.every((capability) => supportedCapabilities.has(capability)) &&
    manifest.permissions.every((permission) => supportedPermissions.has(permission))
  );
}

function assertCompatibleManifest(manifest: PluginManifest) {
  parseVersion(manifest.version);
  if (!isCompatibleVersionRange(manifest.engine.app, appVersion)) {
    throw new Error(
      `Plugin requires app version ${manifest.engine.app}; current version is ${appVersion}.`,
    );
  }
  if (!isCompatibleVersionRange(manifest.engine.pluginApi, pluginApiVersion)) {
    throw new Error(
      `Plugin requires plugin API version ${manifest.engine.pluginApi}; current version is ${pluginApiVersion}.`,
    );
  }
}

function isCompatibleVersionRange(range: string | undefined, currentVersion: string) {
  if (!range) return true;
  const current = parseVersion(currentVersion);
  const minimumMatch = /^>=\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(range);
  if (minimumMatch) {
    return compareVersions(current, parseVersion(minimumMatch[1])) >= 0;
  }
  return range === currentVersion;
}

function parseVersion(value: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
  if (!match) {
    throw new Error(`Plugin version range is invalid: ${value}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}

function compareVersions(
  left: ReturnType<typeof parseVersion>,
  right: ReturnType<typeof parseVersion>,
) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (left.prerelease === right.prerelease) return 0;
  return left.prerelease ? -1 : 1;
}

function assertSelfContainedRuntimeSource(source: string) {
  if (/\bimport\s*(?:\(|[\s{"'])/u.test(source)) {
    throw new Error(
      "Plugin runtime modules must be self-contained and cannot import additional modules.",
    );
  }
}

function compareRecords(left: InstalledPluginRecord, right: InstalledPluginRecord) {
  return (
    left.manifest.name.localeCompare(right.manifest.name) ||
    left.manifest.id.localeCompare(right.manifest.id)
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : "Plugin runtime failed.";
}

function sanitizeRuntimeError(message: string) {
  const normalized = message.trim().replace(/\s+/gu, " ");
  return (normalized || "插件运行失败。").slice(0, 800);
}
