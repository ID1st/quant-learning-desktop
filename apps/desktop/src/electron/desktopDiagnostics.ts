import {
  app,
  crashReporter,
  dialog,
  type App,
  type RenderProcessGoneDetails,
  type WebContents,
} from "electron";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";

import {
  containsDiagnosticSecrets,
  createLocalCrashReporterOptions,
  createTarGzip,
  redactDiagnosticText,
  type DiagnosticArchiveEntry,
} from "./diagnosticsCore.ts";
import type {
  DiagnosticExportResult,
  DiagnosticPackageExporter,
} from "./diagnosticsIpcContract.ts";

const maximumTextFileBytes = 2 * 1024 * 1024;
const maximumMinidumpBytes = 20 * 1024 * 1024;
const maximumMinidumpTotalBytes = 50 * 1024 * 1024;

export interface DesktopDiagnosticsRuntime extends DiagnosticPackageExporter {
  log(level: "info" | "warn" | "error", event: string, detail?: unknown): void;
  dispose(): void;
}

interface DiagnosticManifest {
  readonly createdAt: string;
  readonly application: {
    readonly name: string;
    readonly version: string;
    readonly electronVersion: string;
    readonly platform: string;
    readonly architecture: string;
  };
  readonly privacy: {
    readonly textRedaction: string;
    readonly minidumpPolicy: string;
    readonly remoteUploadEnabled: false;
  };
  readonly included: string[];
  readonly excludedMinidumps: Array<{ readonly fileName: string; readonly reason: string }>;
}

