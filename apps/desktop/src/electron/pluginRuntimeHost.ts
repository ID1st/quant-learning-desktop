import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { StrategyInput, StrategyOutput } from "@quant/strategy-engine";
import type { PluginManager } from "./pluginManager.ts";
import type {
  PluginRuntimeHostRequest,
  PluginRuntimeHostResponse,
  PluginRuntimeSnapshot,
} from "./pluginRuntimeProtocol.ts";

const operationTimeoutMs = 1_500;
const require = createRequire(import.meta.url);

interface PluginUtilityProcessLike {
  postMessage(message: PluginRuntimeHostRequest): void;
  kill(): boolean;
  on(event: "message", listener: (message: PluginRuntimeHostResponse) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
}

export interface PluginRuntimeHost {
  refresh(): Promise<PluginRuntimeSnapshot>;
  runStrategy(pluginId: string, key: string, input: StrategyInput): Promise<StrategyOutput>;
  dispose(): void;
}

export interface PluginRuntimeHostOptions {
  readonly manager: PluginManager;
  readonly spawn?: () => PluginUtilityProcessLike;
  readonly operationTimeoutMs?: number;
}

export function createPluginRuntimeHost(options: PluginRuntimeHostOptions): PluginRuntimeHost {
  const timeoutMs = options.operationTimeoutMs ?? operationTimeoutMs;
  const spawn = options.spawn ?? createElectronPluginUtilityProcess;
  let child: PluginUtilityProcessLike | null = null;
  const pending = new Map<string, { resolve(response: PluginRuntimeHostResponse): void; reject(error: Error): void; timeout: ReturnType<typeof setTimeout> }>();

  const stopChild = (reason?: string) => {
    if (!child) return;
    const current = child;
    child = null;
    current.kill();
    const error = new Error(reason ?? "Plugin isolated runtime stopped.");
    pending.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(error);
    });
    pending.clear();
  };

  const ensureChild = () => {
    if (child) return child;
    const next = spawn();
    next.on("message", (response) => {
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      clearTimeout(request.timeout);
      request.resolve(response);
    });
    next.on("exit", () => {
      if (child === next) {
        child = null;
        const error = new Error("Plugin isolated runtime exited unexpectedly.");
        pending.forEach(({ reject, timeout }) => {
          clearTimeout(timeout);
          reject(error);
        });
        pending.clear();
      }
    });
    child = next;
    return next;
  };

  const request = async (createRequest: (id: string) => PluginRuntimeHostRequest) => {
    const id = randomUUID();
    const response = await new Promise<PluginRuntimeHostResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        stopChild("Plugin isolated runtime timed out and was terminated.");
        reject(new Error("Plugin isolated runtime timed out and was terminated."));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timeout });
      ensureChild().postMessage(createRequest(id));
    });
    if (!response.ok) throw new Error(response.message);
    return response;
  };

  return {
    async refresh() {
      const modules = await options.manager.readEnabledRuntimeModules();
      const response = await request((id) => ({ id, type: "refresh", modules }));
      if (response.type !== "refresh") throw new Error("Plugin isolated runtime returned an invalid refresh response.");
      for (const failure of response.snapshot.failures) {
        await options.manager.recordRuntimeFailure(failure.pluginId, failure.message);
      }
      return response.snapshot;
    },
    async runStrategy(pluginId, key, input) {
      try {
        const response = await request((id) => ({ id, type: "run-strategy", pluginId, key, input }));
        if (response.type !== "run-strategy") throw new Error("Plugin isolated runtime returned an invalid strategy response.");
        return response.output;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Plugin runtime failed.";
        await options.manager.recordRuntimeFailure(pluginId, message);
        throw error;
      }
    },
    dispose() {
      stopChild();
    },
  };
}

function createElectronPluginUtilityProcess(): PluginUtilityProcessLike {
  const { utilityProcess } = require("electron") as { utilityProcess: { fork(modulePath: string, args: string[], options: Record<string, unknown>): PluginUtilityProcessLike } };
  const child = utilityProcess.fork(resolvePluginUtilityProcessEntry(), [], {
    stdio: "ignore",
    serviceName: "Quant Plugin Runtime",
  });
  return child;
}

function resolvePluginUtilityProcessEntry() {
  const siblingEntry = join(__dirname, "pluginUtilityProcess.js");
  // electron-vite can move this host into `out/main/chunks`; the independently
  // bundled utility-process entry remains at `out/main`.
  return existsSync(siblingEntry) ? siblingEntry : join(__dirname, "..", "pluginUtilityProcess.js");
}