export function startDesktopDiagnostics(): DesktopDiagnosticsRuntime {
  crashReporter.start(createLocalCrashReporterOptions(process.env.QUANT_RELEASE_CHANNEL));

  const logsDirectory = app.getPath("logs");
  const mainLogPath = join(logsDirectory, "main.log");
  const rendererCrashPath = join(logsDirectory, "renderer-crashes.jsonl");
  mkdirSync(logsDirectory, { recursive: true });

  const log = (level: "info" | "warn" | "error", event: string, detail?: unknown) => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event: redactDiagnosticText(event).slice(0, 200),
      ...(detail === undefined ? {} : { detail: sanitizeDiagnosticValue(detail) }),
    };
    appendFileSync(mainLogPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  };

  const handleRendererGone = (
    _event: Electron.Event,
    webContents: WebContents,
    details: RenderProcessGoneDetails,
  ) => {
    const record = {
      timestamp: new Date().toISOString(),
      webContentsId: webContents.id,
      reason: details.reason,
      exitCode: details.exitCode,
    };
    appendFileSync(rendererCrashPath, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    log("error", "renderer-process-gone", record);
  };
  app.on("render-process-gone", handleRendererGone);

  const handleUncaughtException = (error: Error) => {
    log("error", "uncaught-exception", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  };
  process.on("uncaughtExceptionMonitor", handleUncaughtException);
  log("info", "desktop-process-started", { crashUploadEnabled: false });

  return {
    log,
    exportPackage: () =>
      exportDiagnosticPackage({
        electronApp: app,
        mainLogPath,
        rendererCrashPath,
      }),
    dispose() {
      app.removeListener("render-process-gone", handleRendererGone);
      process.removeListener("uncaughtExceptionMonitor", handleUncaughtException);
    },
  };
}

interface ExportDiagnosticPackageOptions {
  readonly electronApp: App;
  readonly mainLogPath: string;
  readonly rendererCrashPath: string;
}

async function exportDiagnosticPackage(
  options: ExportDiagnosticPackageOptions,
): Promise<DiagnosticExportResult> {
  try {
    const timestamp = new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replace(/\.\d{3}Z$/u, "Z");
    const fileName = `quant-learning-diagnostics-${timestamp}.tar.gz`;
    const selection = await dialog.showSaveDialog({
      title: "导出脱敏诊断包",
      defaultPath: join(options.electronApp.getPath("documents"), fileName),
      filters: [{ name: "压缩诊断包", extensions: ["gz"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
    });
    if (selection.canceled || !selection.filePath) {
      return {
        ok: false,
        error: { code: "CANCELLED", message: "已取消诊断包导出。" },
      };
    }

    const { entries, manifest } = collectDiagnosticEntries(options);
    const manifestEntry: DiagnosticArchiveEntry = {
      path: "manifest.json",
      data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    };
    writeFileSync(selection.filePath, createTarGzip([manifestEntry, ...entries]), {
      mode: 0o600,
    });
    return {
      ok: true,
      data: {
        fileName: basename(selection.filePath),
        includedMinidumps: manifest.included.filter((entry) => entry.startsWith("minidumps/"))
          .length,
        excludedMinidumps: manifest.excludedMinidumps.length,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "EXPORT_FAILED",
        message: "诊断包导出失败。原始日志和崩溃文件仍保留在本机。",
      },
    };
  }
}

function collectDiagnosticEntries(options: ExportDiagnosticPackageOptions): {
  readonly entries: DiagnosticArchiveEntry[];
  readonly manifest: DiagnosticManifest;
} {
  const entries: DiagnosticArchiveEntry[] = [];
  const included: string[] = [];
  const excludedMinidumps: Array<{ fileName: string; reason: string }> = [];
  addSanitizedTextFile(entries, included, options.mainLogPath, "logs/main.log");
  addSanitizedTextFile(entries, included, options.rendererCrashPath, "logs/renderer-crashes.jsonl");

  let minidumpTotalBytes = 0;
  for (const path of listMinidumps(options.electronApp.getPath("crashDumps"))) {
    const fileName = basename(path);
    const size = statSync(path).size;
    if (size > maximumMinidumpBytes || minidumpTotalBytes + size > maximumMinidumpTotalBytes) {
      excludedMinidumps.push({ fileName, reason: "size-limit" });
      continue;
    }
    const data = readFileSync(path);
    if (containsDiagnosticSecrets(data)) {
      excludedMinidumps.push({ fileName, reason: "sensitive-pattern-detected" });
      continue;
    }
    const archivePath = `minidumps/${fileName}`;
    entries.push({ path: archivePath, data });
    included.push(archivePath);
    minidumpTotalBytes += size;
  }

  return {
    entries,
    manifest: {
      createdAt: new Date().toISOString(),
      application: {
        name: options.electronApp.getName(),
        version: options.electronApp.getVersion(),
        electronVersion: process.versions.electron ?? "unknown",
        platform: process.platform,
        architecture: process.arch,
      },
      privacy: {
        textRedaction: "Email, credentials, bearer/JWT tokens, URL secrets and codes are removed.",
        minidumpPolicy:
          "Raw dumps are included only below size limits and when the local sensitive-pattern scan is clear.",
        remoteUploadEnabled: false,
      },
      included,
      excludedMinidumps,
    },
  };
}

function addSanitizedTextFile(
  entries: DiagnosticArchiveEntry[],
  included: string[],
  sourcePath: string,
  archivePath: string,
) {
  try {
    const source = readFileSync(sourcePath);
    const bounded = source.subarray(Math.max(0, source.byteLength - maximumTextFileBytes));
    entries.push({
      path: archivePath,
      data: Buffer.from(redactDiagnosticText(bounded.toString("utf8")), "utf8"),
    });
    included.push(archivePath);
  } catch {
    // Missing diagnostic files are expected before the first matching event.
  }
}

function listMinidumps(root: string): string[] {
  try {
    const result: string[] = [];
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && extname(entry.name).toLowerCase() === ".dmp") {
        result.push(join(entry.parentPath, entry.name));
      }
    }
    return result.sort();
  } catch {
    return [];
  }
}

function sanitizeDiagnosticValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactDiagnosticText(value).slice(0, 8_000);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map(sanitizeDiagnosticValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [
          redactDiagnosticText(key).slice(0, 120),
          isSensitiveDiagnosticKey(key) ? "[REDACTED]" : sanitizeDiagnosticValue(item),
        ]),
    );
  }
  return String(value);
}

function isSensitiveDiagnosticKey(key: string) {
  return /(?:token|secret|password|passwd|credential|authorization|cookie|api[_-]?key|invite[_-]?code|verification[_-]?code|otp)/iu.test(
    key,
  );
}
